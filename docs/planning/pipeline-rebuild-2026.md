# AI pipeline rebuild — plan

**Status:** Approved scope, ready to build.
**Owner:** Mayank
**Built from:** [docs/ai-pipeline.md](../ai-pipeline.md) (current state), co-founder QA notes from 2026-05-27, discussion.
**Pairs with:** [post-onboarding-rebuild-2026.md](./post-onboarding-rebuild-2026.md) Phases 5 (brand injection) and 11 (instruction mapping) — those plans defined the inputs to the pipeline; this plan rebuilds the pipeline itself.

---

## Goal

Re-architect the ad-generation engine into a **two-track pipeline** that produces near-100% product-faithful output at a cost ceiling that protects margin. Stop using a creative-generation engine to do commercial product photography. Enforce instruction hierarchy. Cap retries. Eliminate uncapped cost paths.

## Locked decisions

### Architecture
- **Two-track pipeline.**
  - **Creative track**: Lifestyle, Outdoor, Dark Luxury, Festive, Studio (colored backdrop), Autmn Special, Anything You Want, With Model. Uses Gemini 3 Pro Image Preview as Tier 1, GPT-image-2 as Tier 2 (safety-refusal-only fallback).
  - **Strict track**: White Studio + future marketplace presets. Uses segmentation + composite + lighting reconstruction. No Tier 2 — segmentation either works or fails cleanly.
- **Implicit mode per style.** No user-facing "Strict vs Creative" toggle. Each style is hardcoded to its track.

### Reliability + cost discipline
- **Verification step after every generation.** Gemini 2.5 Flash vision compares output to input. ~₹0.10/style.
- **Hard retry cap per style: 1.** No infinite loops.
- **Drift detected after retry → accept and deliver.** Refund is more expensive than minor drift.
- **Tier 2 only fires on Tier 1 hard safety refusal**, never on drift. Retry stays within Tier 1.
- **No Tier 2 retry.** If Tier 2 also fails → refund.
- **Target margin floor: 65% per non-refunded order.** Refund rate target: <2%.

### Prompt + context restructure
- **Instruction hierarchy enforced via prompt ordering**:
  1. Product fidelity (highest)
  2. Negative constraints (hard, not soft)
  3. Brand guidelines (from BrandProfile)
  4. Category rules
  5. User styling prompt
  6. Creative direction (lowest)
- **Negative instructions** are extracted, hard-listed in the prompt as protected constraints, and **post-checked** in the verification step.
- **Brand profile** (when present) injected as persistent context into every generation.
- **Category-specific rules** baked into prompts (clothing → mannequin/ghost mannequin, jewelry → display stand, food → plating, etc.).
- **Multi-image fusion** — all uploaded product photos used as reference, not just the first.

### Cleanup
- Delete `packages/ai/src/pipeline/_archive/` entirely (7 obsolete files).
- Audit unused exports from [packages/ai/src/index.ts](../../packages/ai/src/index.ts).
- Consolidate Gemini env var names — pick one canonical, remove the other two.
- Document all required API keys with the keypool plural variants (`GEMINI_API_KEYS`, etc.).
- Add 2-3 backup keys per costly provider before launch.

---

## 1. Architecture — two-track pipeline

```
Job arrives at worker: { orderId, styles[], imageBuffers[], userInstructions, brandSummary }
    │
    ▼
[Preprocess]  sharp: HEIC→JPEG, EXIF, resize, JPEG-92
    │
    ▼
[Creative Brief]  Gemini 2.5 Flash — single call per order, produces per-style direction
    │
    ▼
[Instruction Parser]  Gemini 2.0 Flash Lite — maps instructions to positions
                       (covered in post-onboarding Phase 11)
    │
    ▼
For each style (parallel via Promise.all):
    │
    ├─── if style.track == "strict":
    │       │
    │       ▼
    │     [STRICT TRACK] (see §3)
    │       BiRefNet → composite → lighting reconstruction → verify → deliver
    │       Cost: ~₹3-5/style
    │
    └─── if style.track == "creative":
            │
            ▼
          [CREATIVE TRACK] (see §2)
            Build hierarchical prompt → Tier 1 (Gemini Pro) → Verify → 
              ├─ Pass → deliver
              ├─ Drift → Retry Tier 1 once → Verify → 
              │     ├─ Pass → deliver
              │     └─ Still drift → ACCEPT AND DELIVER ⚠️
              └─ Safety refusal → Tier 2 (GPT-image-2) → Verify →
                    ├─ Pass → deliver
                    └─ Fail → REFUND 🛑
            Cost: ₹13.50 typical, ₹34.50 worst-case-no-refund
```

### Track assignment per style (locked)

| Style ID | Track | Notes |
|---|---|---|
| `style_clean_white` (White Studio) | **strict** | The primary fix from co-founder's feedback |
| `style_studio` (Colored Studio) | creative | Colored backdrops still need generation |
| `style_lifestyle` | creative | Scene composition |
| `style_outdoor` | creative | Natural outdoor scene |
| `style_gradient` (Dark Luxury) | creative | Cinematic generation |
| `style_festive` | creative | Festival vibes |
| `style_with_model` | creative | Human/model in scene |
| `style_autmn_special` | creative | AI picks the best direction |
| `style_anything_you_want` | creative | Free-form generation |

Future marketplace presets (Amazon-ready, Nykaa-ready, Zomato-ready, Shopify-ready, Instagram-ready) will all be **strict track** with platform-specific aspect ratios + safe zones — **post-launch.**

---

## 2. Creative track — hardened generation pipeline

### Prompt structure (replaces current Beta prompt)

The current prompt structure has style direction first, which means creativity overrides identity. New structure (built in [packages/ai/src/pipeline/prompt-builder.ts](../../packages/ai/src/pipeline/prompt-builder.ts), replacing [style-prompts-v5.ts](../../packages/ai/src/pipeline/style-prompts-v5.ts)):

```
PRIMARY OBJECTIVE
=================
Faithfully reproduce the product shown in the reference image. The product's exact 
shape, color, materials, logos, text, packaging, proportions, and details must be 
preserved without alteration.

CRITICAL NEGATIVE CONSTRAINTS (MUST NOT APPEAR)
================================================
{extracted negatives from instruction parser, e.g. "no garnish, no steam, no model"}

BRAND CONTEXT
=============
{brand summary from BrandProfile if present, with tone/aesthetic/palette}

PRODUCT CATEGORY
================
Category: {category}
Category rules for this generation:
{category-specific rules — e.g., for clothing: "if no model requested, place on 
ghost mannequin or invisible-form display"}

STYLE DIRECTION
===============
Style: {style name}
{style template — base creative direction}
{per-style creative direction from Creative Brief}

USER INSTRUCTIONS FOR THIS POSITION
====================================
{user's specific instructions for this style/position, if any}

ASPECT + COMPOSITION
====================
Aspect ratio: 1:1 (square)
Identity anchoring: The first reference image is the source of truth for product appearance.
```

### Category rules library

New file [packages/ai/src/pipeline/category-rules.ts](../../packages/ai/src/pipeline/category-rules.ts):

```typescript
export const CATEGORY_RULES: Record<string, string> = {
  jewellery: 
    "Use a jewelry display stand, velvet bust, or floating macro setup. " +
    "Avoid model unless explicitly requested. " +
    "Highlight gem clarity, metal finish, and craftsmanship. " +
    "Tiny products: macro composition with shallow depth of field.",
  
  garment: 
    "If 'no model' or 'no human' requested, use a ghost mannequin (invisible-form display) " +
    "or a fabric-draped mannequin. Never use a flat lay unless requested. " +
    "Preserve stitching, fabric texture, color, and silhouette exactly.",
  
  food: 
    "Plating must be stable and appetizing. " +
    "Preserve garnish/sauce as shown unless user says otherwise. " +
    "No steam, no hands, no extra props unless requested. " +
    "Marketplace-style framing for delivery platforms.",
  
  skincare: 
    "Reflective luxury lighting. Soft shadows. " +
    "Preserve label typography exactly. " +
    "Container geometry (cap, dropper, pump) must match input precisely.",
  
  candle: 
    "If candle is unlit in input, keep unlit. If lit, preserve flame appearance. " +
    "Container shape and label preserved exactly.",
  
  bag: 
    "Show bag at marketplace-standard angle (3/4 view typical). " +
    "Preserve hardware (zippers, buckles, logos). " +
    "Strap drape natural.",
  
  electronics: 
    "Edge precision and symmetry. " +
    "Preserve ports, buttons, and branding exactly. " +
    "Reflective surfaces handled cleanly without halo artifacts.",
  
  general: 
    "Preserve product identity exactly. " +
    "Marketplace-safe composition.",
};
```

These rules are inserted into the prompt based on the Light Analyzer's category output. Already classified — no extra LLM call needed.

### Verification (drift detection)

New file [packages/ai/src/qa/verify.ts](../../packages/ai/src/qa/verify.ts):

```typescript
export interface VerificationResult {
  identityPreserved: boolean;
  driftScore: number;          // 0-100, 0 = perfect, 100 = completely different
  driftReasons: string[];      // e.g. ["color changed", "logo missing", "shape distorted"]
  negativesViolated: string[]; // negatives that appear in output despite constraint
}

export async function verifyGeneration(
  inputBuffer: Buffer,
  outputBuffer: Buffer,
  negatives: string[],
): Promise<VerificationResult> {
  // Single Gemini 2.5 Flash vision call with structured output (zod schema)
  // System prompt asks: "Compare reference image to generated image. Is the product 
  // identity preserved? List specific differences. Did any of these negatives appear: [...]?"
  // Cost: ~₹0.10 per call. Latency: ~2-3s.
}
```

**Decision logic:**

```typescript
const DRIFT_THRESHOLD = 30;  // tunable based on real test data

function shouldRetry(v: VerificationResult): boolean {
  return v.driftScore > DRIFT_THRESHOLD || v.negativesViolated.length > 0;
}

function shouldAccept(v: VerificationResult, attempt: number): boolean {
  // After 1 retry, accept whatever we have rather than refund
  return attempt >= 2 || v.driftScore <= DRIFT_THRESHOLD;
}
```

### Per-style execution

```typescript
async function generateStyleCreative(params): Promise<StyleResult> {
  let attempt = 1;
  const prompt = buildPrompt(params);
  
  // Attempt 1: Tier 1
  let output = await geminiProImage(prompt, params.referenceImages);
  
  if (!output) {
    // Tier 1 safety-refused — escalate to Tier 2 (no retry on Tier 1)
    output = await gptImage2(prompt, params.referenceImages);
    if (!output) return { tier: 'refund' };  // both refused
    const v = await verifyGeneration(input, output, negatives);
    return { tier: 2, output, verification: v };  // accept whatever Tier 2 gave us
  }
  
  let v = await verifyGeneration(input, output, negatives);
  if (!shouldRetry(v)) return { tier: 1, output, verification: v, attempts: 1 };
  
  // Drift detected — retry Tier 1 once
  attempt = 2;
  output = await geminiProImage(prompt, params.referenceImages);  // same prompt, new attempt
  
  if (!output) {
    // Pro started refusing on retry — accept previous output rather than escalate
    return { tier: 1, output: previousOutput, verification: v, attempts: 2, note: 'retry_refused' };
  }
  
  v = await verifyGeneration(input, output, negatives);
  // Whether v passes or not, accept this attempt (hard cap on retries)
  return { tier: 1, output, verification: v, attempts: 2 };
}
```

---

## 3. Strict track — segmentation + composite

### Pipeline

```
Input product photo
    │
    ▼
[BiRefNet v2]  fal.ai — accurate edge extraction with alpha mask
    │  Cost: ~₹2/call
    │  Output: PNG with alpha channel (product cutout)
    │
    ▼
[Composite onto target background]  sharp — pure local op, free
    │  - Target background: pure white (#FFFFFF) for White Studio
    │  - Center the product, with marketplace-safe padding
    │  - Calculate optimal scale based on product dimensions
    │
    ▼
[Lighting reconstruction]  Flux inpainting on shadow area only
    │  Cost: ~₹1-2/call
    │  Mask: small region under the product for soft shadow + contact shadow
    │  Prompt: "soft natural shadow under product, contact shadow on white surface, 
    │          ecommerce product photography lighting"
    │
    ▼
[Optional refinement]  Flux Kontext for edge cleanup, color accuracy
    │  Only if quality check flags issues
    │  Cost: ~₹1/call
    │
    ▼
[Verify]  Lighter check — does the output look like a clean product photo?
    │  Cost: ~₹0.05/call (smaller prompt)
    │
    ▼
Deliver
```

**Total cost per White Studio output: ~₹3-5** (vs ₹13.40 in current pipeline). And **near-100% identity preservation** because we're never asking a model to regenerate the product.

### What about cutout failure?

If BiRefNet fails or returns a poor mask (rare for clear product photos, but possible for very low-contrast products):
- **Fallback 1**: Try `fal-ai/imageutils/rembg` (different bg-removal model). Cost: ~₹1.
- **Fallback 2**: If both fail, **escalate to creative track** as last resort. This is the only case where a strict-track style touches Gemini Pro. Logged as `strict_fallback_to_creative`.

### Why no Tier 2 here?

The strict track doesn't generate — it composites. Safety refusal is N/A. Either segmentation works (99%+ on clear product photos) or we fall back to creative track.

### White Studio specific config

```typescript
export const WHITE_STUDIO_CONFIG = {
  background: '#FFFFFF',
  composition: 'centered',
  paddingPercent: 12,        // marketplace-safe whitespace
  shadowOpacity: 0.15,
  shadowSoftness: 'medium',
  outputAspect: '1:1',
  refinementMode: 'only-if-flagged',
};
```

Future marketplace presets will be variants of this config (Amazon needs 85% product, Zomato needs landscape, etc.).

---

## 4. Pipeline cleanup

### Delete
- `packages/ai/src/pipeline/_archive/` entire folder
- Specifically: art-director.ts, composite-engine.ts (note: rebuild it fresh in strict track, don't resurrect the old one), composition-library.ts, content-safety.ts, gemini-pipeline-v5.ts, metrics.ts, README.md
- Audit [packages/ai/src/index.ts](../../packages/ai/src/index.ts) — remove exports that aren't imported by `apps/worker` or `packages/session`.

### Restructure
- New file [packages/ai/src/pipeline/prompt-builder.ts](../../packages/ai/src/pipeline/prompt-builder.ts) — replaces style-prompts-v5.ts
- New file [packages/ai/src/pipeline/category-rules.ts](../../packages/ai/src/pipeline/category-rules.ts) — category prompt fragments
- New directory [packages/ai/src/strict/](../../packages/ai/src/strict/) — segmentation + composite + lighting code
- New file [packages/ai/src/qa/verify.ts](../../packages/ai/src/qa/verify.ts) — drift detection
- Production.ts becomes a thinner orchestrator that delegates to either track.

### Env var consolidation

| Current | Action |
|---|---|
| `GEMINI_API_KEY` | **Keep** — primary single-key var |
| `GEMINI_API_KEYS` | **Keep** — plural for multi-key pool |
| `GOOGLE_AI_API_KEY` | **Delete** — legacy alias, replace usages with `GEMINI_API_KEY` |
| `GOOGLE_GENAI_API_KEY` | **Delete** — leftover from rebuild, replace usages with `GEMINI_API_KEY` |
| `GEMINI_IMAGE_MODEL` | **Delete** — no longer used (model hardcoded to Tier 1/Tier 2 constants) |

Audit other providers similarly:

| Provider | Singular | Plural | Notes |
|---|---|---|---|
| Gemini | `GEMINI_API_KEY` | `GEMINI_API_KEYS` | Costly — get 3 keys |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_API_KEYS` | Costly — get 2-3 keys |
| fal.ai | `FAL_KEY` | `FAL_KEYS` | Get 2 keys |
| Groq | `GROQ_API_KEY` | `GROQ_API_KEYS` | 1 key OK at launch volume |
| Sarvam | `SARVAM_API_KEY` | `SARVAM_API_KEYS` | Optional |

Update `.env.example` to clearly mark which are required vs optional, and which support plural form.

---

## 5. Edge case templates

These are **per-category modifications** that activate when Light Analyzer detects specific product attributes:

| Attribute | Modification |
|---|---|
| `transparent glass` (detected via vision: "transparent", "clear", "glass bottle") | Add to prompt: "preserve transparency, show through correctly, no opacity drift" |
| `reflective metal` | Add: "controlled metallic highlights, no halo artifacts, accurate specular reflection" |
| `embroidered fabric` | Add: "preserve embroidery pattern, thread detail, texture exactly" |
| `white-on-white product` | Add: "subtle shadow separation, no merging with background, distinct silhouette" |
| `black product on dark scene` | Add: "preserve form via highlights and contour, no detail loss in shadows" |
| `tiny jewelry` | Trigger macro composition, depth-of-field hint |
| `food with steam/sauces` | If user said "no steam", strict enforcement; otherwise show natural steam |
| `folded clothes` | Preserve folds exactly |
| `text/logos on product` | Add: "preserve all text and logos exactly as shown, no modification, no rotation" |

Light Analyzer schema extended to surface these as boolean flags:

```typescript
LightAnalysisSchema {
  // existing fields...
  isTransparent: boolean,
  isReflectiveMetal: boolean,
  hasEmbroidery: boolean,
  isLowContrastVsBackground: boolean,
  hasTextOrLogo: boolean,
  // ...
}
```

Cost: same as current Light Analyzer call (~₹0.03), just more output fields. No extra calls.

---

## 6. Negative instruction enforcement

Two-layer enforcement:

### Layer 1 — Prompt-level (preventative)
Instruction parser (post-onboarding Phase 11) already extracts negatives. Wire them into the prompt builder's "CRITICAL NEGATIVE CONSTRAINTS" section. Hard listing.

### Layer 2 — Verification-level (detective)
The verification step (Gemini 2.5 Flash vision) explicitly checks for negative violations:

```
System prompt to verifier:
"...The following must NOT appear in the output. Check each carefully:
1. No model/human/person
2. No garnish
3. No steam
...
Return: { negativesViolated: [list of negatives found in output] }"
```

If `negativesViolated` is non-empty, treat as drift → retry once.

---

## 7. API key management + backup strategy

### Required keys at launch

| Provider | Min keys | Reason | Cost-bearing |
|---|---|---|---|
| Gemini | **3** | Tier 1 image gen — most expensive. Rate limits common. | Yes — primary cost driver |
| OpenAI | **2** | Tier 2 fallback. Lower volume but critical when fires. | Yes |
| fal.ai | **2** | Strict track (BiRefNet, Flux). | Light usage |
| Groq | 1 | Voice transcription. Free tier sufficient at launch. | No (free tier) |
| Sarvam | 1 (optional) | Hindi voice fallback. Optional. | Pay-as-you-go |

### How to acquire backup keys

For each costly provider:
- Create a separate billing-capable account (use a different email if necessary)
- Generate an API key
- Add to `.env` as `GEMINI_API_KEYS=key1,key2,key3` (comma-separated)
- Restart workers — keypool picks them up automatically

### Key rotation playbook

If a key gets banned, rate-limited persistently, or quota-exhausted:
1. The keypool marks it unhealthy and routes to siblings (zero downtime)
2. Sentry alert fires on `KeyPoolExhaustedError`
3. Founder rotates the key in Razorpay/provider dashboard
4. Update `.env`, redeploy

### Cost monitoring per key
Future: add a `key_id` field to per-call cost tracking so we can see if one key is incurring outsized cost (suggests prompt regression or abuse).

---

## 8. Cost monitoring + observability

### Per-order cost tracking (new)

Add `Order.actualCostInr Decimal?` column. Worker writes total cost on completion, including:
- Per-style generation cost (Tier 1, Tier 2, segmentation as appropriate)
- Per-style verification cost
- Per-style retry costs (with attempt counts)
- Supporting calls (Creative Brief, Light Analyzer, Instruction Parsing, Voice transcription)

Cost is logged to a structured pino event on every order completion:

```json
{
  "event": "order_cost_summary",
  "orderId": "...",
  "styles": [
    { "style": "style_clean_white", "track": "strict", "cost": 4.20, "attempts": 1 },
    { "style": "style_lifestyle", "track": "creative", "tier": 1, "cost": 13.50, "attempts": 1 },
    { "style": "style_outdoor", "track": "creative", "tier": 1, "cost": 26.80, "attempts": 2 }
  ],
  "supportingCalls": { "brief": 0.10, "lightAnalyzer": 0.03, "verify": 0.30 },
  "totalCost": 44.93,
  "revenue": 147,
  "margin": 102.07,
  "marginPct": 69.4
}
```

This is structured so we can later pipe to a dashboard / dump to CSV for analysis.

### Alerting
- Sentry alert if any single order exceeds ₹80 in cost (suggests a runaway loop)
- Sentry alert on `KeyPoolExhaustedError`
- Sentry alert on >3 consecutive Tier 2 fires in 10 min (possible Gemini-side outage)

---

## 9. Build phases

Continuing from post-onboarding's Phase 16 sequence.

### Phase 17 — Cleanup + env consolidation (½ day)
- Delete `_archive/`
- Consolidate Gemini env vars (drop `GOOGLE_AI_API_KEY`, `GOOGLE_GENAI_API_KEY`, `GEMINI_IMAGE_MODEL`)
- Audit unused exports from `index.ts`
- Update `.env.example`
- **Test gate:** existing pipeline still runs after cleanup (test-016)

### Phase 18 — Prompt restructure + category rules (1 day)
- New `prompt-builder.ts` with hierarchy structure
- New `category-rules.ts` library
- Update Light Analyzer schema with edge-case flags
- Wire into existing production.ts
- **Test gate:** test-017 — run test-001 scenario, verify product fidelity improved

### Phase 19 — Verification step + retry logic (1-2 days)
- New `qa/verify.ts` with drift detection
- Wire into production.ts per-style execution
- Implement attempt budget + accept-on-second-fail
- Cost monitoring writes to Order
- **Test gate:** test-018 — submit edge cases (logo product, transparent product), verify retry kicks in only on drift

### Phase 20 — Strict track for White Studio (2-3 days)
- New `strict/` directory
- Segmentation via BiRefNet (already have client)
- Composite via sharp (centered, marketplace-padded)
- Shadow reconstruction via Flux inpainting
- Lighter verification for strict track
- Wire White Studio to strict track
- **Test gate:** test-019 — White Studio output on 5 different product types, compare to current. Co-founder approves quality.

### Phase 21 — Negative enforcement + edge case templates (½ day)
- Wire negatives from instruction parser into prompt's "CRITICAL NEGATIVE CONSTRAINTS"
- Wire edge-case flags from Light Analyzer into category rules
- Update verification to check negatives in output
- **Test gate:** test-020 — submit "no garnish" instruction on food, "no model" on clothing, verify negatives respected

### Phase 22 — Brand context injection (½ day — already in post-onboarding Phase 5)
- Read `BrandProfile.summary` in prompt builder
- Inject into "BRAND CONTEXT" section
- Falls back to empty if no profile exists
- **Test gate:** test-021 — same product, with vs without brand profile, verify aesthetic differences

### Phase 23 — Backup API keys + monitoring (½ day)
- Generate backup keys for Gemini (3 total), OpenAI (2), fal.ai (2)
- Update `.env` to use plural forms (`GEMINI_API_KEYS=k1,k2,k3`)
- Sentry alerts on `KeyPoolExhaustedError`, runaway cost, consecutive Tier 2 fires
- **Test gate:** test-022 — simulate one key being banned, verify pool rotates automatically

### Phase 24 — Final cost + quality validation (½ day)
- Run a batch of 20 representative orders across all 9 styles
- Verify per-order cost stays under ₹50 average
- Verify margin floor of 65% maintained
- Verify White Studio quality is marketplace-grade
- **Test gate:** test-023 — full end-to-end with cost summary

**Total effort: ~7 days** on top of the onboarding + post-onboarding rebuilds.

---

## 10. Risks and unknowns

1. **Verification false-positives.** Gemini Flash vision might flag drift that doesn't really exist. Tunable threshold helps. May need to gather real-world data and adjust over time. Worst case: more retries than needed (higher cost) but never blocked outputs.

2. **BiRefNet quality on hard products.** Transparent glass, white-on-white, low-contrast products may produce bad cutouts. Fallback to `rembg` model and finally to creative track. Logged so we can identify problem categories.

3. **Flux inpainting cost on shadows.** Estimated ₹1-2/call but could vary by image size. Need to measure real cost in Phase 20.

4. **Tier 2 (GPT-image-2) is still in preview.** OpenAI could change behavior, pricing, or deprecate. If it goes away, our only fallback is segmentation track for everything, which only works for "product on background" styles. Mitigation: monitor OpenAI changelog.

5. **Gemini 3 Pro Image Preview deprecation risk.** Same as above. Both image models are preview-tier. We're essentially dependent on these specific models. Plan to evaluate alternates (Imagen 4, Flux Pro) before launch.

6. **Brand context bloats the prompt.** Long brand summaries + category rules + style prompt + user instructions could push past Gemini Pro's effective context window. May need to truncate or summarize brand context aggressively. Monitor in Phase 22.

7. **Margin compression on high-instruction orders.** If user gives complex per-style instructions that consistently cause drift → more retries → cost goes up. Worth tracking which users / categories trigger this most.

8. **"Accept on second drift" may produce unsatisfied users.** Some users will receive a slightly-off output and want a refund. Refund pipeline handles this — we eat the refund cost but it's still cheaper than infinite retries. Track refund rate by output drift score to see if we're calibrated.

---

## 11. Out of scope

- Marketplace presets (Amazon/Nykaa/Zomato/Shopify/Instagram) — post-launch additions to strict track.
- Multi-product orders — out of scope for v1.
- "Strict vs Creative" user-facing toggle — implicit per style only.
- Custom shadow direction / time-of-day controls — too advanced for v1.
- Model fine-tuning on brand-specific data — way out of scope.
- Realtime cost dashboard — JSONL logs for v1, dashboard later.
- Per-key cost attribution in the keypool — nice-to-have, not blocking.

---

## 12. What this changes downstream

- **post-onboarding Phase 5 (brand injection)** is absorbed into Phase 22 of this plan.
- **post-onboarding Phase 11 (instruction mapping)** is still its own work — but its output is consumed by the new prompt builder.
- **Test gates in this plan use test-016 through test-023** — incrementing from where the post-onboarding plan ends.

---

## 13. Ready to start?

Phase 17 (cleanup) is the gate. Once that's done and tests still pass, we sequentially build the rest.

Estimated total: **~7 days of focused work**, slotting in after the onboarding + post-onboarding rebuilds. Phase 20 (strict track for White Studio) is the highest-value single phase — it fixes the most visible quality bug AND saves money. Worth prioritizing if we need to ship sooner with cuts.
