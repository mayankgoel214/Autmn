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
    case 'style_clean_white':    return 'Clean White Studio';
    case 'style_studio':         return 'Colored Studio';
    case 'style_lifestyle':      return 'Lifestyle';
    case 'style_gradient':       return 'Dark Luxury';
    case 'style_outdoor':        return 'Outdoor';
    case 'style_festive':        return 'Festive Indian';
    case 'style_minimal':        return 'Minimal';
    case 'style_with_model':     return 'With Model';
    case 'style_autmn_special':  return 'Autmn Special (art-directed)';
    default:                     return style.replace(/^style_/, '').replace(/_/g, ' ');
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
): string {
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

  return `Generate a professional product advertisement image.

Product: ${productLine}
Brand: ${brandLine}
Category: ${categoryLine}
Style: ${styleLine}
Style description: ${styleDesc}

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

  return `You are regenerating one specific ad based on user feedback. Do not touch or resend the other ads.

Product: ${productLine}
Brand: ${brandLine}
Category: ${categoryLine}
Style: ${styleLine}
Style description: ${styleDesc}

${constraintSection}

Rules that always apply:
- Apply the user's revision feedback as additional constraints on top of the original constraints. Both must apply.
- Show only the product specified. Do not add props, people, or secondary objects unless explicitly required by the constraints.
- The product must be the clear focal point of the image.
- Do not change the product's shape, packaging design, logo, or label. Reproduce it faithfully from the reference photo.
- Lighting and composition must match the selected style exactly.`;
}
