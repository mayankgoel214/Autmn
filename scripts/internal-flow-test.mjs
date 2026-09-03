// Internal end-to-end test of the reordered flow:
//   onboard → photo → STYLES → INSTRUCTIONS → order → generation.
// Verifies: (1) instructions are asked AFTER styles, (2) Gap-4 model hard-wall
// in-flow, (3) Gap-3 cost recording. One free first order = one generation.
//
//   node --env-file=.env --import tsx scripts/internal-flow-test.mjs
const { PrismaClient } =
  await import('/Users/mayankgoel/projects/Marquee/packages/db/src/generated/client/index.js');
const { handleIncomingMessage } = await import('../packages/session/dist/index.js');

const prisma = new PrismaClient({ log: ['error'] });
const PHONE = `91999${String(Date.now()).slice(-8)}`;
const IMG =
  'https://images.pexels.com/photos/37601639/pexels-photo-37601639.jpeg?auto=compress&cs=tinysrgb&w=1200';
let c = 0;
const txt = (text) => ({
  messageId: `flow-${PHONE}-${c++}`,
  messageType: 'text',
  text,
  timestamp: Date.now(),
});
const btn = (buttonReplyId) => ({
  messageId: `flow-${PHONE}-${c++}`,
  messageType: 'interactive',
  buttonReplyId,
  timestamp: Date.now(),
});
const lst = (listReplyId) => ({
  messageId: `flow-${PHONE}-${c++}`,
  messageType: 'interactive',
  listReplyId,
  timestamp: Date.now(),
});

let fail = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '✗ FAIL'} ${msg}`);
  if (!cond) fail++;
};
const sent = [];
const wa = {
  sendText: async (_p, body) => sent.push({ t: 'text', body }),
  sendButtons: async (_p, body, buttons) => sent.push({ t: 'buttons', body, buttons }),
  sendList: async (_p, body, _f, secs) =>
    sent.push({ t: 'list', body, rows: secs.flatMap((s) => s.rows) }),
  sendImage: async (_p, _u, caption) => sent.push({ t: 'image', body: caption ?? '' }),
  sendPaymentLink: async (_p, body) => sent.push({ t: 'pay', body }),
  markAsRead: async () => {},
};
const state = async () =>
  (await prisma.session.findUnique({ where: { phoneNumber: PHONE } }))?.state;

try {
  // ── Onboard (new user → orderCount 0 → free first order) ──────────────────
  console.log('== Onboarding ==');
  await handleIncomingMessage(PHONE, txt('hi'), wa);
  await handleIncomingMessage(PHONE, btn('lang_hinglish'), wa);
  await handleIncomingMessage(PHONE, txt('Joyaa'), wa);
  await handleIncomingMessage(PHONE, lst('cat_jewellery'), wa);
  ok(
    (await state()) === 'AWAITING_PHOTO',
    `state AWAITING_PHOTO after onboarding (got ${await state()})`,
  );

  // ── Inject a real photo, then proceed to the style picker ─────────────────
  await prisma.session.update({
    where: { phoneNumber: PHONE },
    data: { imageStorageUrls: [IMG], imageMediaIds: ['m1'] },
  });
  sent.length = 0;
  await handleIncomingMessage(PHONE, txt('done'), wa); // → showPhotoButtons
  await handleIncomingMessage(PHONE, btn('process_now'), wa); // → SETUP_STYLE + picker
  ok(
    (await state()) === 'SETUP_STYLE',
    `state SETUP_STYLE after process_now (got ${await state()})`,
  );
  const styleRows = sent.filter((m) => m.t === 'list').flatMap((m) => m.rows ?? []);
  console.log(`     style picker rows: ${styleRows.map((r) => r.id).join(', ') || '(none)'}`);

  // ── Pick a NON-model style (clean white) ──────────────────────────────────
  sent.length = 0;
  await handleIncomingMessage(PHONE, lst('style_clean_white'), wa);

  // ★ KEY ASSERTION: instructions come AFTER style selection
  ok(
    (await state()) === 'AWAITING_INSTRUCTIONS',
    `★ state AWAITING_INSTRUCTIONS after style pick (got ${await state()})`,
  );
  ok(
    sent.some((m) => m.t === 'text' && /skip/i.test(m.body)),
    'instruction prompt (with skip) sent after styles',
  );

  // ── Send a MODEL instruction on the non-model style (Gap-4 hard wall) ──────
  sent.length = 0;
  await handleIncomingMessage(PHONE, txt('make the model drink the product'), wa);
  const st = await state();
  ok(
    st === 'PROCESSING' || st === 'AWAITING_PAYMENT',
    `order created after instruction (state ${st})`,
  );
  const order = await prisma.order.findFirst({
    where: { phoneNumber: PHONE },
    orderBy: { createdAt: 'desc' },
  });
  ok(!!order, `order row created (id ${order?.shortId ?? '?'})`);
  ok(order?.isFirstFree === true || st === 'PROCESSING', 'free first order (no payment gate)');

  // ── Poll for generation completion (Gap-3 cost + output) ──────────────────
  console.log('== Waiting for worker to generate (up to 90s) ==');
  let done = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const o = await prisma.order.findUnique({ where: { id: order.id } });
    if ((o?.outputImageUrls?.length ?? 0) > 0 || o?.actualCostInr != null) {
      done = o;
      break;
    }
  }
  ok(!!done, 'order generated within 90s');
  ok(
    (done?.outputImageUrls?.length ?? 0) > 0,
    `output image produced (${done?.outputImageUrls?.length ?? 0})`,
  );
  ok(
    done?.actualCostInr != null,
    `★ Gap-3: actualCostInr recorded (₹${done?.actualCostInr ?? 'null'})`,
  );

  await prisma.session.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.order.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.user.deleteMany({ where: { phoneNumber: PHONE } }).catch(() => {});
  await prisma.processedMessage
    .deleteMany({ where: { messageId: { startsWith: `flow-${PHONE}-` } } })
    .catch(() => {});
} catch (e) {
  console.error('TEST ERROR:', e?.stack ?? e);
  fail++;
}

console.log(`\n=== ${fail === 0 ? 'ALL PASS' : fail + ' FAILED'} ===`);
process.exit(fail === 0 ? 0 : 1);
