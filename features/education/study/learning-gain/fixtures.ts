// features/education/study/learning-gain/fixtures.ts
//
// Seed learning-gain rows used ONLY while P1's table is pre-launch. The report
// surface renders these behind an explicit "sample data" label so a learner is
// never shown fabricated gain as if it were their own (no-fake-verification
// discipline). Delete this import path once P1's real rows flow.

import type { LearningGainRow } from "./types";

export const SEED_LEARNING_GAIN: LearningGainRow[] = [
  {
    id: "seed-bio-base",
    subject: "cell-biology",
    subjectLabel: "Cell Biology",
    phase: "baseline",
    score: 0.42,
    takenAt: "2026-06-01T10:00:00Z",
  },
  {
    id: "seed-bio-post",
    subject: "cell-biology",
    subjectLabel: "Cell Biology",
    phase: "post",
    score: 0.86,
    takenAt: "2026-06-28T10:00:00Z",
  },
  {
    id: "seed-span-base",
    subject: "spanish-verbs",
    subjectLabel: "Spanish Verb Conjugation",
    phase: "baseline",
    score: 0.55,
    takenAt: "2026-06-03T10:00:00Z",
  },
  {
    id: "seed-span-post",
    subject: "spanish-verbs",
    subjectLabel: "Spanish Verb Conjugation",
    phase: "post",
    score: 0.78,
    takenAt: "2026-06-27T10:00:00Z",
  },
  {
    id: "seed-chem-base",
    subject: "organic-chem",
    subjectLabel: "Organic Chemistry",
    phase: "baseline",
    score: 0.31,
    takenAt: "2026-06-05T10:00:00Z",
  },
  {
    id: "seed-chem-post",
    subject: "organic-chem",
    subjectLabel: "Organic Chemistry",
    phase: "post",
    score: 0.69,
    takenAt: "2026-06-30T10:00:00Z",
  },
];
