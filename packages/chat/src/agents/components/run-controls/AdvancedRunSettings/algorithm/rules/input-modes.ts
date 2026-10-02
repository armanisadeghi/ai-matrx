/**
 * Input Modes rule
 *
 * One score per mode. Multiplied by 1 (selected) or 0 (not selected) and
 * summed. Each mode is independently tunable.
 *
 * NOTE: YouTube is given a moderate base because Google models support it
 * natively at low cost. The extra cost of using a non-Google model with
 * YouTube is enforced by a constraint rule, not by inflating this number.
 */

import type { InputMode, PointContribution, PointRule } from '../types';

const POINTS: Record<InputMode, number> = {
  text: 0,
  documents: 3,
  image: 8,
  audio: 12,
  video: 25,
  youtube: 12,
};

export const inputModePoints: PointRule = (input) => {
  const out: PointContribution[] = [];
  for (const mode of input.inputModes) {
    const points = POINTS[mode];
    if (points === 0) continue;
    out.push({
      source: `inputModes.${mode}`,
      label: `Input mode: ${mode}`,
      points,
    });
  }
  return out;
};
