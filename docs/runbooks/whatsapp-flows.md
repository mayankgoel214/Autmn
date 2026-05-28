# WhatsApp Flows — activation runbook

This runbook covers the manual dashboard steps required to activate Phase 9's WhatsApp Flow style picker. The codebase already has all the local wiring (Flow JSON builder, `wa.sendFlow`, webhook parsing, env gate, narrowing helpers); only the Meta Business Manager bits remain.

## Why Flows

The legacy list picker (`sendStyleList`) is one-of-N per message and forces multi-step picking via sequential lists. A Flow gives the user a single screen with a checkbox group, a 1-3 selection cap enforced in the UI, and one submission. Same business logic, fewer round-trips.

Until activated, the legacy list picker remains the active path — Phase 9 ships dormant.

## Prerequisites

- Meta Business Manager admin access on the WhatsApp Business Account that owns the production phone number.
- The phone number must be onboarded to Cloud API (not on-premises BSP).
- `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` already in the prod env (they are — confirmed by Phase 0–7 runs).

## Activation steps

### 1. Generate the Flow JSON

```ts
import { buildStylePickerFlowJson, StylePickerFlow } from '@autmn/whatsapp';
import { styleDisplayName } from '@autmn/session/messages';
import { ListIds } from '@autmn/session';

const json = buildStylePickerFlowJson({
  heading: 'Pick your style',
  body: "Pick 1-3 styles — we'll generate 3 ads.",
  ctaLabel: 'Continue',
  styles: [
    ListIds.STYLE_AUTMN_SPECIAL,
    ListIds.STYLE_CLEAN_WHITE,
    ListIds.STYLE_STUDIO,
    ListIds.STYLE_LIFESTYLE,
    ListIds.STYLE_OUTDOOR,
    ListIds.STYLE_GRADIENT,
    ListIds.STYLE_FESTIVE,
    ListIds.STYLE_WITH_MODEL,
    ListIds.STYLE_ANYTHING_YOU_WANT,
  ].map((id) => ({ id, title: styleDisplayName(id, 'en') })),
});

console.log(JSON.stringify(json, null, 2));
```

You'll need TWO versions: one with `'en'` labels and one with `'hinglish'` labels, since Flows don't switch language by user locale. Either:
- Publish two Flows and pick based on `user.language` at send time, OR
- Use English labels for both (acceptable in V1 — most users tap by icon position).

### 2. Create the Flow in Meta Business Manager

1. https://business.facebook.com → WhatsApp Manager → Flows.
2. **Create Flow** → name it `autmn_style_picker_en` (or `_hinglish`).
3. Paste the JSON from step 1 into the JSON editor.
4. **Validate** — Meta's linter should report no errors. If it does, the Flow JSON schema may have moved; check https://developers.facebook.com/docs/whatsapp/flows/reference/components.
5. **Publish** when validation passes.
6. Copy the **Flow ID** (long numeric string).

### 3. Configure env vars in production

In Railway / Vercel / Fly (wherever the API + worker are deployed):

```
WHATSAPP_FLOWS_ENABLED=true
WHATSAPP_STYLE_PICKER_FLOW_ID=<the Flow ID from step 2.6>
WHATSAPP_STYLE_PICKER_FLOW_MODE=published
```

For dashboard testing before going live, use `WHATSAPP_STYLE_PICKER_FLOW_MODE=draft` — the Flow then only fires for users explicitly added to the test list in Meta Business Manager.

### 4. Test on the dashboard test number

1. In Meta Business Manager → WhatsApp Manager → Flows → your published Flow → **Test**.
2. Add your personal WhatsApp number to the test list.
3. From your account, trigger the style picker via a test order (or by hitting `POST /admin/reset/<your-phone>` and starting fresh).
4. Verify the Flow renders, the checkbox group caps at 3 selections, and submission triggers the order flow.

### 5. Verify the webhook plumbing

When the user submits the Flow, Meta POSTs an `interactive.type='nfm_reply'` webhook with `response_json` containing the form values. The webhook handler at `apps/api/src/routes/webhooks/whatsapp.ts` (post-Phase-9) parses this into:

- `MessageContext.flowResponse` — the parsed JSON object
- `MessageContext.flowToken` — the opaque correlation token we passed at send time (we use the session id)
- `MessageContext.flowName` — Meta's `nfm_reply.name`

The state-machine handler then narrows `flowResponse` via `parseStylePickerFlowResponse` from `@autmn/whatsapp` to get a typed `{ selectedStyles: string[] }`.

## Rollback

Set `WHATSAPP_FLOWS_ENABLED=false` and redeploy. `sendStylePickerFlow` becomes a no-op, callers fall through to `sendStyleList`, and everything keeps working with the legacy list picker — no code change required.

## Known limitations (V1)

- **Single Flow per language.** If `WHATSAPP_STYLE_PICKER_FLOW_ID` only points at the English Flow, all users (including Hindi/Hinglish) see English labels. Acceptable for V1 since the style IDs are visual; a follow-up adds per-language Flow IDs.
- **No edit-after-submit.** Once the user submits the Flow, changing the selection means starting a new order (same as the legacy list picker).
- **Mobile WhatsApp only.** Flows render on iOS + Android. WhatsApp Web users get a fallback message asking them to open on their phone — Meta handles this automatically.
