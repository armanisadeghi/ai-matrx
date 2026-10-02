/**
 * Algorithm engine
 *
 * Tiny orchestrator. Knows nothing about specific axes or weights — it
 * just walks the registry of point rules + constraint rules and assembles
 * the result.
 *
 * To add a new rule:
 *   1. Write a function in algorithm/rules/<your-rule>.ts that conforms
 *      to either PointRule or ConstraintRule.
 *   2. Append it to POINT_RULES or to CONSTRAINTS in
 *      algorithm/rules/constraints.ts.
 *   3. The engine doesn't need any changes.
 */

import type { AlgorithmInput, AlgorithmResult, PointRule } from './types';
import { bandFor } from './bands';
import { primaryOutputPoints } from './rules/primary-output';
import { inputModePoints } from './rules/input-modes';
import { attributePoints } from './rules/attributes';
import { importancePoints } from './rules/importance';
import { thinkingPoints } from './rules/thinking';
import { toolPoints } from './rules/tools';
import { artifactSkillPoints } from './rules/artifact-skills';
import { evaluateConstraints } from './rules/constraints';

// Registry of point rules — order is the order they appear in the breakdown.
const POINT_RULES: { name: string; evaluate: PointRule }[] = [
  { name: 'primaryOutput', evaluate: primaryOutputPoints },
  { name: 'inputModes', evaluate: inputModePoints },
  { name: 'attributes', evaluate: attributePoints },
  { name: 'importance', evaluate: importancePoints },
  { name: 'thinking', evaluate: thinkingPoints },
  { name: 'tools', evaluate: toolPoints },
  { name: 'artifactSkills', evaluate: artifactSkillPoints },
];

export function runAlgorithm(input: AlgorithmInput): AlgorithmResult {
  const contributions = POINT_RULES.flatMap((r) => r.evaluate(input));
  const constraints = evaluateConstraints(input);

  const baseTotal = contributions.reduce((sum, c) => sum + c.points, 0);
  const penaltyTotal = constraints.reduce((sum, c) => sum + c.points, 0);
  const total = baseTotal + penaltyTotal;

  return {
    total,
    contributions,
    constraints,
    band: bandFor(total),
  };
}
