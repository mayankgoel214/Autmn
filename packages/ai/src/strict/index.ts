/**
 * Phase 20 — strict-track entry point.
 *
 * processStrictStyle is the analogue of processStyleProduction (creative
 * track) but uses segmentation + composite instead of generative inference.
 * Returns a StrictTrackResult; on cutout failure, ok=false and the caller
 * falls back to the creative track per plan §3.
 */

export {
  WHITE_STUDIO_CONFIG,
  STRICT_COST_INR,
  type StrictTrackConfig,
  type StrictTrackResult,
} from './types.js';

export { compositeOnBackground } from './composite.js';

export { processStrictStyle, isStrictStyle } from './processor.js';
