/**
 * Prompt builder — V2 structured template.
 *
 * Replaces the V1 inline sentence approach with an explicit key-value block
 * that models (Gemini Pro, GPT-Image-2) parse more reliably under varied input.
 *
 * Template fields:
 *   Product           — from creative brief profile.productType, or "the product shown"
 *   Brand             — from user.brandName (collected at onboarding)
 *   Category          — human-readable category (Jewellery, Food, etc.)
 *   Style             — human-readable style name (Clean White Studio, etc.)
 *   Style description — from creative brief art direction, or per-style default
 *   Hard constraints  — user voice note / typed instructions (empty = best judgment)
 *
 * Followed by five rules that always apply regardless of style.
 */

// ---------------------------------------------------------------------------
// Human-readable style + category labels
// ---------------------------------------------------------------------------

function humanizeStyle(style: string): string {
  switch (style) {
    case 'style_clean_white':         return 'Clean White Studio';
    case 'style_studio':              return 'Colored Studio';
    case 'style_lifestyle':           return 'Lifestyle';
    case 'style_gradient':            return 'Dark Luxury';
    case 'style_outdoor':             return 'Outdoor';
    case 'style_festive':             return 'Festive Indian';
    case 'style_minimal':             return 'Minimal';
    case 'style_with_model':          return 'With Model';
    case 'style_autmn_special':       return 'Autmn Special (art-directed)';
    // Phase 10 — user-described custom direction. The label says it but the
    // real direction lives in HARD CONSTRAINTS where the user's words drive
    // the scene composition.
    case 'style_anything_you_want':   return 'Custom (user-described)';
    default:                          return style.replace(/^style_/, '').replace(/_/g, ' ');
  }
}

function humanizeCategory(category: string | undefined): string {
  if (!category) return 'General';
  const c = category.replace(/^cat_/, '');
  switch (c) {
    case 'jewellery':   return 'Jewellery';
    case 'food':        return 'Food & Packaged Goods';
    case 'garment':     return 'Garments & Apparel';
    case 'skincare':    return 'Skincare & Beauty';
    case 'candle':      return 'Candles & Home Decor';
    case 'bag':         return 'Bags & Accessories';
    case 'electronics': return 'Electronics';
    default:            return c.charAt(0).toUpperCase() + c.slice(1);
  }
}

// ---------------------------------------------------------------------------
// Per-style default descriptions — used when creative brief is unavailable
// ---------------------------------------------------------------------------

function getDefaultStyleDescription(style: string): string {
  switch (style) {
    case 'style_clean_white':
      return 'Seamless white cyclorama, dual studio strobes, pure clean hero composition. Product perfectly centred, no background elements.';
    case 'style_studio':
      return 'Saturated solid-color cyclorama backdrop, single rim light, bold and editorial composition. One minimal prop at most.';
    case 'style_lifestyle':
      return 'Real Indian everyday setting — home counter, cafe table, or desk. Natural window light, 35-50mm shallow DOF, 2-3 contextual props.';
    case 'style_gradient':
      return 'Dark luxury surface, cinematic key and rim lighting, deep shadows, atmospheric depth. Product as the sole light source in a dark scene.';
    case 'style_outdoor':
      return 'Golden hour natural light, environmental outdoor depth, 35mm wide angle. Setting matches the product\'s use context.';
    case 'style_festive':
      return 'Indian festive celebration — Diwali, wedding, or karwa chauth context. Warm 2700K diya/candle key light, brass and marigold props, traditional moment.';
    case 'style_minimal':
      return 'Muted background, deliberate negative space, geometric precision. Zero or one geometric element, restrained palette.';
    case 'style_with_model':
      return 'Indian model naturally holding or using the product, candid interaction, natural light, 50-85mm shallow DOF.';
    case 'style_autmn_special':
      return 'Bold, unexpected, magazine-cover-worthy composition — suspended product, unusual surface, frozen-moment scene, or scattered elements. Pure conceptual product hero.';
    case 'style_anything_you_want':
      // Phase 10 — placeholder when the user picked "Anything You Want" but
      // provided no description. buildAnythingYouWantPrompt is the
      // preferred path; this string only fires if the description is empty
      // (e.g. user picked the style and never sent instructions).
      return 'Modern professional product ad with clean composition, balanced lighting, and clear product hero. Pick a tasteful contemporary aesthetic.';
    default:
      return 'Professional ad photography, product as clear focal point.';
  }
}

// ---------------------------------------------------------------------------
// Per-category fidelity addendum — appended to hard constraints when non-empty
// ---------------------------------------------------------------------------

function getCategoryFidelityNote(category: string | undefined): string {
  const c = category && !category.startsWith('cat_') ? `cat_${category}` : category;
  switch (c) {
    case 'cat_jewellery':
      return 'Show metalwork detail and stones clearly. If multiple pieces, all must be visible together as a coherent set.';
    case 'cat_food':
      return 'Brand label and packaging text must be fully readable, sharp, and unaltered.';
    case 'cat_garment':
      return 'Fabric texture and stitching must be visible. Garment pose should flatter the cut.';
    case 'cat_skincare':
      return 'Bottle or jar label must be clearly readable. Hero ingredient-focus aesthetic.';
    case 'cat_candle':
      return 'Glow ambiance must complement the candle without overpowering the product label.';
    case 'cat_bag':
      return 'Hardware and stitching details must be visible. Bag shape clearly defined.';
    case 'cat_electronics':
      return 'Exact model form factor, shape, dimensions, and design details must match the reference precisely — do not substitute a different model or variant.';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Per-style art direction from the Creative Brief step (V1.1+).
 */
export interface StyleArtDirection {
  /** 10-25 word concrete scene: where + what's happening + key visual element. */
  sceneDirection: string;
  /** 3-7 word emotional/visual tone (e.g. "warm and aspirational"). */
  moodAnchor: string;
}

/**
 * Per-user brand context (Phase 5) — derived from BrandProfile +
 * BrandSummaryVersion. Threaded through every prompt builder so the LLM has
 * the user's brand identity as a stylistic anchor. Every field is optional;
 * an empty BrandContext is treated identically to undefined.
 */
export interface BrandContext {
  /** Free-text summary written by generateSummary (Phase 3b). */
  summary?: string;
  /** Brand tagline. */
  tagline?: string;
  /** 2-6 brand colours as colour names or hex codes. */
  brandColors?: string[];
  /** 2-4 word brand vibe ("minimalist luxury", "playful festive", etc.). */
  vibe?: string;
}

/**
 * Renders the BrandContext as a prompt block, or returns empty string when
 * every field is missing. Keeping this here so production.ts can re-use it
 * if it ever wants to emit the same block elsewhere.
 */
export function formatBrandContextBlock(ctx: BrandContext | undefined): string {
  if (!ctx) return '';
  const lines: string[] = [];
  if (ctx.tagline && ctx.tagline.trim()) lines.push(`- Tagline: ${ctx.tagline.trim()}`);
  if (ctx.vibe && ctx.vibe.trim()) lines.push(`- Vibe: ${ctx.vibe.trim()}`);
  if (ctx.brandColors && ctx.brandColors.length > 0) {
    const cleaned = ctx.brandColors.map((c) => c.trim()).filter(Boolean);
    if (cleaned.length > 0) lines.push(`- Brand colors: ${cleaned.join(', ')}`);
  }
  if (ctx.summary && ctx.summary.trim()) lines.push(`- About: ${ctx.summary.trim().slice(0, 600)}`);
  if (lines.length === 0) return '';
  return `\nBrand context (apply these stylistic signals to the ad without dominating the product):\n${lines.join('\n')}\n`;
}

/**
 * Build the final generation prompt using the V2 structured template.
 *
 * `productDescription` comes from creative brief `profile.productType`.
 * `brandName` comes from user.brandName saved at onboarding.
 * `artDirection` comes from creative brief per-style directions.
 * `userInstructions` (voice note / typed text) fills the HARD CONSTRAINTS block.
 *
 * Signature keeps `_productName` for call-site compatibility (ignored — use productDescription).
 */
export function buildBetaPrompt(
  style: string,
  _productName: string,
  userInstructions?: string,
  productCategory?: string,
  artDirection?: StyleArtDirection,
  productDescription?: string,
  brandName?: string,
  brandContext?: BrandContext,
): string {
  // Phase 10 — when the user picked "Anything You Want", their per-style
  // instruction IS the creative brief, not just a HARD CONSTRAINT addendum.
  // Delegate to the dedicated builder so the user's words drive the scene.
  if (style === 'style_anything_you_want') {
    return buildAnythingYouWantPrompt(
      userInstructions,
      productCategory,
      productDescription,
      brandName,
      brandContext,
    );
  }

  const productLine = productDescription?.trim() || 'the product shown in the reference image';
  const brandLine = brandName?.trim() || 'unspecified';
  const categoryLine = humanizeCategory(productCategory);
  const styleLine = humanizeStyle(style);

  const styleDesc = artDirection
    ? `${artDirection.sceneDirection.trim().replace(/\.+$/, '')}. ${artDirection.moodAnchor.trim().replace(/\.+$/, '')}.`
    : getDefaultStyleDescription(style);

  // Hard constraints = user instructions + category fidelity note (if any)
  const fidelityNote = getCategoryFidelityNote(productCategory);
  const userPart = userInstructions?.trim() || '';
  const constraintParts = [userPart, fidelityNote].filter(Boolean);
  const hardConstraints = constraintParts.join(' ');

  const brandBlock = formatBrandContextBlock(brandContext);

  return `Generate a professional product advertisement image.

Product: ${productLine}
Brand: ${brandLine}
Category: ${categoryLine}
Style: ${styleLine}
Style description: ${styleDesc}
${brandBlock}
HARD CONSTRAINTS — these override everything else. Follow them exactly:
${hardConstraints}

If hard_constraints is empty, use your best judgment for the style.

Rules that always apply:
- Show only the product specified. Do not add props, people, or secondary objects unless explicitly stated in hard_constraints.
- The product must be the clear focal point of the image.
- Do not change the product's shape, packaging design, logo, or label. Reproduce it faithfully.
- Lighting and composition must match the selected style exactly.
- Do not invent background elements that were not in the original photo or specified in hard_constraints.`;
}

/**
 * Phase 10 — prompt builder for the user-described "Anything You Want" style.
 *
 * Unlike the templated styles where `userInstructions` is a HARD CONSTRAINT
 * appended to a fixed style direction, here the user's description IS the
 * style direction. The prompt frames their words as the creative brief and
 * keeps the same product-fidelity guardrails so identity drift is still
 * prevented.
 *
 * `userDescription` is the user's per-style instruction text (from the Phase
 * 11 instruction mapping). Voice notes have already been transcribed by the
 * time they reach this function.
 *
 * Empty description falls back to the smart-style default — we still ship
 * something rather than failing.
 */
export function buildAnythingYouWantPrompt(
  userDescription: string | undefined,
  productCategory?: string,
  productDescription?: string,
  brandName?: string,
  brandContext?: BrandContext,
): string {
  const productLine = productDescription?.trim() || 'the product shown in the reference image';
  const brandLine = brandName?.trim() || 'unspecified';
  const categoryLine = humanizeCategory(productCategory);
  const desc = userDescription?.trim() || '';

  // No description → fall through to the smart-style default. We still mark
  // it as "user-described" in the style line so the brief LLM (upstream) can
  // log this case for observability.
  const sceneBlock = desc
    ? `USER-DESCRIBED SCENE — this is the creative direction. Build the entire image around this:\n${desc}`
    : 'USER-DESCRIBED SCENE — the user picked custom direction but provided no description. Use a tasteful modern aesthetic with balanced lighting and clean composition.';

  const fidelityNote = getCategoryFidelityNote(productCategory);
  const brandBlock = formatBrandContextBlock(brandContext);

  return `Generate a professional product advertisement image.

Product: ${productLine}
Brand: ${brandLine}
Category: ${categoryLine}
Style: Custom (user-described)
${brandBlock}
${sceneBlock}

${fidelityNote ? `Category fidelity note: ${fidelityNote}\n\n` : ''}Rules that always apply (these override the user-described scene if they conflict):
- The product must be the clear focal point of the image.
- Do not change the product's shape, packaging design, logo, or label. Reproduce it faithfully from the reference image.
- Do not invent secondary products, brand marks, or text that aren't on the original product.
- If the user-described scene calls for people or props, keep them subordinate to the product hero.
- Square 1:1 framing.`;
}

/**
 * Build a revision prompt — used when regenerating a specific ad based on user feedback.
 *
 * Keeps the original hard constraints intact and adds the user's revision feedback
 * on top, so both apply simultaneously. The fidelity rules always apply too.
 */
export function buildRevisionPrompt(
  style: string,
  revisionFeedback: string,
  originalVoiceInstructions: string | undefined,
  productCategory: string | undefined,
  artDirection: StyleArtDirection | undefined,
  productDescription: string | undefined,
  brandName: string | undefined,
  brandContext?: BrandContext,
): string {
  const productLine = productDescription?.trim() || 'the product shown in the reference image';
  const brandLine = brandName?.trim() || 'unspecified';
  const categoryLine = humanizeCategory(productCategory);
  const styleLine = humanizeStyle(style);

  const styleDesc = artDirection
    ? `${artDirection.sceneDirection.trim().replace(/\.+$/, '')}. ${artDirection.moodAnchor.trim().replace(/\.+$/, '')}.`
    : getDefaultStyleDescription(style);

  const fidelityNote = getCategoryFidelityNote(productCategory);
  const originalParts = [originalVoiceInstructions?.trim(), fidelityNote].filter(Boolean);
  const originalConstraints = originalParts.join(' ');

  const originalBlock = originalConstraints
    ? `ORIGINAL CONSTRAINTS — apply these throughout:\n${originalConstraints}`
    : '';

  const revisionBlock = `REVISION FEEDBACK — apply in addition to original constraints:\n${revisionFeedback.trim()}`;

  const constraintSection = [originalBlock, revisionBlock].filter(Boolean).join('\n\n');

  const brandBlock = formatBrandContextBlock(brandContext);

  return `You are regenerating one specific ad based on user feedback. Do not touch or resend the other ads.

Product: ${productLine}
Brand: ${brandLine}
Category: ${categoryLine}
Style: ${styleLine}
Style description: ${styleDesc}
${brandBlock}
${constraintSection}

Rules that always apply:
- Apply the user's revision feedback as additional constraints on top of the original constraints. Both must apply.
- Show only the product specified. Do not add props, people, or secondary objects unless explicitly required by the constraints.
- The product must be the clear focal point of the image.
- Do not change the product's shape, packaging design, logo, or label. Reproduce it faithfully from the reference photo.
- Lighting and composition must match the selected style exactly.`;
}
