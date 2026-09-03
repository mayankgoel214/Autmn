/**
 * Image processing job handler.
 *
 * Runs the AI pipeline (primary: Bria Product Shot, fallback: multi-stage)
 * and delivers results via WhatsApp.
 */

import type { Job } from 'bullmq';
import { prisma } from '@autmn/db';
import type { ImageJob } from '@autmn/db';
import { processImageNeverFail, downloadBuffer, classifyFailure, NeverFailRefundRequiredError, type NeverFailResult } from '@autmn/ai';
import { uploadFile, Buckets, isOwnStorageUrl } from '@autmn/storage';
import { WhatsAppClient } from '@autmn/whatsapp';
// Phase 13 — the worker is now silent between PROCESSING-start (handled by
// the session layer) and the actual image delivery. msgProgressReadyToSend
// stays — it is a CDN-load buffer right before the images, not a status
// update during processing.
import { sendProcessedImages, msgProgressReadyToSend, msgPhotoProcessingFailed, msgProcessingDelay, fetchBrandContextForUser } from '@autmn/session';
import type { Language } from '@autmn/session';
import { ImageProcessingJobDataSchema, getImageQueue } from '@autmn/queue';
import { getConfig } from '../config.js';

// Transient failures keep retrying until this long after the order started
// processing; only then does a still-failing transient error become a refund.
const TRANSIENT_RETRY_WINDOW_MS = 45 * 60 * 1000; // 45 minutes
const RETRY_MAX_DELAY_MS = 5 * 60 * 1000;         // cap backoff at 5 min
// Hard backstop on per-image retries. The 45-min window is the primary stop;
// this bounds AI spend if a style flaps transiently fast within that window
// (each retry costs a full tier-1+tier-2 budget). Past this we refund.
const MAX_PER_IMAGE_RETRIES = 8;

// Phase 13 — the in-flight progress-update helper was removed. The worker no
// longer emits status messages during PROCESSING; the user sees the single
// processing-estimate message at transition time and then nothing until the
// ads arrive.

export async function processImageJob(job: Job): Promise<void> {
  const config = getConfig();
  const data = ImageProcessingJobDataSchema.parse(job.data);

  // Bug 3 fix: compute effectiveStyle early so ALL cache keys are consistent.
  // style_video_shoot maps to style_autmn_special. If this is declared later
  // (as it was), the profile is written under data.style but looked up under
  // effectiveStyle → guaranteed cache miss for video-shoot orders.
  const effectiveStyle: string = data.style === 'style_video_shoot'
    ? 'style_autmn_special'
    : (data.style ?? 'style_lifestyle');

  const log = (msg: string, extra?: Record<string, unknown>) => {
    const line = JSON.stringify({ job: job.id, orderId: data.orderId, msg, ...extra });
    console.log(line);
  };

  log('=== STARTING IMAGE PROCESSING ===', { style: data.style, imageUrl: data.inputImageUrl.slice(0, 80) });

  // Fetch the imageJob record to get styleIndex (used for progress update gating)
  const imageJobRecord = await prisma.imageJob.findUnique({
    where: { id: data.imageJobId },
    select: { styleIndex: true },
  }).catch(() => null);
  const styleIndex = imageJobRecord?.styleIndex ?? 0;
  const isFirstJob = styleIndex === 0;

  // Fetch the user's language early — needed for progress messages
  const userForLang = await prisma.user.findUnique({
    where: { phoneNumber: data.phoneNumber },
    select: { language: true },
  }).catch(() => null);
  const lang = (userForLang?.language as Language) || 'hi';

  // Update job status
  await prisma.imageJob.update({
    where: { id: data.imageJobId },
    data: { status: 'processing', startedAt: new Date(), attempts: { increment: 1 } },
  }).catch((err) => {
    console.error(JSON.stringify({
      event: 'db_update_failed',
      error: err instanceof Error ? err.message : String(err),
      context: 'imageJob_mark_processing',
    }));
  }); // Job record might not exist for edits

  // V5 pipeline handles its own lightweight analysis (lightAnalyze, ~3s).
  // V4's heavy analyzeProductV4 (24s, 42 fields) has been removed.
  const productProfile: any = null;

  try {
    // Declare shared output variables — all set by the normal pipeline path.
    // eslint-disable-next-line prefer-const
    let outputUrl!: string;
    let cutoutUrl: string | undefined;
    let completionWon = false; // true only if THIS run won the atomic completion claim

    {
      // ── Normal image pipeline ─────────────────────────────────────────────
      log('Using Never-Fail pipeline (V5)');

      // Phase 13: removed the first-job initial-progress sendText AND the
      // 90-second intermediate-progress timer. The user gets the single
      // processing-estimate message at PROCESSING transition (from the
      // session layer) and then silence until the ads land.

      // Download reference photos (all inputImageUrls except index 0, which is the primary)
      // The primary URL is already downloaded inside the pipeline via params.imageUrl.
      const orderForRefs = await prisma.order.findUnique({
        where: { id: data.orderId },
        select: { inputImageUrls: true },
      }).catch(() => null);

      const allInputUrls = (orderForRefs?.inputImageUrls ?? []) as string[];
      const referenceUrls = allInputUrls.slice(1); // skip index 0 (primary)
      const referenceImageBuffers: Buffer[] = [];

      for (const url of referenceUrls) {
        try {
          const buf = await downloadBuffer(url);
          referenceImageBuffers.push(buf);
        } catch (err) {
          console.warn(JSON.stringify({
            event: 'reference_download_failed',
            url,
            error: err instanceof Error ? err.message : String(err),
          }));
          // Continue — a missing reference is not fatal
        }
      }

      if (referenceImageBuffers.length > 0) {
        console.info(JSON.stringify({
          event: 'reference_buffers_ready',
          orderId: data.orderId,
          referenceCount: referenceImageBuffers.length,
        }));
      }

      // Phase 5 — fetch the user's brand context and thread it into the
      // pipeline. INCLUDE_BRAND_CONTEXT=false flips the kill switch for the
      // A/B experiment called out in the plan (default: include).
      const includeBrand = process.env.INCLUDE_BRAND_CONTEXT !== 'false';
      let brandContext: Awaited<ReturnType<typeof fetchBrandContextForUser>> = undefined;
      if (includeBrand) {
        try {
          brandContext = await fetchBrandContextForUser(data.phoneNumber);
        } catch (err) {
          // Non-fatal — a brand-context lookup failure must not kill an order.
          console.warn(JSON.stringify({
            event: 'brand_context_fetch_failed',
            phoneNumber: data.phoneNumber,
            error: err instanceof Error ? err.message.slice(0, 200) : String(err),
          }));
        }
      }
      if (brandContext) {
        console.info(JSON.stringify({
          event: 'brand_context_injected',
          orderId: data.orderId,
          phoneNumber: data.phoneNumber,
          hasTagline: !!brandContext.tagline,
          hasVibe: !!brandContext.vibe,
          colorCount: brandContext.brandColors?.length ?? 0,
          hasSummary: !!brandContext.summary,
        }));
      }

      const result = await processImageNeverFail({
        imageUrl: data.inputImageUrl,
        style: effectiveStyle,
        productCategory: data.productCategory,
        brandName: data.brandName,
        voiceInstructions: data.voiceInstructions,
        originalVoiceInstructions: data.originalVoiceInstructions,
        referenceImageBuffers: referenceImageBuffers.length > 0 ? referenceImageBuffers : undefined,
        brandContext,
      });

      // Phase 13: no intermediate-progress timer to cancel — removed above.

      log(`Pipeline complete`, {
        tier: result.tier,
        tierReason: result.tierReason,
        pipeline: result.pipeline,
        qaScore: result.qaScore,
        durationMs: result.durationMs,
      });

      await job.updateProgress(80);

      // Use pipeline output URL directly if it's already in Supabase storage
      // (the pipeline uploads internally via uploadToStorage)
      outputUrl = result.outputUrl;
      if (!isOwnStorageUrl(outputUrl)) {
        // Only re-upload if it's a temporary URL (fal.ai, data URL, etc.)
        const outputPath = `${data.orderId}/${data.imageJobId}-output.jpg`;
        const outputBuffer = await fetch(outputUrl).then((r) => r.arrayBuffer());
        outputUrl = await uploadFile(
          Buckets.PROCESSED_IMAGES,
          outputPath,
          Buffer.from(outputBuffer),
          'image/jpeg',
        );
      }

      // Use cutout URL directly if already in Supabase, otherwise re-upload
      if (result.cutoutUrl && result.cutoutUrl.startsWith('http')) {
        if (isOwnStorageUrl(result.cutoutUrl)) {
          cutoutUrl = result.cutoutUrl;
        } else try {
          const cutoutPath = `${data.orderId}/${data.imageJobId}-cutout.png`;
          const cutoutBuffer = await fetch(result.cutoutUrl).then((r) => r.arrayBuffer());
          cutoutUrl = await uploadFile(
            Buckets.PROCESSED_IMAGES,
            cutoutPath,
            Buffer.from(cutoutBuffer),
            'image/png',
          );
        } catch {
          // Cutout upload is non-critical — continue without it
          cutoutUrl = result.cutoutUrl;
        }
      }

      await job.updateProgress(90);

      // Map pipeline string to Prisma enum — new never-fail tier names fall back to 'fallback'
      const PIPELINE_ENUM_MAP: Record<string, string> = {
        composite: 'composite',
        bria: 'bria',
        'bria-fallback': 'bria',
        kontext: 'kontext',
        segmentation: 'segmentation',
        nano_banana: 'nano_banana',
        primary: 'primary',
        fallback: 'fallback',
        'styled-studio': 'fallback',
        'styled-studio-fallback': 'fallback',
        'clean-studio': 'fallback',
        'enhanced-original': 'fallback',
        'raw-input': 'fallback',
        'tier4-enhanced': 'fallback',
      };
      const pipelineEnum = (PIPELINE_ENUM_MAP[result.pipeline] ?? 'fallback') as any;

      // Atomically CLAIM the completion. updateMany with a "not already
      // completed" guard means a BullMQ re-delivery of the SAME job (e.g. after
      // a lock timeout) can't run the completion side effects — most importantly
      // the cost accumulation below — twice. Only the first transition wins.
      const completionClaim = await prisma.imageJob.updateMany({
        where: { id: data.imageJobId, status: { not: 'completed' } },
        data: {
          status: 'completed',
          outputImageUrl: outputUrl,
          cutoutUrl,
          qaScore: result.qaScore,
          qaAttempts: result.attempts,
          pipeline: pipelineEnum,
          durationMs: result.durationMs,
          completedAt: new Date(),
        },
      }).catch((err) => {
        console.error(JSON.stringify({
          event: 'db_update_failed',
          error: err instanceof Error ? err.message : String(err),
          context: 'imageJob_mark_completed',
        }));
        return { count: 0 };
      });
      completionWon = completionClaim.count > 0;

      // Accumulate this style's real INR cost onto the order for margin
      // tracking — ONLY when we won the completion claim, so a re-delivered job
      // never double-bills. Atomic COALESCE so parallel style jobs each add
      // their own share without a read-modify-write race; null column starts at
      // 0. Non-fatal: a cost-tracking miss must never fail a delivered image.
      if (completionWon && typeof result.costInr === 'number' && result.costInr > 0) {
        await prisma.$executeRaw`
          UPDATE "orders"
          SET "actual_cost_inr" = COALESCE("actual_cost_inr", 0) + ${result.costInr}
          WHERE "id" = ${data.orderId}::uuid
        `.catch((err) => {
          console.error(JSON.stringify({
            event: 'cost_accumulate_failed',
            orderId: data.orderId,
            addedInr: result.costInr,
            error: err instanceof Error ? err.message : String(err),
          }));
        });
      }
    } // end of normal image pipeline branch

    // Update order — add output URL. Gate on the won completion claim so a
    // re-delivered job (claim lost) doesn't push a duplicate URL onto the order.
    const order = await prisma.order.findUnique({ where: { id: data.orderId } });
    if (order) {
      if (completionWon) {
        await prisma.order.update({
          where: { id: data.orderId },
          data: {
            outputImageUrls: { push: outputUrl },
            cutoutUrls: cutoutUrl ? { push: cutoutUrl } : undefined,
          },
        });
      }

      // Check if all images in the current round are done.
      const allJobs = await prisma.imageJob.findMany({
        where: { orderId: data.orderId },
      });

      // For edit/redo: only look at jobs created after the last processingStartedAt.
      // For initial orders: look at ALL jobs.
      // isEditRound is determined by job count — more jobs than imageCount means a
      // previous round exists, so we are in an edit round.
      const isEditRound = allJobs.length > (order.imageCount ?? 0);
      const currentRoundJobs = isEditRound && order.processingStartedAt
        ? allJobs.filter((j: ImageJob) => {
            const jobCreated = new Date(j.createdAt).getTime();
            const roundStart = new Date(order.processingStartedAt!).getTime();
            return jobCreated >= roundStart - 5000; // 5s buffer for clock skew
          })
        : allJobs;

      const allComplete = currentRoundJobs.length > 0 && currentRoundJobs.every(
        (j: ImageJob) => j.status === 'completed' || j.status === 'failed',
      );

      if (allComplete) {
        const jobsForDelivery = isEditRound ? currentRoundJobs : allJobs;

        const completedJobs = jobsForDelivery.filter(
          (j: ImageJob) => j.status === 'completed' && j.outputImageUrl,
        );
        const completedUrls = completedJobs.map((j: ImageJob) => j.outputImageUrl!);

        const sortedCompletedJobs = [...completedJobs].sort(
          (a: ImageJob, b: ImageJob) => (a.styleIndex ?? 0) - (b.styleIndex ?? 0),
        );

        const sortedCompletedUrls = sortedCompletedJobs.map((j: ImageJob) => j.outputImageUrl!);
        const styleLabels = sortedCompletedJobs
          .map((j: ImageJob) => j.style ?? null)
          .filter((s): s is string => s !== null);

        // Fetch the user record — needed for both delivery paths below
        const user = await prisma.user.findUnique({
          where: { phoneNumber: data.phoneNumber },
        });

        // ── Atomic delivery lock ─────────────────────────────────────────────
        // Only ONE worker may deliver by claiming the transition to 'completed'
        // BEFORE sending images. If another worker already claimed it (count=0),
        // check whether this is a style-change edit that still needs delivery.
        const deliveryClaim = await prisma.order.updateMany({
          where: {
            id: data.orderId,
            status: { in: ['processing', 'payment_confirmed'] },
          },
          data: {
            status: 'completed',
            outputImageUrls: sortedCompletedUrls,
            processingCompletedAt: new Date(),
          },
        });

        if (deliveryClaim.count === 0) {
          // Another worker already claimed delivery. Check for style-change edit path
          // where the session is EDIT_PROCESSING — that still requires sending the new output.
          if (!user) {
            log('Delivery already claimed by another worker — skipping');
            return;
          }
          const currentSession = await prisma.session.findFirst({ where: { userId: user.id } });
          const isStyleChangeEdit = currentSession?.state === 'EDIT_PROCESSING';
          // Gate on completionWon: a genuine style-change edit job won its own
          // completion claim (this run produced the new output). A BullMQ
          // re-delivery of an already-completed job did NOT (completionWon=false)
          // — skip so we don't duplicate-send the same image.
          if (isStyleChangeEdit && completionWon) {
            log('Style-change edit delivery — order already marked complete, sending output and feedback buttons');
            const wa = new WhatsAppClient({
              accessToken: config.WHATSAPP_ACCESS_TOKEN,
              phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
            });
            await sendProcessedImages(
              data.phoneNumber,
              [outputUrl],
              (user?.language as 'hi' | 'en') || 'hi',
              user?.name ?? undefined,
              wa,
              [],
              [],
              effectiveStyle ? [effectiveStyle] : undefined,
            );
            await prisma.session.updateMany({
              where: { userId: user.id, state: 'EDIT_PROCESSING' },
              data: { state: 'DELIVERED', stateEnteredAt: new Date() },
            });
          } else {
            log('Delivery already claimed by another worker — skipping');
          }
          return;
        }

        // We won the atomic race — now deliver. If delivery fails, the order is
        // already marked complete so the user can retry via "Make a change".
        const wa = new WhatsAppClient({
          accessToken: config.WHATSAPP_ACCESS_TOKEN,
          phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
        });

        // Re-fetch authoritative output URLs from image_jobs to avoid race condition
        // where order.output_image_urls is stale (concurrent workers may not have
        // committed their imageJob updates at the time allJobs was first fetched).
        const expectedJobCount = currentRoundJobs.length;
        let deliveryJobs = await prisma.imageJob.findMany({
          where: {
            orderId: data.orderId,
            status: 'completed',
            outputImageUrl: { not: null },
          },
          orderBy: { styleIndex: 'asc' },
          select: {
            styleIndex: true,
            outputImageUrl: true,
            cutoutUrl: true,
            style: true,
          },
        });

        if (deliveryJobs.length < expectedJobCount) {
          // In-flight DB commits from concurrent workers haven't landed yet — wait briefly
          await new Promise(r => setTimeout(r, 1500));
          const retryJobs = await prisma.imageJob.findMany({
            where: {
              orderId: data.orderId,
              status: 'completed',
              outputImageUrl: { not: null },
            },
            orderBy: { styleIndex: 'asc' },
            select: {
              styleIndex: true,
              outputImageUrl: true,
              cutoutUrl: true,
              style: true,
            },
          });
          if (retryJobs.length > deliveryJobs.length) {
            deliveryJobs = retryJobs;
          }
        }

        const finalOutputUrls = deliveryJobs.map(j => j.outputImageUrl!).filter(Boolean);
        const finalStyleLabels = deliveryJobs.map(j => j.style ?? '').filter(Boolean);

        console.info(JSON.stringify({
          event: 'delivery_url_collection',
          orderId: data.orderId,
          expectedCount: expectedJobCount,
          collectedCount: finalOutputUrls.length,
          retried: deliveryJobs.length < expectedJobCount,
        }));

        // Send "Ready!" signal before images — gives images time to load on slow connections
        try {
          await wa.sendText(data.phoneNumber, msgProgressReadyToSend((user?.language as 'hi' | 'en') || 'hi'));
          await new Promise(r => setTimeout(r, 2000)); // 2s gap so message arrives before images
        } catch (err) {
          console.warn(JSON.stringify({ event: 'progress_ready_to_send_failed', error: String(err) }));
        }

        // Styles attempted this round that ended terminally failed (BUG 3:
        // the delivery copy must acknowledge them and count only what shipped).
        const failedThisRound = currentRoundJobs.filter(
          (j: ImageJob) => j.status === 'failed',
        ).length;

        await sendProcessedImages(
          data.phoneNumber,
          finalOutputUrls,
          (user?.language as 'hi' | 'en') || 'hi',
          (user as any)?.brandName ?? user?.name ?? undefined,
          wa,
          [],
          [],
          finalStyleLabels.length > 0 ? finalStyleLabels : undefined,
          failedThisRound,
        );

        // Persist the styles used in this order as savedStyles on the user
        if (user && finalStyleLabels.length > 0) {
          await prisma.user.update({
            where: { phoneNumber: data.phoneNumber },
            data: { savedStyles: finalStyleLabels },
          }).catch(() => { /* non-critical */ });
        }

        // Transition session to DELIVERED from PROCESSING, EDIT_PROCESSING, IDLE, or
        // AWAITING_REVISION_PAYMENT. The last case covers a race where the user paid for
        // a revision, the session timed out and moved forward before the job finished, and
        // the worker arrives late — user still needs to see the output.
        if (user) {
          const sessionUpdate = await prisma.session.updateMany({
            where: { userId: user.id, state: { in: ['PROCESSING', 'EDIT_PROCESSING', 'IDLE', 'AWAITING_REVISION_PAYMENT'] } },
            data: { state: 'DELIVERED', stateEnteredAt: new Date() },
          });
          if (sessionUpdate.count > 0) {
            log('Session transitioned to DELIVERED');
          } else {
            log('Session transition skipped — already in correct state or not found');
          }
        }

        await job.updateProgress(100);
        log('All images delivered', { count: completedUrls.length });
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error(JSON.stringify({ event: 'image_processing_failed', job: job.id, orderId: data.orderId, error: errorMsg }));
    log('Image processing failed', { error: errorMsg });

    // Primary signal: the typed error from the pipeline. Fallback: the legacy
    // string marker (kept in the error message), so a future wrapper can't
    // silently break refund routing.
    const needsRefund =
      err instanceof NeverFailRefundRequiredError || errorMsg.includes('[needs_refund: true]');
    let terminalRefund = false; // permanent, or transient past the 45-min window

    if (needsRefund) {
      const classMatch = errorMsg.match(/\[class:\s*(transient|permanent)\]/);
      const failureClass = err instanceof NeverFailRefundRequiredError
        ? err.failureClass
        : (classMatch ? classMatch[1] : classifyFailure(errorMsg));

      // 45-min wall clock — recomputed from DB every run, INDEPENDENT of attempt
      // count. This is the ultimate stop: once elapsed, transient → refund.
      const orderTiming = await prisma.order.findUnique({
        where: { id: data.orderId },
        select: { processingStartedAt: true, createdAt: true },
      }).catch(() => null);
      const windowStart = orderTiming?.processingStartedAt ?? orderTiming?.createdAt ?? new Date(0);
      const elapsedMs = Date.now() - new Date(windowStart).getTime();
      const withinWindow = elapsedMs < TRANSIENT_RETRY_WINDOW_MS;

      // Per-image retry cap (cost backstop). Read current attempts without
      // mutating so we can decide retry-vs-refund; past the cap we fall through
      // to the terminal-refund path below instead of re-queueing forever.
      const attemptsSoFar = await prisma.imageJob
        .findUnique({ where: { id: data.imageJobId }, select: { attempts: true } })
        .catch(() => null);
      // `attempts` is bumped TWICE per retry cycle — once at run-start (status
      // -> processing) and once when a retry is scheduled below — so the
      // effective number of retries is attempts/2. Divide so the cap means what
      // it says (MAX_PER_IMAGE_RETRIES actual retries, not half that).
      const retriesSoFar = Math.floor((attemptsSoFar?.attempts ?? 0) / 2);
      const underRetryCap = retriesSoFar < MAX_PER_IMAGE_RETRIES;

      if (failureClass === 'transient' && withinWindow && underRetryCap) {
        // ── Keep THIS image alive — re-queue with growing backoff. ───────────
        // Atomically INCREMENT attempts and use the returned value, so each
        // retry gets a larger delay and a unique jobId. Independent of the
        // start-of-run increment above (which also bumps it); double-counting
        // only makes backoff grow slightly faster (capped) and is harmless. The
        // 45-min window — not this counter — ends retrying.
        const bumped = await prisma.imageJob.update({
          where: { id: data.imageJobId },
          data: {
            status: 'queued',
            attempts: { increment: 1 },
            errorMessage: `transient retry: ${errorMsg.slice(0, 180)}`,
          },
          select: { attempts: true },
        }).catch(() => null);
        const attemptN = Math.max(1, bumped?.attempts ?? 1);
        const delay = Math.min(RETRY_MAX_DELAY_MS, 30_000 * 2 ** (attemptN - 1))
          + Math.round(Math.random() * 15_000);

        await getImageQueue().add('process_image', data, {
          delay,
          jobId: `process_image_retry_${data.imageJobId}_${attemptN}`, // unique per attempt
        });

        // One-time "taking longer than usual" notice — exactly once per ORDER.
        // Atomic null→timestamp latch: whichever image first retries wins; no
        // further sends for any image or any later retry.
        const noticeClaim = await prisma.order.updateMany({
          where: { id: data.orderId, retryNoticeSentAt: null },
          data: { retryNoticeSentAt: new Date() },
        }).catch(() => ({ count: 0 }));
        if (noticeClaim.count > 0) {
          try {
            const wa = new WhatsAppClient({
              accessToken: config.WHATSAPP_ACCESS_TOKEN,
              phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
            });
            await wa.sendText(data.phoneNumber, msgProcessingDelay(lang));
          } catch (e) {
            console.warn(JSON.stringify({ event: 'retry_notice_send_failed', error: String(e) }));
          }
        }

        console.warn(JSON.stringify({
          event: 'transient_retry_scheduled',
          orderId: data.orderId,
          imageJobId: data.imageJobId,
          attempt: attemptN,
          delayMs: delay,
          elapsedMs,
          windowMs: TRANSIENT_RETRY_WINDOW_MS,
        }));
        return; // order stays 'processing'; no refund, no BullMQ retry consumed
      }

      // Permanent, or transient past the window → THIS image is terminally
      // failed. Do NOT mark the whole order failed here — a sibling may still be
      // retrying or may have already succeeded. Order-level resolution happens
      // below, once ALL siblings are terminal.
      terminalRefund = true;
      console.error(JSON.stringify({
        event: 'image_needs_refund',
        orderId: data.orderId,
        imageJobId: data.imageJobId,
        phoneNumber: data.phoneNumber,
        failureClass,
        elapsedMs,
        windowExceeded: !withinWindow,
        retryCapExceeded: failureClass === 'transient' && withinWindow && !underRetryCap,
        reason: failureClass === 'permanent'
          ? 'Permanent failure — retrying will not help'
          : !withinWindow
            ? 'Transient failures persisted past the 45-minute retry window'
            : `Transient failures hit the per-image retry cap (${MAX_PER_IMAGE_RETRIES})`,
      }));
    }

    // Mark THIS image job failed.
    await prisma.imageJob.update({
      where: { id: data.imageJobId },
      data: {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    }).catch((dbErr) => {
      console.error(JSON.stringify({
        event: 'db_update_failed',
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        context: 'imageJob_mark_failed',
      }));
    });

    // ── Order-level resolution (partial-success aware) ──────────────────────
    const jobRecord = await prisma.imageJob.findUnique({
      where: { id: data.imageJobId },
    });
    const bullmqMaxAttempts = job.opts?.attempts ?? 3;
    const isFinalBullMQAttempt = job.attemptsMade >= bullmqMaxAttempts;
    const isMaxImageJobAttempts = jobRecord ? jobRecord.attempts >= jobRecord.maxAttempts : false;

    if (isFinalBullMQAttempt || isMaxImageJobAttempts || terminalRefund) {
      const user = await prisma.user.findUnique({
        where: { phoneNumber: data.phoneNumber },
      });
      const wa = new WhatsAppClient({
        accessToken: config.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
      });

      const allJobs = await prisma.imageJob.findMany({
        where: { orderId: data.orderId },
      });
      // Resolve ONLY when every sibling is terminal. A still-'queued'/'processing'
      // job (e.g. a sibling validly retrying within its window) defers resolution,
      // so one image's failure never orphans or pre-empts a sibling.
      const allDone = allJobs.length > 0 && allJobs.every(
        (j: ImageJob) => j.status === 'completed' || j.status === 'failed',
      );

      if (allDone) {
        const sortedCompleted = allJobs
          .filter((j: ImageJob) => j.status === 'completed' && j.outputImageUrl)
          .sort((a: ImageJob, b: ImageJob) => (a.styleIndex ?? 0) - (b.styleIndex ?? 0));
        const completedUrls = sortedCompleted.map((j: ImageJob) => j.outputImageUrl!);
        const styleLabels = sortedCompleted.map((j: ImageJob) => j.style ?? '').filter(Boolean);

        // Atomic one-time claim from a non-terminal status. Prevents double
        // delivery (vs the success path) AND double failure-message (vs a
        // sibling finalizer): the target status is NOT in the FROM set, so only
        // the first resolver wins.
        const claim = await prisma.order.updateMany({
          where: { id: data.orderId, status: { in: ['processing', 'payment_confirmed'] } },
          data: {
            status: completedUrls.length > 0 ? 'completed' : 'failed',
            outputImageUrls: completedUrls.length > 0 ? completedUrls : undefined,
            processingCompletedAt: new Date(),
          },
        });

        if (claim.count > 0) {
          if (completedUrls.length > 0) {
            // PARTIAL or full success — deliver whatever succeeded; no refund.
            try {
              await wa.sendText(data.phoneNumber, msgProgressReadyToSend(lang));
              await new Promise((r) => setTimeout(r, 2000));
            } catch { /* non-fatal */ }
            const failedCount = allJobs.filter(
              (j: ImageJob) => j.status === 'failed',
            ).length;
            await sendProcessedImages(
              data.phoneNumber,
              completedUrls,
              lang,
              user?.name ?? undefined,
              wa,
              [],
              [],
              styleLabels.length > 0 ? styleLabels : undefined,
              failedCount,
            );
          } else {
            // ZERO succeeded — full-order refund.
            console.error(JSON.stringify({
              event: 'order_needs_refund',
              orderId: data.orderId,
              phoneNumber: data.phoneNumber,
              reason: 'All images failed — no partial success to deliver',
              action_required: 'Manual Razorpay refund + WhatsApp apology — see incident runbook',
            }));
            await wa.sendText(data.phoneNumber, msgPhotoProcessingFailed(lang));
          }
          if (user) {
            await prisma.session.updateMany({
              where: { userId: user.id, state: 'PROCESSING' },
              data: { state: 'DELIVERED', stateEnteredAt: new Date() },
            });
            log('Session transitioned to DELIVERED (after order resolution)');
          }
        }
      }
    }

    if (terminalRefund) {
      return; // image terminally failed — nothing for BullMQ to retry
    }
    throw err; // non-refund error (download/storage/etc.) — let BullMQ retry
  }
}
