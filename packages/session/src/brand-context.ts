/**
 * Phase 5 — brand-context fetcher used by the image-processing worker and the
 * Phase 5 smoke test.
 *
 * Looks up the User by phone number, then their BrandProfile (1:1 with User),
 * and returns the BrandContext shape that the AI prompt builder accepts.
 * Returns undefined when:
 *   - no User exists
 *   - no BrandProfile exists
 *   - the profile has nothing useful (every editable field is null / empty)
 *
 * Keeping this in @autmn/session (which already imports prisma) so the worker
 * doesn't need its own Prisma touch-points and the smoke test can exercise
 * the exact same code path the worker uses.
 */

import { prisma } from '@autmn/db';
import type { BrandContext } from '@autmn/ai';

export async function fetchBrandContextForUser(
  phoneNumber: string,
): Promise<BrandContext | undefined> {
  const user = await prisma.user.findUnique({
    where: { phoneNumber },
    select: { id: true },
  });
  if (!user) return undefined;

  const profile = await prisma.brandProfile.findUnique({
    where: { userId: user.id },
    select: {
      summary: true,
      tagline: true,
      brandColors: true,
      vibe: true,
    },
  });
  if (!profile) return undefined;

  const summary = profile.summary?.trim();
  const tagline = profile.tagline?.trim();
  const vibe = profile.vibe?.trim();
  const brandColors = (profile.brandColors ?? [])
    .map((c) => c.trim())
    .filter(Boolean);

  // Skip profiles that don't actually carry any signal — saves a query in
  // formatBrandContextBlock and keeps prompts byte-identical to pre-Phase-5
  // for users who never seeded brand details.
  if (!summary && !tagline && !vibe && brandColors.length === 0) {
    return undefined;
  }

  return {
    summary: summary || undefined,
    tagline: tagline || undefined,
    brandColors: brandColors.length > 0 ? brandColors : undefined,
    vibe: vibe || undefined,
  };
}
