// Drives one full customer conversation through the production session state
// machine and the real generation pipeline, recording both sides as a
// transcript for the demo video.
//
// What is real: every state transition, DB row, queue job, the Gemini
// generation, the deterministic QA gates, cost accounting, and the delivered
// image. What is simulated: the WhatsApp transport — inbound messages are
// injected here instead of arriving from Meta, and outbound sends are captured
// instead of hitting the Graph API (a cold demo of the real transport requires
// Meta business verification).
//
// Run with the compose stack up:
//   docker compose cp apps/web/public/gallery/perfume-bottle/before.jpg api:/data/storage/raw-images/demo/input.jpg
//   DATABASE_URL='postgresql://autmn:autmn@localhost:5433/autmn' \
//   REDIS_URL='redis://localhost:6380' \
//   node --env-file=.env --import tsx scripts/demo-conversation.mjs
//
// Output: scripts/results/demo-transcript.json

import { writeFileSync, mkdirSync } from 'fs';

const { PrismaClient } =
  await import('/Users/mayankgoel/projects/Marquee/packages/db/src/generated/client/index.js');
const { handleIncomingMessage } = await import('../packages/session/dist/index.js');

const prisma = new PrismaClient({ log: ['error'] });
const PHONE = `91998${String(Date.now()).slice(-8)}`;

// The worker resolves this URL from inside the compose network; the transcript
// viewer swaps api:3000 for localhost:3000 when rendering.
const INPUT_URL_WORKER = 'http://api:3000/files/raw-images/demo/input.jpg';
const INPUT_URL_BROWSER = 'http://localhost:3000/files/raw-images/demo/input.jpg';

let seq = 0;
const transcript = [];
const record = (from, entry) =>
  transcript.push({ seq: seq++, from, at: new Date().toISOString(), ...entry });

const txt = (text) => ({
  messageId: `demo-${PHONE}-${seq}`,
  messageType: 'text',
  text,
  timestamp: Date.now(),
});
const btn = (buttonReplyId, label) => ({
  messageId: `demo-${PHONE}-${seq}`,
  messageType: 'interactive',
  buttonReplyId,
  timestamp: Date.now(),
  _label: label,
});
const lst = (listReplyId, label) => ({
  messageId: `demo-${PHONE}-${seq}`,
  messageType: 'interactive',
  listReplyId,
  timestamp: Date.now(),
  _label: label,
});

// Captures what production would send to the customer's phone.
const wa = {
  sendText: async (_p, body) => record('marquee', { type: 'text', body }),
  sendButtons: async (_p, body, buttons) => record('marquee', { type: 'buttons', body, buttons }),
  sendList: async (_p, body, footer, sections, buttonLabel) =>
    record('marquee', {
      type: 'list',
      body,
      footer,
      buttonLabel,
      rows: (sections ?? []).flatMap((s) => s.rows ?? []),
    }),
  sendImage: async (_p, url, caption) =>
    record('marquee', { type: 'image', imageUrl: url, body: caption ?? '' }),
  sendPaymentLink: async (_p, body) => record('marquee', { type: 'payment', body }),
  markAsRead: async () => {},
};

async function customer(message, display) {
  record('customer', {
    type: message.messageType === 'text' ? 'text' : 'reply',
    body: display ?? message.text ?? message._label,
  });
  await handleIncomingMessage(PHONE, message, wa);
}

const state = async () =>
  (await prisma.session.findUnique({ where: { phoneNumber: PHONE } }))?.state;

try {
  await customer(txt('hi'));
  await customer(btn('lang_en', 'English'));
  await customer(txt('Aurelia Fragrances'));
  await customer(lst('cat_skincare', 'Skincare & Beauty'));
  console.log(`state after onboarding: ${await state()}`);

  // The customer sends a product photo. Media download from Meta is the one
  // step that cannot run without transport, so the stored URL is injected the
  // way the media handler would have written it.
  record('customer', { type: 'image', imageUrl: INPUT_URL_BROWSER });
  await prisma.session.update({
    where: { phoneNumber: PHONE },
    data: { imageStorageUrls: [INPUT_URL_WORKER], imageMediaIds: ['demo-media-1'] },
  });

  // In AWAITING_PHOTO, free text is captured as creative instructions.
  await customer(txt('warm golden light, on a marble shelf'));
  await customer(txt('done'));
  await customer(btn('process_now', 'Create my ad ✨'));
  console.log(`state after process_now: ${await state()}`);

  await customer(lst('style_lifestyle', 'Lifestyle scene'));
  console.log(`state after style pick: ${await state()}`);

  const order = await prisma.order.findFirst({
    where: { phoneNumber: PHONE },
    orderBy: { createdAt: 'desc' },
  });
  if (!order) throw new Error('No order row was created');
  console.log(`order ${order.shortId} created, waiting for the worker…`);

  let finished = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const o = await prisma.order.findUnique({ where: { id: order.id } });
    if ((o?.outputImageUrls?.length ?? 0) > 0) {
      finished = o;
      break;
    }
    const job = await prisma.imageJob.findFirst({ where: { orderId: order.id } });
    if (job?.status === 'failed') {
      throw new Error(`Generation failed: ${job.errorMessage}`);
    }
  }
  if (!finished) throw new Error('Generation did not finish within 180s');

  // Cost accumulation lands just after the output URL does — re-read for it.
  await new Promise((r) => setTimeout(r, 4000));
  finished = (await prisma.order.findUnique({ where: { id: order.id } })) ?? finished;

  // The delivery the worker attempts over WhatsApp, rendered from the same DB
  // state it reads. (Its own send fails cold — placeholder Meta credentials.)
  record('marquee', {
    type: 'image',
    imageUrl: finished.outputImageUrls[0].replace('http://api:3000', 'http://localhost:3000'),
    body: 'Your ad is ready! ✨',
  });

  console.log(`\ngenerated: ${finished.outputImageUrls[0]}`);
  console.log(`actual cost: ₹${finished.actualCostInr}`);

  mkdirSync('scripts/results', { recursive: true });
  writeFileSync(
    'scripts/results/demo-transcript.json',
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        phone: PHONE,
        orderId: finished.shortId,
        costInr: finished.actualCostInr,
        transcript,
      },
      null,
      2,
    ),
  );
  console.log(`transcript: ${transcript.length} messages -> scripts/results/demo-transcript.json`);
} finally {
  await prisma.$disconnect();
}
