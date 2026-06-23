# AI pipeline — current state

Reference doc describing exactly what the ad-generation engine looks like today. Built from reading [packages/ai/src/](../packages/ai/src/).

This is the **V1 production chain** (post-rebuild — V1-V5 history is in [pipeline/_archive/](../packages/ai/src/pipeline/_archive/)).

---

## 1. High-level flow

```
Worker receives image-processing job (orderId, styles[], imageUrls[], userInstructions?)
    │
    ▼
[Preprocess]  sharp: HEIC→JPEG, EXIF rotate, resize to 4000px max, quality-92 JPEG
    │
    ▼
[Creative Brief]  Gemini 2.5 Flash — single call per order
    │  Inputs: all product photos + style names
    │  Output: { productProfile, perStyleDirection[] }
    │  Latency: ~3-5s. Cost: ~₹0.10/order
    │  On failure: pipeline falls back to base Beta prompt (proven default)
    │
    ▼
[Instruction Parsing]  Gemini 2.0 Flash Lite — if userInstructions provided
    │  Maps raw text → { perStyle: {...} } or { perPhoto: {...} }
    │  Latency: ~1-2s. Cost: ~₹0.05/order
    │
    ▼
For each of N styles (in parallel via Promise.all):
    │
    ▼
[Build Beta prompt]  style template + per-style creative direction + per-style user instruction + per-category nudge
    │
    ▼
[Tier 1]  Gemini 3 Pro Image Preview
    │  Inputs: prompt + product photo (duplicated as first reference for identity anchoring)
    │  Temperature: 0.3 (conservative)
    │  Timeout: 3 minutes
    │  Cost: $0.134 / ₹13.40 per image
    │  On success → [Deterministic QA] → [Post-process] → done
    │  On failure → Tier 2
    │
    ▼
[Tier 2]  GPT-image-2 (OpenAI)
    │  Independent safety filters from Gemini — fires when Pro safety-refuses
    │  Timeout: 150s
    │  Cost: $0.21 / ₹21.00 per image
    │  On success → [Deterministic QA] → [Post-process] → done
    │  On failure → tier='refund', order needs refund
    │
    ▼
[Deterministic QA]  sharp (no LLM, ~50ms)
    │  Checks: blur, blank canvas, wrong aspect ratio, product duplication, color shift, fill %
    │  Soft signals only — doesn't reject, just logs
    │
    ▼
[Post-process]  AI label overlay, final upload to Supabase Storage `final-outputs` bucket
    │
    ▼
Worker pushes WhatsApp message to user
```

---

## 2. Models in use — complete inventory

### Image generation (the expensive part)

| Tier | Model | Provider | Cost (per image) | Timeout | Purpose |
|---|---|---|---|---|---|
| Tier 1 | `gemini-3-pro-image-preview` | Google | $0.134 (₹13.40) | 3 min | Primary generation. Temperature 0.3 for faithfulness. |
| Tier 2 | `gpt-image-2` | OpenAI | $0.21 (₹21.00) | 150s | Fallback when Gemini safety-refuses. Independent safety stack. |

**Why no middle tier?** The pipeline used to have NB2 (Nano Banana 2) as Tier 2 with Gemini's safety stack. Comment in [production.ts:9-11](../packages/ai/src/pipeline/production.ts:9): *"when Pro safety-refuses, NB2 ~95% refuses too (shared backend), so paying ₹4.50 to almost-never-succeed is wasted spend."* So they removed it.

### Supporting LLM calls (cheap)

| Purpose | Model | Provider | Cost/call | Latency | Where |
|---|---|---|---|---|---|
| Creative Brief (per-order, per-style direction) | `gemini-2.5-flash` | Google | ~₹0.10/order | 3-5s | [creative-brief.ts](../packages/ai/src/pipeline/creative-brief.ts) |
| Light Analyzer (7-field product analysis) | `gemini-2.5-flash` | Google | ~₹0.03 | ~3s | [light-analyzer.ts](../packages/ai/src/pipeline/light-analyzer.ts) — used for routing/labeling |
| Instruction Parsing — per-style mapping | `gemini-2.0-flash-lite` | Google | ~₹0.05 | 1-2s | [instructions/parse-per-style.ts](../packages/ai/src/instructions/parse-per-style.ts) |
| Instruction Parsing — per-photo mapping | `gemini-2.0-flash-lite` | Google | ~₹0.05 | 1-2s | [instructions/parse-per-photo.ts](../packages/ai/src/instructions/parse-per-photo.ts) |
| Voice interpretation | `gemini-2.5-flash` | Google | ~₹0.02 | 1-2s | [voice/interpret.ts](../packages/ai/src/voice/interpret.ts) — post-transcription cleanup |
| Background removal (BiRefNet) | `fal-ai/birefnet/v2` | fal.ai | low | a few s | [fallback.ts](../packages/ai/src/pipeline/fallback.ts) — used in some style paths |

### Voice transcription

| Use case | Model | Provider | When |
|---|---|---|---|
| Default voice-note transcription | `whisper-large-v3-turbo` | Groq | All voice notes first |
| Hindi voice fallback | `saaras:v3` | Sarvam AI | When Whisper output looks like garbled Hindi |

### Language detection
- Hinglish/Hindi/English detection in [language/detect.ts](../packages/ai/src/language/detect.ts)
- Has a **regex fast-path** for common patterns (cheap, deterministic)
- Falls back to Gemini call for ambiguous input

---

## 3. The Beta prompt — how prompts are actually built

In [style-prompts-v5.ts](../packages/ai/src/pipeline/style-prompts-v5.ts), each style has:

1. A **base art direction** template (the style's "essence")
2. Hooks for:
   - Per-style creative direction from Creative Brief (10-25 words)
   - Per-style user instructions (from instruction parser)
   - Per-category nudge (jewellery gets different language than food)
   - Identity anchoring instruction ("preserve product exactly as shown")
   - Forced 1:1 aspect ratio (for consistency across 3 styles in one order)

Final prompt looks like:
```
[Style art direction]
[Per-style creative direction from Creative Brief]
[Optional: user instructions for this style]
[Category-specific nudge]
[Identity anchoring + aspect lock]
```

The same input photo is **duplicated as the first reference image** to anchor product identity — prevents drift between styles.

---

## 4. Multi-key failover — `@autmn/keypool`

5 providers supported, each with its own pool:

| Provider | Env var (single) | Env var (plural) | Purpose |
|---|---|---|---|
| `gemini` | `GEMINI_API_KEY` | `GEMINI_API_KEYS` (comma-separated) | All Gemini calls (image gen, creative brief, parsing, light analyzer, voice interpret) |
| `openai` | `OPENAI_API_KEY` | `OPENAI_API_KEYS` | GPT-image-2 (Tier 2 image gen) |
| `fal` | `FAL_KEY` (or `FAL_API_KEY`) | `FAL_KEYS` | BiRefNet background removal |
| `groq` | `GROQ_API_KEY` | `GROQ_API_KEYS` | Whisper transcription |
| `sarvam` | `SARVAM_API_KEY` | `SARVAM_API_KEYS` | Hindi voice fallback |

**How it works** ([keypool/src/pool.ts](../packages/keypool/src/pool.ts)):
- Round-robin across all healthy keys for a provider
- On error, the pool classifies via HTTP status:
  - `429` (rate limit) → cool down that key for N minutes
  - `401`/`403` (auth/quota) → mark key unhealthy long-term
  - `5xx` (server) → short cool-down, retry on next
- Next acquire grabs a different healthy key
- `KeyPoolExhaustedError` raised when no healthy keys left
- Keys never logged in full — only masked hints (last 4 chars)

This is your **production reliability play** — you can rotate keys without code changes, and a single bad key doesn't take down the whole provider.

---

## 5. Env vars currently in use

Pipeline-relevant env vars from `.env.example` and code inspection:

| Variable | Required for | Notes |
|---|---|---|
| `GEMINI_API_KEY` | All Gemini calls | Primary. Can also use `GEMINI_API_KEYS=key1,key2,key3` for multi-key pool. |
| `GOOGLE_AI_API_KEY` | (legacy) | Older code references this — may be redundant with `GEMINI_API_KEY` |
| `GOOGLE_GENAI_API_KEY` | New @google/genai SDK | Used by newer code paths |
| `GEMINI_IMAGE_MODEL` | Override image model | Optional; defaults to `gemini-2.0-flash-preview-image-generation` in legacy path |
| `OPENAI_API_KEY` | Tier 2 image gen | Or `OPENAI_API_KEYS` for pool |
| `FAL_KEY` | BiRefNet bg removal | Or `FAL_KEYS` for pool |
| `GROQ_API_KEY` | Voice transcription primary | Or `GROQ_API_KEYS` for pool |
| `SARVAM_API_KEY` | Hindi voice fallback | Optional |

**Note**: there are 3 different Gemini-related env var names (`GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`, `GOOGLE_GENAI_API_KEY`). This is messy — looks like the rebuild left some legacy aliases. Worth cleaning up to a single canonical name.

---

## 6. Cost per order — current numbers

### Best case (3 styles, all Tier 1 success, no voice)

| Step | Cost |
|---|---|
| Creative Brief | ₹0.10 |
| Light Analyzer | ₹0.03 |
| Instruction Parsing | ₹0.05 (if instructions provided) |
| 3× Gemini Pro Image | 3 × ₹13.40 = ₹40.20 |
| **Total** | **~₹40.40** |

At new pricing of ₹49 × 3 = ₹147 per paid order → **gross margin ~₹107 (73%)** before fixed costs (Supabase storage, Railway compute, Razorpay fees).

### Voice note adds
| | |
|---|---|
| Groq Whisper transcription | ~₹0.02 |
| Voice interpretation (Gemini Flash) | ~₹0.02 |

### Worst case (1 style fell to Tier 2)
Tier 1 attempted (₹13.40) + Tier 2 succeeded (₹21.00) = **₹34.40 for that one style**, all others stay at ₹13.40. Order cost climbs to ~₹61. Still profitable.

### Refund case (both tiers failed all 3 styles)
₹40.20 (Tier 1 attempts) + ₹63.00 (Tier 2 attempts) + brief + parsing = **~₹103.40 lost**. User refunded ₹147. **₹103 net loss per fully-refunded order.**

### First-free order
User pays ₹0. We pay ~₹40 for the AI. **₹40 acquisition cost per new user** at break-even pipeline cost.

---

## 7. What's been deliberately removed (and why)

From the [production.ts header comment](../packages/ai/src/pipeline/production.ts:1-27):

| Removed | Reason |
|---|---|
| NB2 (Nano Banana 2) middle tier | ~95% refusal rate when Pro refuses (shared safety backend); not worth ₹4.50/attempt |
| QA gate (LLM grading output) | V5 experiments showed gains weren't worth cost+latency |
| Content-safety preflight | Removed in cleanup |
| Art Director step | Removed in cleanup |
| Light analysis on prompt path | Beta prompt ignores `productName`; light analyzer kept only for routing/labeling |
| Video generation (Ken Burns videos) | Removed entirely with `ai/video/` subtree |

**What stayed** as "reliability levers at zero added cost":
- Beta prompt structure (style + ad-mode + per-category nudge)
- Identity anchoring (input as first reference image)
- Temperature 0.3 (less product drift)
- Forced 1:1 aspect (consistency across styles)
- Deterministic sharp-based defect detection (50ms, no LLM)

---

## 8. Parallel execution

All N style jobs run in **`Promise.all`** in [production.ts](../packages/ai/src/pipeline/production.ts) — they're independent. This is why 3-style orders take ~the same wall-clock time as 1-style orders (~2 minutes typical, capped by Gemini Pro's response time).

---

## 9. What's missing / risks

### Operational gaps
1. **Three Gemini env vars** floating around (`GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`, `GOOGLE_GENAI_API_KEY`). Should consolidate to one canonical name.
2. **No cost tracking per order in DB.** `Order` schema doesn't store actual costs incurred; can't compute real margin from data.
3. **No model version pinning beyond constants.** Gemini "gemini-3-pro-image-preview" is a preview model — Google could change behavior or deprecate it. Need a fallback plan.
4. **`gpt-image-2` is OpenAI's new model**, also still in preview. Same risk.
5. **No evals / regression tests** on actual generation quality. Test 001 was manual visual inspection. No automated way to know if a prompt change made things worse.
6. **No A/B infrastructure** for experimenting with prompts, temperatures, models.
7. **Refund-tier logic** marks the order as needing refund, but the worker integration with refund flow needs verification — does it actually trigger the refund flow we just designed, or just log?

### Reliability gaps
1. **No prompt caching** between styles in the same order. Each style does a fresh Pro call with full prompt. Gemini supports prompt caching now and could save 30-50% on repeated context (brand summary, product photo).
2. **No retry within a tier.** A Gemini 5xx error fails to Tier 2 immediately instead of retrying once. With Groq/Sarvam transcription there's retry, but not on image gen.
3. **Hard timeouts** (3 min Gemini, 150s OpenAI) might be aggressive on slow connections from India. Worth measuring p99 latencies.

### Quality unknowns
1. **No measurement of how often Tier 2 fires.** Is it 1%? 10%? Hard to budget cost without this.
2. **No measurement of how often "Anything You Want" produces good output** (once that's implemented). The free-form path is the highest-variance.
3. **Brand summary injection (post-onboarding plan Phase 5) hasn't happened yet** — the AI doesn't currently see brand context.

### Cost concerns
1. **First-free orders are pure cost** at ~₹40/order. If we get spammed with new-phone signups, this scales linearly.
2. **Worst-case refund cycle** costs us ₹103. If even 5% of orders refund, average margin drops materially.

---

## 10. What we already have that's good

- **Multi-key pool with health-aware failover** — production-quality reliability layer
- **Two independent safety stacks** (Gemini + OpenAI) so safety-refusals aren't a dead-end
- **Deterministic QA** in sharp, no LLM tax
- **Identity anchoring** prevents drift across the 3 styles
- **Parallel execution** keeps multi-style orders fast
- **Sensible defaults** — temperature, aspect lock, beta prompt
- **Clean fallbacks** — Creative Brief failure doesn't break pipeline, transcription has Sarvam fallback, instruction parser has fallback

---

## 11. Summary of API keys / accounts you need

| Provider | Account URL | What it covers | Cost-bearing? |
|---|---|---|---|
| Google AI Studio | aistudio.google.com | Gemini (Pro Image, 2.5 Flash, 2.0 Flash Lite) | Yes — main image gen |
| OpenAI Platform | platform.openai.com | GPT-image-2 | Yes — Tier 2 fallback |
| fal.ai | fal.ai | BiRefNet (background removal) | Light usage |
| Groq | console.groq.com | Whisper Turbo transcription | Free tier likely enough |
| Sarvam AI | sarvam.ai | Hindi transcription fallback | Optional, paid |

**Recommendation**: get 2-3 keys per provider for Gemini and OpenAI specifically (the costly ones) so the keypool can rotate on rate limits and key bans. One key per provider works but is fragile.
