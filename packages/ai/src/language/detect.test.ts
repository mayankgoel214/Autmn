/**
 * Tests for language detection and transcription language normalization.
 *
 * Fast-path tests (Devanagari regex, empty string, normalizeTranscriptionLang)
 * run without any API key.
 *
 * API tests for detectLanguage (Hinglish / English classification) are skipped
 * when GEMINI_API_KEY is not set.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTranscriptionLang, detectLanguage } from './detect.js';

// ---------------------------------------------------------------------------
// normalizeTranscriptionLang — purely deterministic, no API
// ---------------------------------------------------------------------------

describe('normalizeTranscriptionLang', () => {
  const cases: [string, 'en' | 'hi'][] = [
    ['hi',      'hi'],
    ['hi-IN',   'hi'],
    ['hi-in',   'hi'],
    ['HI',      'hi'],
    ['en',      'en'],
    ['en-IN',   'en'],
    ['en-in',   'en'],
    ['unknown', 'en'],
    ['',        'en'],
    ['mr',      'en'], // Marathi — not in our Language type, falls back to 'en'
    ['ta',      'en'], // Tamil
  ];

  for (const [input, expected] of cases) {
    test(`"${input}" → ${expected}`, () => {
      assert.equal(normalizeTranscriptionLang(input), expected);
    });
  }
});

// ---------------------------------------------------------------------------
// detectLanguage — fast paths, no API call
// ---------------------------------------------------------------------------

describe('detectLanguage — fast paths', () => {
  test('Devanagari text → hi (regex, no API)', async () => {
    const result = await detectLanguage('नमस्ते');
    assert.equal(result, 'hi');
  });

  test('Devanagari sentence → hi', async () => {
    const result = await detectLanguage('आपका product अच्छा है');
    assert.equal(result, 'hi');
  });

  test('empty string → en', async () => {
    const result = await detectLanguage('');
    assert.equal(result, 'en');
  });

  test('whitespace-only → en', async () => {
    const result = await detectLanguage('   ');
    assert.equal(result, 'en');
  });
});

// ---------------------------------------------------------------------------
// detectLanguage — API tests (Hinglish and English classification)
// Skipped if GEMINI_API_KEY is not in env.
// ---------------------------------------------------------------------------

const hasGemini = !!(process.env['GEMINI_API_KEY'] ?? process.env.GEMINI_API_KEY);

describe('detectLanguage — API classification', () => {
  test(
    'clear Hinglish → hinglish',
    { skip: !hasGemini },
    async () => {
      const result = await detectLanguage('haan bhai theek hai, kitna time lagega?');
      assert.equal(result, 'hinglish');
    },
  );

  test(
    'short Hinglish greeting → hinglish',
    { skip: !hasGemini },
    async () => {
      const result = await detectLanguage('namaste yaar');
      assert.equal(result, 'hinglish');
    },
  );

  test(
    'pure English → en',
    { skip: !hasGemini },
    async () => {
      const result = await detectLanguage('hello, how long will this take?');
      assert.equal(result, 'en');
    },
  );

  test(
    'Hinglish mixed → hinglish',
    { skip: !hasGemini },
    async () => {
      const result = await detectLanguage('acha so you are saying the product photo will be ready soon?');
      assert.equal(result, 'hinglish');
    },
  );
});
