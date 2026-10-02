/**
 * Band thresholds — single source of truth for "how big does the total
 * have to be to count as Frontier?".
 *
 * Adjust these alongside the rule weights. Each band's `max` is inclusive.
 * Last band is implicitly Infinity.
 *
 * The intent (rough):
 *   - low      Most models can satisfy.
 *   - moderate Mid-tier capable models.
 *   - high     Premium models.
 *   - extreme  Frontier only.
 */

import type { ComplexityBand } from './types';

export const BAND_THRESHOLDS: { band: ComplexityBand; max: number }[] = [
  { band: 'low', max: 25 },
  { band: 'moderate', max: 70 },
  { band: 'high', max: 130 },
  { band: 'extreme', max: Infinity },
];

export function bandFor(total: number): ComplexityBand {
  for (const { band, max } of BAND_THRESHOLDS) {
    if (total <= max) return band;
  }
  return 'extreme';
}
