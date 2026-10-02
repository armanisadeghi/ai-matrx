/**
 * Attributes rule
 *
 * Each attribute axis has its OWN per-level table. None is shared with any
 * other axis or any other rule. Tweak any cell freely.
 *
 * Calibration goal:
 *   - Raw Intelligence at MAX should alone push the total into the
 *     "extreme" band — only frontier models can satisfy it.
 *   - Reasoning Ability at MAX is also frontier-class, but a notch lower
 *     because more models offer "high" reasoning than offer max raw IQ.
 *   - Speed at MAX is achievable by many models — it's a constraint but
 *     not a frontier requirement on its own.
 *   - Cost is INVERTED: minimal cost is the hardest ask (eliminates
 *     premium models from contention).
 */

import type { Level, PointContribution, PointRule } from "../types";

const RAW_INTELLIGENCE_POINTS: Record<Level, number> = {
  minimal: 0,
  low: 5,
  medium: 18,
  high: 60,
  max: 140,
};

const SPEED_POINTS: Record<Level, number> = {
  minimal: 0,
  low: 1,
  medium: 4,
  high: 12,
  max: 28,
};

const COST_POINTS: Record<Level, number> = {
  // Inverted scale — wanting cheap is harder than allowing expensive.
  minimal: 35,
  low: 18,
  medium: 5,
  high: 1,
  max: 0,
};

const REASONING_ABILITY_POINTS: Record<Level, number> = {
  minimal: 0,
  low: 3,
  medium: 5,
  high: 7,
  max: 10,
};

export const attributePoints: PointRule = (input) => {
  const { attributes } = input;
  return [
    {
      source: "attributes.rawIntelligence",
      label: `Raw Intelligence: ${attributes.rawIntelligence}`,
      points: RAW_INTELLIGENCE_POINTS[attributes.rawIntelligence],
    },
    {
      source: "attributes.speed",
      label: `Speed: ${attributes.speed}`,
      points: SPEED_POINTS[attributes.speed],
    },
    {
      source: "attributes.cost",
      label: `Cost: ${attributes.cost}`,
      points: COST_POINTS[attributes.cost],
    },
    {
      source: "attributes.reasoningAbility",
      label: `Reasoning Ability: ${attributes.reasoningAbility}`,
      points: REASONING_ABILITY_POINTS[attributes.reasoningAbility],
    },
  ].filter((c): c is PointContribution => c.points > 0);
};
