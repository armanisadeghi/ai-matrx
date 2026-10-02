/**
 * Primary Output rule
 *
 * Hand-tuned points for the desired output modality. Edit any value freely;
 * each is independent of every other rule.
 */

import type { PointContribution, PointRule, PrimaryOutput } from '../types';

const POINTS: Record<PrimaryOutput, number> = {
  text: 0,
  image: 25,   // image-output models are uncommon
  audio: 18,
  video: 50,   // video-output is rare and expensive
};

export const primaryOutputPoints: PointRule = (input) => {
  const o = input.primaryOutput;
  const contribution: PointContribution = {
    source: 'primaryOutput',
    label: `Primary output: ${o}`,
    points: POINTS[o],
  };
  return [contribution];
};
