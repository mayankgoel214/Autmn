#!/usr/bin/env tsx
/**
 * Phase 9 smoke — WhatsApp Flows scaffolding (env-gated).
 *
 * Paths:
 *   CD. buildStylePickerFlowJson produces a valid Flow envelope with
 *       version/screens/CheckboxGroup capped at MAX_SELECTIONS.
 *   CE. parseStylePickerFlowResponse narrows valid + invalid payloads.
 *   CF. wa.sendFlow constructs the correct interactive payload shape.
 *   CG. sendStylePickerFlow returns false when WHATSAPP_FLOWS_ENABLED is
 *       unset, returns true (and calls wa.sendFlow) when both flag + flow
 *       id are configured.
 *   CH. sendStyleList falls through to the legacy list when Flows are
 *       disabled (the existing Phase 7/10 behaviour stays intact).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv(envPath: string): void {
  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf-8');
  } catch {
    console.error(`Could not read ${envPath}`);
    process.exit(1);
  }
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) process.env[key] = value;
  }
}

loadEnv(resolve(import.meta.dirname, '../.env'));

// Force the env flag OFF for the cleanup branch tests; CG flips it on.
delete process.env['WHATSAPP_FLOWS_ENABLED'];
delete process.env['WHATSAPP_STYLE_PICKER_FLOW_ID'];

const wa = await import('../packages/whatsapp/dist/index.js');
const sessionMod = await import('../packages/session/dist/index.js');
const onboarding = await import('../packages/session/dist/handlers/onboarding.js');
const stylePickerFlow = await import('../packages/session/dist/handlers/style-picker-flow.js');

const { buildStylePickerFlowJson, parseStylePickerFlowResponse, StylePickerFlow } = wa as {
  buildStylePickerFlowJson: (opts: {
    heading: string; body: string; ctaLabel: string;
    styles: Array<{ id: string; title: string }>;
  }) => Record<string, unknown>;
  parseStylePickerFlowResponse: (payload: Record<string, unknown> | undefined) => { selectedStyles: string[] } | null;
  StylePickerFlow: { INITIAL_SCREEN: string; STYLES_FIELD: string; MAX_SELECTIONS: number };
};

const { sendStylePickerFlow } = stylePickerFlow as {
  sendStylePickerFlow: (
    phone: string, lang: string, wa: unknown, token: string,
  ) => Promise<boolean>;
};
const { sendStyleList } = onboarding as {
  sendStyleList: (phone: string, lang: string, wa: unknown, ...args: unknown[]) => Promise<void>;
};
const { ListIds } = sessionMod;

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    failures++;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

interface SentRecord {
  kind: 'flow' | 'list' | 'text' | 'buttons';
  args: unknown[];
}
function makeMockWa() {
  const sent: SentRecord[] = [];
  return {
    sent,
    wa: {
      sendText: async (..._a: unknown[]) => { sent.push({ kind: 'text', args: _a }); },
      sendButtons: async (..._a: unknown[]) => { sent.push({ kind: 'buttons', args: _a }); },
      sendList: async (..._a: unknown[]) => { sent.push({ kind: 'list', args: _a }); },
      sendImage: async () => {},
      sendPaymentLink: async () => {},
      sendFlow: async (..._a: unknown[]) => {
        sent.push({ kind: 'flow', args: _a });
        return { messages: [{ id: 'wamid.test' }] };
      },
      markAsRead: async () => {},
    } as unknown,
  };
}

// ---------------------------------------------------------------------------
// Path CD — buildStylePickerFlowJson shape
// ---------------------------------------------------------------------------

function pathFlowJsonShape(): void {
  console.log('\n== Path CD: buildStylePickerFlowJson envelope shape ==');
  const json = buildStylePickerFlowJson({
    heading: 'Pick your style',
    body: "Pick 1-3 — we'll generate 3 ads.",
    ctaLabel: 'Continue',
    styles: [
      { id: 'style_clean_white', title: 'Clean White' },
      { id: 'style_studio', title: 'Studio' },
      { id: 'style_anything_you_want', title: '🎨 Anything You Want' },
    ],
  });
  assert(json['version'] === '5.0', 'version=5.0');
  assert(Array.isArray(json['screens']), 'screens is an array');
  const screens = json['screens'] as Array<{ id: string; layout: { children: Array<{ type: string; name?: string; max_selected_items?: number }> } }>;
  assert(screens.length === 1, 'one screen');
  const screen = screens[0]!;
  assert(screen.id === StylePickerFlow.INITIAL_SCREEN, `screen id matches INITIAL_SCREEN (got ${screen.id})`);
  const checkbox = screen.layout.children.find((c) => c.type === 'CheckboxGroup');
  assert(!!checkbox, 'CheckboxGroup present');
  assert(checkbox?.name === StylePickerFlow.STYLES_FIELD, 'CheckboxGroup name = STYLES_FIELD');
  assert(
    checkbox?.max_selected_items === StylePickerFlow.MAX_SELECTIONS,
    `max_selected_items = ${StylePickerFlow.MAX_SELECTIONS}`,
  );
  const footer = screen.layout.children.find((c) => c.type === 'Footer');
  assert(!!footer, 'Footer present');
}

// ---------------------------------------------------------------------------
// Path CE — parseStylePickerFlowResponse
// ---------------------------------------------------------------------------

function pathParseResponse(): void {
  console.log('\n== Path CE: parseStylePickerFlowResponse narrows valid + invalid payloads ==');
  // valid
  const v = parseStylePickerFlowResponse({
    [StylePickerFlow.STYLES_FIELD]: ['style_clean_white', 'style_anything_you_want'],
  });
  assert(!!v, 'valid payload parsed');
  assert(v?.selectedStyles.length === 2, 'two styles extracted');
  assert(
    v?.selectedStyles[0] === 'style_clean_white' && v?.selectedStyles[1] === 'style_anything_you_want',
    'order preserved',
  );

  // missing field
  assert(parseStylePickerFlowResponse({}) === null, 'missing field → null');
  // wrong type
  assert(
    parseStylePickerFlowResponse({ [StylePickerFlow.STYLES_FIELD]: 'string-not-array' }) === null,
    'non-array → null',
  );
  // empty array
  assert(
    parseStylePickerFlowResponse({ [StylePickerFlow.STYLES_FIELD]: [] }) === null,
    'empty array → null',
  );
  // overflow gets capped at MAX_SELECTIONS
  const over = parseStylePickerFlowResponse({
    [StylePickerFlow.STYLES_FIELD]: ['a', 'b', 'c', 'd', 'e'],
  });
  assert(
    over?.selectedStyles.length === StylePickerFlow.MAX_SELECTIONS,
    `overflow capped at ${StylePickerFlow.MAX_SELECTIONS} (got ${over?.selectedStyles.length})`,
  );
}

// ---------------------------------------------------------------------------
// Path CF — wa.sendFlow constructs the correct payload
// ---------------------------------------------------------------------------

async function pathSendFlowPayloadShape(): Promise<void> {
  console.log('\n== Path CF: sendStylePickerFlow with env on → wa.sendFlow called with right shape ==');
  process.env['WHATSAPP_FLOWS_ENABLED'] = 'true';
  process.env['WHATSAPP_STYLE_PICKER_FLOW_ID'] = 'FLOW_TEST_ID';
  process.env['WHATSAPP_STYLE_PICKER_FLOW_MODE'] = 'draft';

  const { wa, sent } = makeMockWa();
  const ok = await sendStylePickerFlow('919999000000', 'en', wa, 'token-abc');
  assert(ok === true, 'sendStylePickerFlow returned true');
  assert(sent.length === 1 && sent[0]!.kind === 'flow', 'wa.sendFlow called exactly once');
  const args = sent[0]!.args;
  assert(args[2] === 'FLOW_TEST_ID', 'flowId param threaded');
  assert(args[3] === 'token-abc', 'flowToken param threaded');
  assert(args[5] === StylePickerFlow.INITIAL_SCREEN, 'initial screen name passed');
  assert(args[7] === 'draft', 'mode=draft from env');

  // Clean up
  delete process.env['WHATSAPP_FLOWS_ENABLED'];
  delete process.env['WHATSAPP_STYLE_PICKER_FLOW_ID'];
  delete process.env['WHATSAPP_STYLE_PICKER_FLOW_MODE'];
}

// ---------------------------------------------------------------------------
// Path CG — env-off short-circuit
// ---------------------------------------------------------------------------

async function pathEnvOffShortCircuit(): Promise<void> {
  console.log('\n== Path CG: env off / no flow id → sendStylePickerFlow returns false ==');
  // both unset
  const { wa: wa1, sent: sent1 } = makeMockWa();
  const r1 = await sendStylePickerFlow('919999000001', 'en', wa1, 'tok');
  assert(r1 === false, 'returns false when both unset');
  assert(sent1.length === 0, 'wa.sendFlow not called when unset');

  // flag on but no id
  process.env['WHATSAPP_FLOWS_ENABLED'] = 'true';
  const { wa: wa2, sent: sent2 } = makeMockWa();
  const r2 = await sendStylePickerFlow('919999000002', 'en', wa2, 'tok');
  assert(r2 === false, 'returns false when id missing');
  assert(sent2.length === 0, 'wa.sendFlow not called when id missing');
  delete process.env['WHATSAPP_FLOWS_ENABLED'];
}

// ---------------------------------------------------------------------------
// Path CH — sendStyleList falls through to legacy list when Flows are off
// ---------------------------------------------------------------------------

async function pathLegacyFallthrough(): Promise<void> {
  console.log('\n== Path CH: sendStyleList still uses the legacy list when Flows are off ==');
  // Env explicitly off (re-deleted above).
  const { wa, sent } = makeMockWa();
  await sendStyleList('919999000003', 'en', wa, 'cat_jewellery', [], false);
  assert(
    sent.some((m) => m.kind === 'list'),
    'legacy list message sent',
  );
  assert(
    !sent.some((m) => m.kind === 'flow'),
    'no Flow sent when env is off',
  );
}

void ListIds; // ensure imported

async function main(): Promise<void> {
  console.log('Phase 9 smoke test — WhatsApp Flows scaffolding\n');
  pathFlowJsonShape();
  pathParseResponse();
  await pathSendFlowPayloadShape();
  await pathEnvOffShortCircuit();
  await pathLegacyFallthrough();
  if (failures === 0) {
    console.log('\nPASS — all Phase 9 smoke assertions green.');
    process.exit(0);
  } else {
    console.error(`\nFAIL — ${failures} assertion(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
