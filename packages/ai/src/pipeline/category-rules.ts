/**
 * Phase 18 — per-category prompt fragments.
 *
 * Light Analyzer's `productCategory` field drives which rule string lands in
 * the "PRODUCT CATEGORY" section of the hierarchical prompt. These rules are
 * positive constraints (what to do); negative constraints land in their own
 * section.
 *
 * Categories match the ones Light Analyzer already classifies into. Aliases
 * are normalised — input may be the schema's `food` / `jewellery` form OR
 * the WhatsApp ListIds form (`cat_food` / `cat_jewellery`). Anything we
 * don't recognise falls back to `general`.
 */

export const CATEGORY_RULES: Record<string, string> = {
  jewellery:
    'Use a jewelry display stand, velvet bust, or floating macro setup. ' +
    'Avoid model unless explicitly requested. ' +
    'Highlight gem clarity, metal finish, and craftsmanship. ' +
    'Tiny products: macro composition with shallow depth of field.',

  garment:
    "If 'no model' or 'no human' requested, use a ghost mannequin (invisible-form display) " +
    'or a fabric-draped mannequin. Never use a flat lay unless requested. ' +
    'Preserve stitching, fabric texture, color, and silhouette exactly.',

  food:
    'Plating must be stable and appetizing. ' +
    'Preserve garnish/sauce as shown unless user says otherwise. ' +
    'No steam, no hands, no extra props unless requested. ' +
    'Marketplace-style framing for delivery platforms.',

  skincare:
    'Reflective luxury lighting. Soft shadows. ' +
    'Preserve label typography exactly. ' +
    'Container geometry (cap, dropper, pump) must match input precisely.',

  candle:
    'If candle is unlit in input, keep unlit. If lit, preserve flame appearance. ' +
    'Container shape and label preserved exactly.',

  bag:
    'Show bag at marketplace-standard angle (3/4 view typical). ' +
    'Preserve hardware (zippers, buckles, logos). ' +
    'Strap drape natural.',

  electronics:
    'Edge precision and symmetry. ' +
    'Preserve ports, buttons, and branding exactly. ' +
    'Reflective surfaces handled cleanly without halo artifacts.',

  home_goods:
    'Preserve form and finish exactly. ' +
    'Stage in a context where the product is the focal point — no clutter. ' +
    'Lighting flatters the material (matte / glossy / textured).',

  handicraft:
    'Preserve handmade detail — texture, weave, paint strokes. ' +
    'Avoid making it look factory-finished. ' +
    'Lighting should celebrate the imperfection that signals craft.',

  general:
    'Preserve product identity exactly. ' +
    'Marketplace-safe composition.',
};

/**
 * Normalise category input from either the Light Analyzer (`food`,
 * `jewellery`, ...) or the onboarding ListIds (`cat_food`, `cat_jewellery`,
 * ...) into the CATEGORY_RULES key. Unknown → `general`.
 */
export function normaliseCategory(input: string | undefined | null): keyof typeof CATEGORY_RULES {
  if (!input) return 'general';
  const trimmed = input.trim().toLowerCase();
  const stripped = trimmed.startsWith('cat_') ? trimmed.slice(4) : trimmed;
  if (stripped in CATEGORY_RULES) return stripped as keyof typeof CATEGORY_RULES;
  // Common aliases that don't match a key directly.
  if (stripped === 'jewelry') return 'jewellery';
  if (stripped === 'clothing' || stripped === 'apparel') return 'garment';
  if (stripped === 'cosmetics' || stripped === 'beauty') return 'skincare';
  return 'general';
}

/**
 * Look up the rule fragment for a category. Always returns a non-empty
 * string — `general` is the safe fallback.
 */
export function getCategoryRule(category: string | undefined | null): string {
  return CATEGORY_RULES[normaliseCategory(category)]!;
}

// ---------------------------------------------------------------------------
// Phase 21 — edge-case templates (activated by Light Analyzer flags)
// ---------------------------------------------------------------------------

/**
 * Per-attribute prompt addenda that get appended to the category rule when
 * the Light Analyzer detects a specific product attribute. Keys match the
 * boolean field names on `LightAnalysis` (added in Phase 21).
 */
export const EDGE_CASE_RULES: Record<string, string> = {
  isTransparent:
    'Preserve transparency — show through correctly, no opacity drift, ' +
    'visible refraction on liquid/glass content.',

  isReflectiveMetal:
    'Controlled metallic highlights, no halo artifacts, accurate specular reflection.',

  hasEmbroidery:
    'Preserve embroidery pattern, thread detail, and texture exactly. ' +
    'Do not smooth or stylize the stitchwork.',

  isLowContrastVsBackground:
    'Subtle shadow separation, no merging with background, distinct silhouette. ' +
    'White-on-white or black-on-black products need explicit contour.',

  hasTextOrLogo:
    'Preserve all text and logos exactly as shown — no modification, no rotation, ' +
    'no font drift. Brand marks are sacred.',

  isTinyProduct:
    'Macro composition with shallow depth of field. ' +
    'Product should still feel premium even when tiny.',
};

/**
 * Build the edge-case addenda string from a flag map. Returns a single
 * concatenated paragraph, or an empty string if no flags match.
 */
export function buildEdgeCaseAddenda(flags: Record<string, boolean | undefined> | undefined): string {
  if (!flags) return '';
  const lines: string[] = [];
  for (const [key, rule] of Object.entries(EDGE_CASE_RULES)) {
    if (flags[key]) lines.push(rule);
  }
  return lines.join(' ');
}
