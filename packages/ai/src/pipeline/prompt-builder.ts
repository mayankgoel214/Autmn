/**
 * Phase 18 — hierarchical prompt builder for the creative track.
 *
 * Replaces the flat structure in style-prompts-v5.ts. The new prompt enforces
 * an explicit instruction hierarchy via section ordering — the model sees
 * product fidelity FIRST, then negatives, then brand, then category, then
 * the user's words, then the style direction. This is the inverse of the
 * old prompt which led with creative style direction and let the model
 * drift the product to fit the scene.
 *
 * Plan §2 lock:
 *   1. Product fidelity (highest)
 *   2. Negative constraints (hard)
 *   3. Brand guidelines
 *   4. Category rules
 *   5. User styling prompt
 *   6. Creative direction (lowest)
 *
 * This file is the single source of truth for the creative-track prompt;
 * style-prompts-v5.ts will be retired in Phase 22 once all call sites
 * migrate. Until then, buildBetaPrompt continues to work.
 */

import { getCategoryRule, buildEdgeCaseAddenda } from './category-rules.js';
import type { StyleArtDirection, BrandContext } from './_common/types.js';

/**
 * Human-readable style label for the STYLE DIRECTION header. Centralised so
 * the prompt UI is consistent regardless of caller.
 */
function humaniseStyle(style: string): string {
  switch (style) {
    case 'style_clean_white':       return 'Clean White Studio';
    case 'style_studio':            return 'Colored Studio';
    case 'style_lifestyle':         return 'Lifestyle';
    case 'style_gradient':          return 'Dark Luxury';
    case 'style_outdoor':           return 'Outdoor';
    case 'style_festive':           return 'Festive Indian';
    case 'style_minimal':           return 'Minimal';
    case 'style_with_model':        return 'With Model';
    case 'style_autmn_special':     return 'Autmn Special (art-directed)';
    case 'style_anything_you_want': return 'Custom (user-described)';
    default:                        return style.replace(/^style_/, '').replace(/_/g, ' ');
  }
}

/** Default scene fallback when the Creative Brief has no direction for this style. */
function defaultStyleDirection(style: string): string {
  switch (style) {
    case 'style_clean_white':
      return 'Seamless white cyclorama. Dual softboxes for even fill with one subtle edge gradient for form. Product perfectly centred as the clean hero, grounded by a soft contact shadow (not a hard drop shadow). No background elements.';
    case 'style_studio':
      return 'Bold saturated solid-color cyclorama backdrop. Single hard key camera-left creating a crisp directional highlight and a clean hard-edged shadow falling camera-right as part of the composition. Editorial and confident, one minimal prop at most.';
    case 'style_lifestyle':
      return 'Real Indian everyday setting — home counter, cafe table, or desk. Soft directional window light from one side with a clear time of day, 35-50mm shallow DOF, 2-3 contextual props. The product is lit by the same window as the scene — matching shadow direction and color temperature — and grounded by a contact shadow.';
    case 'style_gradient':
      return 'Near-black surface and background. Single hard key creating a bright specular highlight along the product edge, then deep rapid falloff into shadow so the product is the brightest element. Subtle rim light for separation. Clean reflection on the polished dark surface.';
    case 'style_outdoor':
      return 'Golden hour, low warm sun as the key with long soft shadows, 35mm environmental wide. Product lit by the same sun as the landscape — warm sun-side highlight, cool shadow fill — grounded by a contact shadow so it looks photographed on location, not composited.';
    case 'style_festive':
      return "Indian festive celebration — Diwali, wedding, or karwa chauth context. Warm 2700K key from diyas, candles, or string lights that wraps the product and shares the scene's color temperature, with warm soft shadows. Brass and marigold props, traditional moment.";
    case 'style_minimal':
      return 'Muted single-tone background with deliberate negative space and geometric precision. Soft directional light producing one clean gradient shadow. Zero or one geometric element, restrained palette.';
    case 'style_with_model':
      return 'Indian model naturally holding or using the product in a candid moment — never stiff or staring at the camera. The same soft natural light from one source falls on both model and product; product sharp, model slightly soft. 50-85mm shallow DOF.';
    case 'style_autmn_special':
      return "Bold magazine-cover concept — suspended product, unusual surface, or scattered thematic elements. Every element shares one light source: the product's highlights, shadow direction, and color temperature match the surroundings exactly, reading as one captured moment, not a collage.";
    case 'style_anything_you_want':
      // Fallback only — the dedicated builder fires when description is non-empty.
      return 'Modern professional product ad with clean composition, a single soft key for balanced lighting, and a clear product hero grounded by a subtle contact shadow. Pick a tasteful contemporary aesthetic.';
    default:
      return 'Professional ad photography with a single clear key light and a natural grounding shadow, product as the clear focal point.';
  }
}

/** Render the brand context block. Empty string when nothing useful is present. */
function formatBrandBlock(ctx: BrandContext | undefined): string {
  if (!ctx) return '';
  const lines: string[] = [];
  if (ctx.tagline && ctx.tagline.trim()) lines.push(`- Tagline: ${ctx.tagline.trim()}`);
  if (ctx.vibe && ctx.vibe.trim()) lines.push(`- Vibe: ${ctx.vibe.trim()}`);
  if (ctx.brandColors && ctx.brandColors.length > 0) {
    const cleaned = ctx.brandColors.map((c) => c.trim()).filter(Boolean);
    if (cleaned.length > 0) lines.push(`- Brand colors: ${cleaned.join(', ')}`);
  }
  if (ctx.summary && ctx.summary.trim()) lines.push(`- About: ${ctx.summary.trim().slice(0, 600)}`);
  return lines.length === 0 ? '' : lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildCreativePromptParams {
  /** Style id (e.g. 'style_clean_white'). Drives the STYLE DIRECTION header label. */
  style: string;
  /**
   * Light-Analyzer category — accepts either the schema form (`food`,
   * `jewellery`) or the onboarding ListIds (`cat_food`, `cat_jewellery`).
   * Falls back to `general`.
   */
  productCategory?: string | null;
  /**
   * Edge-case flags from the Light Analyzer. Phase 21 adds these as bool
   * fields on `LightAnalysis`. Optional — missing or unknown flags are no-ops.
   */
  edgeCaseFlags?: Record<string, boolean | undefined>;
  /**
   * Product description from the Creative Brief profile (`productType` field)
   * or the Light Analyzer (`productName` fallback). When missing, the prompt
   * leans on the reference image alone.
   */
  productDescription?: string;
  /** Brand name from onboarding. Display only — brand IDENTITY lives in brandContext. */
  brandName?: string;
  /** Brand context — tagline / vibe / palette / summary. */
  brandContext?: BrandContext;
  /** Per-style art direction from the Creative Brief, when available. */
  artDirection?: StyleArtDirection;
  /** User's per-style instruction (free text, post-LLM-mapping). */
  userInstructions?: string;
  /**
   * Negative constraints extracted by the instruction parser. Surfaced in
   * the CRITICAL NEGATIVE CONSTRAINTS block AND re-checked by the verifier
   * (Phase 19). Keep entries concrete — "no model", "no garnish".
   */
  negativeConstraints?: string[];
  /** Aspect ratio override; defaults to 1:1 (the only thing V1 ships). */
  aspectRatio?: string;
  /**
   * One-shot upgrade — exact brand/label text transcribed from the photo by
   * the Light Analyzer ("Cadbury | Dairy Milk"). Injected verbatim so the
   * model reproduces it character for character instead of re-spelling it.
   */
  labelText?: string | null;
}

/**
 * Build the hierarchical creative prompt. Sections with no content render as
 * empty (the section header is suppressed) so the model doesn't get told to
 * follow rules that don't exist.
 */
export function buildCreativePrompt(params: BuildCreativePromptParams): string {
  const {
    style,
    productCategory,
    edgeCaseFlags,
    productDescription,
    brandName,
    brandContext,
    artDirection,
    userInstructions,
    negativeConstraints,
    aspectRatio = '1:1',
    labelText,
  } = params;

  const productLine = productDescription?.trim() || 'the product shown in the reference image';
  const brandLine = brandName?.trim() || 'unspecified';
  const labelLine = labelText?.trim()
    ? `\nText on the product/packaging reads EXACTLY: "${labelText.trim()}" — reproduce every character, word, and capitalization exactly as written. Do not re-spell, translate, restyle, or invent typography.`
    : '';
  const styleLine = humaniseStyle(style);
  const styleDirection = artDirection
    ? `${artDirection.sceneDirection.trim().replace(/\.+$/, '')}. ${artDirection.moodAnchor.trim().replace(/\.+$/, '')}.`
    : defaultStyleDirection(style);

  const categoryRule = getCategoryRule(productCategory);
  const edgeAddenda = buildEdgeCaseAddenda(edgeCaseFlags);
  const categoryBody = edgeAddenda ? `${categoryRule} ${edgeAddenda}` : categoryRule;

  const negatives = (negativeConstraints ?? [])
    .map((n) => n.trim())
    .filter(Boolean);
  const negativesBody = negatives.length > 0
    ? negatives.map((n) => `- ${n}`).join('\n')
    : '';

  const brandBlock = formatBrandBlock(brandContext);
  const userBlock = userInstructions?.trim() || '';

  // Compose sections in plan order. Skip headers whose body is empty so the
  // model isn't reading "BRAND CONTEXT\n\nPRODUCT CATEGORY" with nothing in
  // between.
  const sections: string[] = [];

  sections.push(
    `PRIMARY OBJECTIVE
=================
Faithfully reproduce the product shown in the reference image. The product's exact shape, color, materials, logos, text, packaging, proportions, and details must be preserved without alteration.${labelLine}

Product: ${productLine}
Brand: ${brandLine}`,
  );

  if (negativesBody) {
    sections.push(
      `CRITICAL NEGATIVE CONSTRAINTS (MUST NOT APPEAR)
================================================
${negativesBody}

If any of the above appears in the generated image, the result is unusable.`,
    );
  }

  if (brandBlock) {
    sections.push(
      `BRAND CONTEXT
=============
Apply these stylistic signals to the ad without dominating the product.
${brandBlock}`,
    );
  }

  sections.push(
    `PRODUCT CATEGORY
================
${categoryBody}`,
  );

  if (userBlock) {
    sections.push(
      `USER INSTRUCTIONS FOR THIS POSITION
====================================
${userBlock}`,
    );
  }

  sections.push(
    `STYLE DIRECTION
===============
Style: ${styleLine}
${styleDirection}`,
  );

  sections.push(
    `ASPECT + COMPOSITION
====================
Aspect ratio: ${aspectRatio}
Identity anchoring: the first reference image is the source of truth for product appearance. All subsequent reference images are additional angles of the same product, not separate items.

Rules that always apply:
- The product must be the clear focal point.
- Do not change the product's shape, packaging design, logo, or label.
- Do not invent secondary products, brand marks, or text not on the original.
- Any text or logo on the product must match the reference exactly — no re-spelling, no invented typography.
- Lighting and composition must match the selected style.${negatives.length > 0 ? `\n- Final reminder — the image must NOT contain: ${negatives.join('; ')}.` : ''}`,
  );

  return sections.join('\n\n');
}

/**
 * Build the "Anything You Want" prompt — user description IS the creative
 * direction. Uses the same hierarchy + same fidelity guardrails, but the
 * style-direction block is dropped (the user owns it) and the user-block
 * becomes mandatory.
 */
export function buildAnythingYouWantCreativePrompt(params: BuildCreativePromptParams): string {
  const {
    productCategory,
    edgeCaseFlags,
    productDescription,
    brandName,
    brandContext,
    userInstructions,
    negativeConstraints,
    aspectRatio = '1:1',
    labelText,
  } = params;

  const productLine = productDescription?.trim() || 'the product shown in the reference image';
  const brandLine = brandName?.trim() || 'unspecified';
  const labelLine = labelText?.trim()
    ? `\nText on the product/packaging reads EXACTLY: "${labelText.trim()}" — reproduce every character, word, and capitalization exactly as written. Do not re-spell, translate, restyle, or invent typography.`
    : '';
  const categoryRule = getCategoryRule(productCategory);
  const edgeAddenda = buildEdgeCaseAddenda(edgeCaseFlags);
  const categoryBody = edgeAddenda ? `${categoryRule} ${edgeAddenda}` : categoryRule;

  const negatives = (negativeConstraints ?? []).map((n) => n.trim()).filter(Boolean);
  const negativesBody = negatives.length > 0 ? negatives.map((n) => `- ${n}`).join('\n') : '';

  const brandBlock = formatBrandBlock(brandContext);
  const userDescription = userInstructions?.trim() || '';

  const sections: string[] = [];

  sections.push(
    `PRIMARY OBJECTIVE
=================
Faithfully reproduce the product shown in the reference image. The product's exact shape, color, materials, logos, text, packaging, proportions, and details must be preserved without alteration.${labelLine}

Product: ${productLine}
Brand: ${brandLine}`,
  );

  if (negativesBody) {
    sections.push(
      `CRITICAL NEGATIVE CONSTRAINTS (MUST NOT APPEAR)
================================================
${negativesBody}`,
    );
  }

  if (brandBlock) {
    sections.push(
      `BRAND CONTEXT
=============
${brandBlock}`,
    );
  }

  sections.push(
    `PRODUCT CATEGORY
================
${categoryBody}`,
  );

  if (userDescription) {
    sections.push(
      `USER-DESCRIBED SCENE (PRIMARY CREATIVE DIRECTION)
=================================================
${userDescription}`,
    );
  } else {
    sections.push(
      `USER-DESCRIBED SCENE
====================
User picked custom direction but provided no description. Use a tasteful modern aesthetic with balanced lighting and clean composition.`,
    );
  }

  sections.push(
    `ASPECT + COMPOSITION
====================
Aspect ratio: ${aspectRatio}
Identity anchoring: the first reference image is the source of truth for product appearance.

Rules that always apply (override the user-described scene if they conflict):
- The product must be the clear focal point.
- Do not change the product's shape, packaging design, logo, or label.
- Do not invent secondary products, brand marks, or text not on the original.
- Any text or logo on the product must match the reference exactly — no re-spelling, no invented typography.${negatives.length > 0 ? `\n- Final reminder — the image must NOT contain: ${negatives.join('; ')}.` : ''}`,
  );

  return sections.join('\n\n');
}
