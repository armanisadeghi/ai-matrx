/**
 * Artifact Skills rule
 *
 * One row per skill — every value individually tunable. Most text-only
 * artifact skills are essentially free for any modern model. Skills that
 * require a multimodal output channel (images, audio, video) carry real
 * cost because they narrow the model pool.
 */

import type { ArtifactSkillKey, PointContribution, PointRule } from '../types';

const POINTS: Record<ArtifactSkillKey, number> = {
  structured_text: 0,
  code: 1,
  tables: 0,
  tasks: 0,
  images: 15,
  videos: 25,
  audio: 12,
  flashcards: 0,
  quizzes: 0,
  slideshows: 1,
  presentations: 1,
  timeline: 0,
  recipes: 0,
  comparison: 0,
  research: 1,
  math_problems: 1,
  decision_tree: 0,
  troubleshooting: 0,
  interactive_diagrams: 1,
  questionnaires: 0,
  progress_tracking: 0,
  transcripts: 0,
  tree_structure: 0,
  resource_collection: 0,
};

export const artifactSkillPoints: PointRule = (input) => {
  const out: PointContribution[] = [];
  for (const skill of input.artifactSkills) {
    const points = POINTS[skill];
    if (points === 0) continue;
    out.push({
      source: `artifactSkills.${skill}`,
      label: `Output skill: ${skill}`,
      points,
    });
  }
  return out;
};
