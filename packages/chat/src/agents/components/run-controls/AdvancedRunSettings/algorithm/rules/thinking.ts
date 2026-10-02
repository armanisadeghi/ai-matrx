/**
 * Thinking rule
 *
 * Standalone table for the runtime "thinking depth" knob. Independent of
 * the reasoningAbility attribute — but they interact via a constraint
 * rule (max thinking with low reasoning is incoherent).
 */

import type { Level, PointRule } from '../types';

const POINTS: Record<Level, number> = {
  minimal: 0,
  low: 2,
  medium: 8,
  high: 25,
  max: 50,
};

export const thinkingPoints: PointRule = (input) => {
  const level = input.thinkingLevel;
  const points = POINTS[level];
  if (points === 0) return [];
  return [
    {
      source: 'thinkingLevel',
      label: `Thinking depth: ${level}`,
      points,
    },
  ];
};
