/**
 * Tests for voice note interpretation.
 *
 * All tests call the Gemini API and are skipped when GEMINI_API_KEY is not set.
 * The null-input test is deterministic and always runs.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { interpretVoiceNote } from './interpret.js';

const hasGemini = !!(process.env['GEMINI_API_KEY'] ?? process.env.GEMINI_API_KEY);

// ---------------------------------------------------------------------------
// Deterministic — no API
// ---------------------------------------------------------------------------

describe('interpretVoiceNote — no API', () => {
  test('empty transcription → null', async () => {
    const result = await interpretVoiceNote({
      rawTranscription: '',
      language: 'en',
      currentStep: 'instructions',
    });
    assert.equal(result, null);
  });

  test('whitespace-only transcription → null', async () => {
    const result = await interpretVoiceNote({
      rawTranscription: '   ',
      language: 'en',
      currentStep: 'instructions',
    });
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// API-dependent — text understanding for Hindi and English voice transcriptions
// ---------------------------------------------------------------------------

describe('interpretVoiceNote — API', () => {
  test(
    'Hindi (Hinglish) instruction understood correctly',
    { skip: !hasGemini },
    async () => {
      const result = await interpretVoiceNote({
        rawTranscription: 'peeche wala cup mat daalna please',
        language: 'hi',
        currentStep: 'instructions',
      });
      assert.ok(result !== null, 'should not return null for clear Hinglish instruction');
      assert.ok(result.confidence !== 'low', `expected non-low confidence, got ${result.confidence}`);
      // Intent should capture the "remove the cup" meaning
      const combined = (result.intent + ' ' + result.cleaned).toLowerCase();
      assert.ok(
        combined.includes('cup') || combined.includes('background'),
        `expected "cup" or "background" in interpretation, got: "${combined}"`,
      );
    },
  );

  test(
    'English instruction understood correctly',
    { skip: !hasGemini },
    async () => {
      const result = await interpretVoiceNote({
        rawTranscription: 'please make the background white and clean',
        language: 'en',
        currentStep: 'instructions',
      });
      assert.ok(result !== null, 'should not return null for clear English instruction');
      assert.ok(result.confidence !== 'low', `expected non-low confidence, got ${result.confidence}`);
      const combined = (result.intent + ' ' + result.cleaned).toLowerCase();
      assert.ok(
        combined.includes('white') || combined.includes('background') || combined.includes('clean'),
        `expected "white", "background", or "clean" in interpretation, got: "${combined}"`,
      );
    },
  );

  test(
    'Devanagari Hindi instruction understood correctly',
    { skip: !hasGemini },
    async () => {
      const result = await interpretVoiceNote({
        rawTranscription: 'सफेद background चाहिए',
        language: 'hi',
        currentStep: 'instructions',
      });
      assert.ok(result !== null, 'should not return null for Devanagari instruction');
    },
  );
});
