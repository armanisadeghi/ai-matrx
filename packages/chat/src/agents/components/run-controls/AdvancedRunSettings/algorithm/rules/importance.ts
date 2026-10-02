/**
 * Importance rule
 *
 * Each capability axis has its OWN per-level table. None is shared.
 *
 * Calibration goal:
 *   - Capabilities only a few specialised / frontier models do well
 *     (visual reasoning, math at frontier, coding at frontier) carry
 *     larger maxes.
 *   - Capabilities almost every modern model handles well (friendliness,
 *     general content writing) carry smaller maxes.
 *
 * Each row is independent — change any cell without affecting any other
 * axis.
 */

import type { ImportanceKey, Level, PointContribution, PointRule } from '../types';

const TABLES: Record<ImportanceKey, Record<Level, number>> = {
  codeWriting: {
    minimal: 0,
    low: 1,
    medium: 5,
    high: 14,
    max: 30,
  },
  contentWriting: {
    minimal: 0,
    low: 0,
    medium: 1,
    high: 3,
    max: 8,
  },
  friendliness: {
    minimal: 0,
    low: 0,
    medium: 0,
    high: 1,
    max: 3,
  },
  math: {
    minimal: 0,
    low: 1,
    medium: 6,
    high: 18,
    max: 35,
  },
  visualReasoning: {
    minimal: 0,
    low: 2,
    medium: 8,
    high: 20,
    max: 40,
  },
  multilingualReasoning: {
    minimal: 0,
    low: 1,
    medium: 4,
    high: 12,
    max: 25,
  },
  designSkills: {
    minimal: 0,
    low: 1,
    medium: 4,
    high: 10,
    max: 22,
  },
};

export const importancePoints: PointRule = (input) => {
  const out: PointContribution[] = [];
  const keys = Object.keys(TABLES) as ImportanceKey[];
  for (const key of keys) {
    const level = input.importance[key];
    const points = TABLES[key][level];
    if (points === 0) continue;
    out.push({
      source: `importance.${key}`,
      label: `${prettyImportanceLabel(key)}: ${level}`,
      points,
    });
  }
  return out;
};

function prettyImportanceLabel(key: ImportanceKey): string {
  switch (key) {
    case 'codeWriting': return 'Code Writing';
    case 'contentWriting': return 'Content Writing';
    case 'friendliness': return 'Friendliness';
    case 'math': return 'Math';
    case 'visualReasoning': return 'Visual Reasoning';
    case 'multilingualReasoning': return 'Multilingual Reasoning';
    case 'designSkills': return 'Design Skills';
  }
}
