/**
 * Algorithm public API
 *
 * Consumers should import from here, not from individual rule files.
 */

export { runAlgorithm } from './engine';
export { bandFor, BAND_THRESHOLDS } from './bands';
export type {
  AlgorithmInput,
  AlgorithmResult,
  ComplexityBand,
  ConstraintDisable,
  ConstraintRule,
  ConstraintViolation,
  PointContribution,
  PointRule,
} from './types';
