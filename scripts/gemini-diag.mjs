// Pinpoint whether the Gemini 429 is key-wide quota or model-specific access.
// node --env-file=.env scripts/gemini-diag.mjs
import { createRequire } from 'module';
const require = createRequire('/Users/mayankgoel/projects/Autmn/packages/ai/');
const { GoogleGenAI, Modality } = require('@google/genai');

const key =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
console.log('key present:', !!key, key ? `(…${key.slice(-6)})` : '');

const ai = new GoogleGenAI({ apiKey: key });

// 1) Text-only call on a cheap text model — is the KEY valid + has ANY quota?
try {
  const r = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: 'say OK' }] }],
  });
  console.log(
    'TEXT  gemini-2.5-flash:           OK  ->',
    (r.text ?? '').slice(0, 20).replace(/\n/g, ' '),
  );
} catch (e) {
  console.log('TEXT  gemini-2.5-flash:           FAIL ->', shortErr(e));
}

// 2) Image models — which (if any) are usable on this key?
for (const model of [
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-preview-image-generation',
]) {
  try {
    const r = await ai.models.generateContent({
      model,
      config: { responseModalities: [Modality.TEXT, Modality.IMAGE], temperature: 0.4 },
      contents: [
        { role: 'user', parts: [{ text: 'A simple red circle centered on a white background.' }] },
      ],
    });
    const parts = r.candidates?.[0]?.content?.parts ?? [];
    const hasImg = parts.some((p) => p.inlineData?.data);
    console.log(
      `IMAGE ${model.padEnd(42)} ${hasImg ? 'OK (image returned)' : 'NO IMAGE (finish=' + r.candidates?.[0]?.finishReason + ')'}`,
    );
  } catch (e) {
    console.log(`IMAGE ${model.padEnd(42)} FAIL -> ${shortErr(e)}`);
  }
}

function shortErr(e) {
  const m = (e?.message ?? String(e)).replace(/\s+/g, ' ');
  const code = m.match(/"code":\s*(\d+)/)?.[1];
  return (code ? `HTTP ${code} ` : '') + m.slice(0, 110);
}
