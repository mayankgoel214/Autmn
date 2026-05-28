/**
 * Phase 9 — WhatsApp Flow JSON definitions.
 *
 * The Meta Business Manager dashboard expects each Flow as a JSON document
 * defining screens, components, and routing. We keep those documents here
 * as TypeScript builders so the rest of the codebase (state-machine handlers,
 * tests) can reference the screen + field names from typed constants instead
 * of duplicating literals.
 *
 * Activation requires manual dashboard setup — see docs/runbooks/whatsapp-flows.md
 * for the step-by-step. Flows stay disabled until WHATSAPP_FLOWS_ENABLED=true
 * AND the relevant `*_FLOW_ID` env vars are filled in.
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/flows
 */

// ---------------------------------------------------------------------------
// Screen + field names — shared between the dashboard JSON and the handlers
// ---------------------------------------------------------------------------

export const StylePickerFlow = {
  /** Initial screen the user lands on when they tap the CTA. */
  INITIAL_SCREEN: 'STYLE_PICKER',
  /** Field id of the multi-select containing the 9 individual styles. */
  STYLES_FIELD: 'selected_styles',
  /** Maximum number of styles the multi-select allows. Mirrors OUTPUT_STYLES_PER_ORDER. */
  MAX_SELECTIONS: 3,
} as const;

// ---------------------------------------------------------------------------
// Flow JSON payload — paste this into the Meta Business Manager dashboard.
//
// The dashboard expects the JSON wrapped in a top-level "version" + "screens"
// envelope; we generate that envelope from the builder below. The Flow ID
// returned by the dashboard goes into env WHATSAPP_STYLE_PICKER_FLOW_ID.
// ---------------------------------------------------------------------------

/**
 * Builds the style-picker Flow JSON for Meta Business Manager.
 *
 * The styles list comes from the caller so the same builder can produce
 * localized variants (English vs Hinglish labels) without duplicating the
 * screen structure.
 */
export function buildStylePickerFlowJson(opts: {
  /** Top-of-screen heading (max 80 chars). */
  heading: string;
  /** Sub-heading / instructions (max 600 chars). */
  body: string;
  /** Submit button label (max 20 chars). */
  ctaLabel: string;
  /** Style options — id + label pairs. Order is preserved in the UI. */
  styles: Array<{ id: string; title: string; description?: string }>;
}): Record<string, unknown> {
  return {
    version: '5.0',
    data_api_version: '3.0',
    routing_model: {
      [StylePickerFlow.INITIAL_SCREEN]: [],
    },
    screens: [
      {
        id: StylePickerFlow.INITIAL_SCREEN,
        title: opts.heading,
        terminal: true,
        data: {},
        layout: {
          type: 'SingleColumnLayout',
          children: [
            {
              type: 'TextSubheading',
              text: opts.body,
            },
            {
              type: 'CheckboxGroup',
              name: StylePickerFlow.STYLES_FIELD,
              label: 'Pick up to 3 styles',
              required: true,
              max_selected_items: StylePickerFlow.MAX_SELECTIONS,
              'data-source': opts.styles.map((s) => ({
                id: s.id,
                title: s.title,
                ...(s.description ? { description: s.description } : {}),
              })),
            },
            {
              type: 'Footer',
              label: opts.ctaLabel,
              'on-click-action': {
                name: 'complete',
                payload: {
                  // The values land on the webhook as response_json.<field>.
                  selected_styles: '${form.selected_styles}',
                },
              },
            },
          ],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Flow response narrowing — convenience for state-machine handlers
// ---------------------------------------------------------------------------

export interface StylePickerFlowResponse {
  selectedStyles: string[];
}

/**
 * Narrow a raw Flow response payload into a typed style-picker result.
 * Returns null when the payload is missing or malformed (caller falls back
 * to the legacy list-based picker).
 */
export function parseStylePickerFlowResponse(
  payload: Record<string, unknown> | undefined,
): StylePickerFlowResponse | null {
  if (!payload) return null;
  const raw = payload[StylePickerFlow.STYLES_FIELD];
  if (!Array.isArray(raw)) return null;
  const selected = raw
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, StylePickerFlow.MAX_SELECTIONS);
  if (selected.length === 0) return null;
  return { selectedStyles: selected };
}
