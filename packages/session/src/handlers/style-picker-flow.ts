/**
 * Phase 9 — env-gated WhatsApp Flow style picker.
 *
 * Wraps wa.sendFlow with a feature flag + Flow ID lookup. When the flag
 * is off OR no Flow ID is configured, the caller falls back to the legacy
 * list-based picker (sendStyleList in onboarding.ts) — which means Phase 9
 * code can ship dormant and turn on after dashboard activation without a
 * deploy.
 *
 * Env variables (both required):
 *   WHATSAPP_FLOWS_ENABLED         = "true" to activate
 *   WHATSAPP_STYLE_PICKER_FLOW_ID  = Flow ID from Meta Business Manager
 *   WHATSAPP_STYLE_PICKER_FLOW_MODE= "published" (default) or "draft"
 *
 * See docs/runbooks/whatsapp-flows.md for the dashboard activation steps.
 */

import type { WhatsAppClient } from '@autmn/whatsapp';
import {
  StylePickerFlow,
  parseStylePickerFlowResponse,
  type StylePickerFlowResponse,
} from '@autmn/whatsapp';
import { ListIds, isHindi } from '../types.js';
import type { Language, MessageContext } from '../types.js';
import { styleDisplayName } from '../messages.js';

export interface FlowConfig {
  enabled: boolean;
  flowId: string | null;
  mode: 'published' | 'draft';
}

/** Read Flow config from env at call time. Always cheap; no caching. */
export function readFlowConfig(): FlowConfig {
  const enabled = process.env['WHATSAPP_FLOWS_ENABLED'] === 'true';
  const flowId = process.env['WHATSAPP_STYLE_PICKER_FLOW_ID']?.trim() || null;
  const rawMode = process.env['WHATSAPP_STYLE_PICKER_FLOW_MODE']?.trim();
  const mode: 'published' | 'draft' = rawMode === 'draft' ? 'draft' : 'published';
  return { enabled, flowId, mode };
}

/**
 * Send the style-picker Flow. Returns true if the Flow was sent (caller should
 * NOT also send the legacy list), false if Flows are disabled / unconfigured
 * (caller falls through to sendStyleList).
 */
export async function sendStylePickerFlow(
  phoneNumber: string,
  lang: Language,
  wa: WhatsAppClient,
  flowToken: string,
): Promise<boolean> {
  const cfg = readFlowConfig();
  if (!cfg.enabled || !cfg.flowId) return false;

  const heading = isHindi(lang) ? 'Style chuniye' : 'Pick your style';
  const body = isHindi(lang)
    ? '1-3 styles chuniye — hum 3 creatives banayenge.'
    : "Pick 1-3 styles — we'll generate 3 creatives.";
  const ctaLabel = isHindi(lang) ? 'Aage badhein' : 'Continue';

  // The Flow JSON itself lives in the Meta dashboard; here we just send
  // the seed data the dashboard form needs to render the options.
  const styles = [
    ListIds.STYLE_AUTMN_SPECIAL,
    ListIds.STYLE_CLEAN_WHITE,
    ListIds.STYLE_STUDIO,
    ListIds.STYLE_LIFESTYLE,
    ListIds.STYLE_OUTDOOR,
    ListIds.STYLE_GRADIENT,
    ListIds.STYLE_FESTIVE,
    ListIds.STYLE_WITH_MODEL,
    ListIds.STYLE_ANYTHING_YOU_WANT,
  ].map((id) => ({ id, title: styleDisplayName(id, lang) }));

  await wa.sendFlow(
    phoneNumber,
    body,
    cfg.flowId,
    flowToken,
    ctaLabel,
    StylePickerFlow.INITIAL_SCREEN,
    { styles, heading },
    cfg.mode,
  );
  return true;
}

/**
 * Narrow an incoming MessageContext into a Flow style-picker response, if
 * applicable. Returns null when the message is not a Flow reply or the
 * payload is malformed — caller falls through to legacy list handling.
 */
export function extractStylePickerFlowReply(
  message: MessageContext,
): StylePickerFlowResponse | null {
  if (message.messageType !== 'interactive' || !message.flowResponse) return null;
  return parseStylePickerFlowResponse(message.flowResponse);
}
