/**
 * Phase 3b — brand-analysis worker processor.
 *
 * Triggered when the user types 'done' in BRAND_DETAILS_COLLECTING. Loads the
 * BrandProfile + its assets, runs per-asset AI analyses in parallel, generates
 * a structured summary, persists the result, and sends the user a "saved"
 * message with the structured profile.
 *
 * Smoke-test ergonomics: setting BRAND_ANALYSIS_DRY_RUN=true skips every real
 * network call (Gemini / Playwright / pdf-parse / asset download) and
 * substitutes deterministic stub descriptions. DB writes and the user
 * notification still happen, so the orchestration shape is fully testable
 * without API quota.
 */

import type { Job } from 'bullmq';
import { prisma } from '@autmn/db';
import { BrandAnalysisJobDataSchema } from '@autmn/queue';
import { WhatsAppClient } from '@autmn/whatsapp';
import {
  analyzeImage,
  analyzePDF,
  scrapeWebsite,
  generateSummary,
  downloadBuffer,
  type AssetDescriptor,
  type BrandSummary,
} from '@autmn/ai';
import { getConfig } from '../config.js';

const URL_REGEX = /https?:\/\/[^\s]+/i;
const DRY_RUN_ENV = 'BRAND_ANALYSIS_DRY_RUN';

function isDryRun(): boolean {
  return process.env[DRY_RUN_ENV] === 'true' || process.env[DRY_RUN_ENV] === '1';
}

// ---------------------------------------------------------------------------
// BullMQ entry point
// ---------------------------------------------------------------------------

export async function processBrandAnalysis(job: Job): Promise<void> {
  const data = BrandAnalysisJobDataSchema.parse(job.data);
  const config = getConfig();
  const wa = new WhatsAppClient({
    accessToken: config.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
  });

  try {
    await runBrandAnalysisForProfile({
      brandProfileId: data.brandProfileId,
      phoneNumber: data.phoneNumber,
      userLang: data.userLang,
      onMessage: async (text) => {
        await wa.sendText(data.phoneNumber, text);
      },
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'brand_analysis_failed',
        jobId: job.id,
        brandProfileId: data.brandProfileId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    try {
      await wa.sendText(
        data.phoneNumber,
        'Brand profile analysis ran into an issue. Please try again later.',
      );
    } catch {
      // best effort
    }
    throw err; // let BullMQ retry per queue defaults
  }
}

// ---------------------------------------------------------------------------
// Pure orchestrator — used by the processor above and by the Phase 3b smoke
// test. Returns the final summary so callers can assert / log.
// ---------------------------------------------------------------------------

export interface RunBrandAnalysisOptions {
  brandProfileId: string;
  phoneNumber: string;
  userLang?: string;
  /** Optional callback used to notify the user. Omit it to skip messaging. */
  onMessage?: (text: string) => Promise<void>;
}

export async function runBrandAnalysisForProfile(
  opts: RunBrandAnalysisOptions,
): Promise<{ summary: BrandSummary; assetCount: number }> {
  const { brandProfileId, userLang, onMessage } = opts;
  const dry = isDryRun();

  const profile = await prisma.brandProfile.findUnique({ where: { id: brandProfileId } });
  if (!profile) throw new Error(`BrandProfile ${brandProfileId} not found`);

  const assets = await prisma.brandAsset.findMany({
    where: { brandProfileId: profile.id },
    orderBy: { createdAt: 'asc' },
  });

  // Per-asset analyses in parallel. A single failure must NOT kill the
  // batch — we substitute a placeholder description and keep going.
  const descriptors: AssetDescriptor[] = await Promise.all(
    assets.map(async (asset) => {
      const description = await analyzeAsset(asset, dry).catch((err) => {
        console.warn(
          JSON.stringify({
            event: 'brand_asset_analysis_failed',
            assetId: asset.id,
            type: asset.type,
            error: err instanceof Error ? err.message.slice(0, 200) : String(err),
          }),
        );
        return asset.rawText ?? `(${asset.type} asset; analysis unavailable)`;
      });

      await prisma.brandAsset
        .update({
          where: { id: asset.id },
          data: { aiDescription: description.slice(0, 1500) },
        })
        .catch(() => {});

      return { type: asset.type, description };
    }),
  );

  // The user types colours + tagline directly in the guided flow, so those are
  // authoritative — feed them to the summariser as context (so the prose is
  // consistent) but never let the AI overwrite them. The AI still infers vibe
  // and the natural-language summary, and analyses the logo.
  const userTagline = profile.tagline?.trim() || null;
  const userColours = (profile.brandColors ?? []).map((c) => c.trim()).filter(Boolean);
  if (userTagline) {
    descriptors.push({ type: 'text', description: `Brand tagline (provided by the owner): ${userTagline}` });
  }
  if (userColours.length > 0) {
    descriptors.push({ type: 'text', description: `Brand colours (provided by the owner): ${userColours.join(', ')}` });
  }

  const aiSummary = dry
    ? buildDryRunSummary(descriptors)
    : await generateSummary(descriptors);

  // Merge: user-provided fields win; the AI fills the gaps.
  const summary: BrandSummary = {
    summary: aiSummary.summary,
    vibe: aiSummary.vibe,
    tagline: userTagline ?? aiSummary.tagline,
    brandColors: userColours.length > 0 ? userColours : aiSummary.brandColors,
  };

  await prisma.brandProfile.update({
    where: { id: profile.id },
    data: {
      summary: summary.summary,
      summaryUpdatedAt: new Date(),
      tagline: summary.tagline || null,
      brandColors: summary.brandColors,
      vibe: summary.vibe || null,
    },
  });

  await prisma.brandSummaryVersion.create({
    data: {
      brandProfileId: profile.id,
      summary: summary.summary,
      structuredData: {
        tagline: summary.tagline,
        brandColors: summary.brandColors,
        vibe: summary.vibe,
        stub: false,
      },
      changeReason: 'initial',
    },
  });

  if (onMessage) {
    const text = formatProfileMessage(summary, assets.length, userLang);
    await onMessage(text).catch(() => {});
  }

  return { summary, assetCount: assets.length };
}

// ---------------------------------------------------------------------------
// Per-asset analysis dispatcher
// ---------------------------------------------------------------------------

async function analyzeAsset(
  asset: {
    type: string;
    storageUrl: string | null;
    rawText: string | null;
    mimeType: string | null;
  },
  dry: boolean,
): Promise<string> {
  if (dry) {
    return `(dry-run) ${asset.type} asset description`;
  }

  switch (asset.type) {
    case 'logo':
    case 'reference_image':
    case 'sample': {
      if (!asset.storageUrl) return `${asset.type}: missing storage URL`;
      const buf = await downloadBuffer(asset.storageUrl);
      return await analyzeImage({
        imageBuffer: buf,
        mimeType: asset.mimeType ?? undefined,
        assetType: asset.type as 'logo' | 'reference_image' | 'sample',
      });
    }
    case 'pdf': {
      if (!asset.storageUrl) return 'pdf: missing storage URL';
      const buf = await downloadBuffer(asset.storageUrl);
      const { text, pages } = await analyzePDF(buf);
      return `PDF (${pages} page(s)): ${text.slice(0, 800)}`;
    }
    case 'document': {
      // docx/xlsx text extractors aren't wired yet — plan calls this out as
      // "best-effort, store raw and note in summary". Placeholder until we add
      // real extractors.
      return `Document uploaded (${asset.mimeType ?? 'unknown type'}). Detailed extraction not yet wired.`;
    }
    case 'website': {
      const url = extractFirstUrl(asset.rawText ?? '');
      if (!url) return `Website note: ${(asset.rawText ?? '').slice(0, 400)}`;
      try {
        const r = await scrapeWebsite(url);
        const headings = [...r.h1, ...r.h2].slice(0, 6).join(' | ');
        return (
          `Website ${url} (${r.source}). ` +
          `Title: ${r.title || '—'}. ` +
          (headings ? `Headings: ${headings}. ` : '') +
          (r.description || r.bodyText.slice(0, 400))
        );
      } catch (err) {
        return `Website ${url} — scrape failed: ${err instanceof Error ? err.message.slice(0, 150) : 'unknown error'}`;
      }
    }
    case 'text':
    default:
      return asset.rawText ?? '';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDryRunSummary(descriptors: AssetDescriptor[]): BrandSummary {
  return {
    tagline: 'Dry-run tagline',
    brandColors: ['#000000', '#FFFFFF'],
    vibe: 'dry-run vibe',
    summary: `Dry-run summary based on ${descriptors.length} asset(s).`,
  };
}

function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_REGEX);
  return m ? m[0] : null;
}

function formatProfileMessage(s: BrandSummary, _assetCount: number, lang?: string): string {
  const hi = lang === 'hi' || lang === 'hinglish';
  const head = hi
    ? 'Brand profile save ho gaya ✅'
    : 'Brand profile saved ✅';
  const lines: string[] = [head];
  if (s.tagline) lines.push(`• Tagline: ${s.tagline}`);
  if (s.brandColors.length > 0) lines.push(`• Colors: ${s.brandColors.join(', ')}`);
  if (s.vibe) lines.push(`• Vibe: ${s.vibe}`);
  if (s.summary) lines.push('', s.summary);
  return lines.join('\n');
}
