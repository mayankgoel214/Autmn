/**
 * Phase 4 — BRAND_DETAILS_EDITING handler.
 *
 * Reached by tapping "Edit" on the brand-profile view. User sends a natural-
 * language instruction; the AI edit parser identifies the target field and
 * value. The handler applies the patch directly to BrandProfile, appends a
 * BrandSummaryVersion with changeReason='user_edit: <raw instruction>',
 * confirms back to the user, and stays in editing mode.
 *
 * 'done' or 'skip' → CHANGE_SETTINGS_MENU.
 *
 * No re-summary is run here — the plan explicitly says the AI summary is
 * regenerated only when new assets are uploaded (which happens via the
 * Add-more path → BRAND_DETAILS_COLLECTING → 'done' → brand-analysis worker).
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import { prisma } from '@autmn/db';
import type { Session, User } from '@autmn/db';
import { parseBrandEdit, type BrandEditField } from '@autmn/ai';
import { transitionTo } from '../db-helpers.js';
import { sendChangeSettingsMenu } from './change-settings.js';
import {
  msgAskBrandEdit,
  msgBrandEditApplied,
  msgBrandEditUnrecognized,
  msgBrandEditExit,
  msgGenericError,
} from '../messages.js';
import type { Language, MessageContext } from '../types.js';
import { logger } from '../logger.js';

const DONE_INTENT = /^(done|bas|finish|khatam|ho ?gaya|complete|theek hai)\s*$/i;
const SKIP_INTENT = /^(skip|no|nahi|nahin|नहीं|छोड़ो|chodo|chhodo|pass)\s*$/i;

export async function handleBrandDetailsEditing(
  session: Session,
  user: User,
  message: MessageContext,
  wa: WhatsAppClient,
): Promise<void> {
  const lang = (user.language as Language) || 'hi';
  const phoneNumber = session.phoneNumber;
  const text = message.text?.trim() ?? '';

  // ── "done" / "skip" — exit editing back to the menu ──────────────────────
  if (message.messageType === 'text' && (DONE_INTENT.test(text) || SKIP_INTENT.test(text))) {
    await wa.sendText(phoneNumber, msgBrandEditExit(lang));
    await transitionTo(phoneNumber, 'CHANGE_SETTINGS_MENU');
    await sendChangeSettingsMenu(phoneNumber, lang, wa);
    return;
  }

  // ── Only text instructions are meaningful in editing mode ────────────────
  if (message.messageType !== 'text' || text.length === 0) {
    await wa.sendText(phoneNumber, msgAskBrandEdit(lang));
    return;
  }

  // ── Parse the instruction → field-level patch ────────────────────────────
  let patch: Awaited<ReturnType<typeof parseBrandEdit>> = null;
  try {
    patch = await parseBrandEdit(text);
  } catch (err) {
    logger.error('parseBrandEdit threw', {
      phoneNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!patch) {
    await wa.sendText(phoneNumber, msgBrandEditUnrecognized(lang));
    return;
  }

  // ── Apply the patch ──────────────────────────────────────────────────────
  const profile = await prisma.brandProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    // Pathological: editing without a profile. Bail back to the menu.
    logger.warn('Brand-edit attempted without a BrandProfile', { phoneNumber, userId: user.id });
    await wa.sendText(phoneNumber, msgGenericError(lang));
    await transitionTo(phoneNumber, 'CHANGE_SETTINGS_MENU');
    await sendChangeSettingsMenu(phoneNumber, lang, wa);
    return;
  }

  try {
    const updateData = buildUpdateData(patch.field, patch.value);
    const updated = await prisma.brandProfile.update({
      where: { id: profile.id },
      data: { ...updateData, summaryUpdatedAt: new Date() },
    });

    // Snapshot the new field values into a fresh BrandSummaryVersion. We do
    // NOT regenerate the AI summary on edits (plan rule: re-summary only on
    // new asset uploads); the summary text carries the previous value.
    await prisma.brandSummaryVersion.create({
      data: {
        brandProfileId: profile.id,
        summary: updated.summary ?? '',
        structuredData: {
          tagline: updated.tagline ?? null,
          brandColors: updated.brandColors ?? [],
          vibe: updated.vibe ?? null,
          stub: false,
          editedField: patch.field,
        },
        changeReason: `user_edit: ${patch.rawInstruction.slice(0, 200)}`,
      },
    });

    await wa.sendText(phoneNumber, msgBrandEditApplied(patch.field, patch.display, lang));
  } catch (err) {
    logger.error('Brand-edit patch failed', {
      phoneNumber,
      field: patch.field,
      error: err instanceof Error ? err.message : String(err),
    });
    await wa.sendText(phoneNumber, msgGenericError(lang));
  }
}

/**
 * Map a parsed patch to a Prisma BrandProfile update payload. Each field
 * maps 1:1 to the schema column.
 */
function buildUpdateData(
  field: BrandEditField,
  value: string | string[],
): Record<string, string | string[] | null> {
  switch (field) {
    case 'brandColors':
      return { brandColors: Array.isArray(value) ? value : [String(value)] };
    case 'tagline':
      return { tagline: typeof value === 'string' ? value : value.join(', ') };
    case 'vibe':
      return { vibe: typeof value === 'string' ? value : value.join(' ') };
    case 'summary':
      return { summary: typeof value === 'string' ? value : value.join('. ') };
  }
}
