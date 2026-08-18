// features/education/spoken-practice/mandates.ts
//
// Mandate keys for the Spoken Practice AI lanes. These are MANDATE KEYS, not
// agent ids: each key resolves LIVE (system default → org binding → user
// binding) to whatever agent the DATABASE currently binds — agent identity
// never lives in code. Swap the agent behind any lane at /agents/mandates; no
// code change, no deploy. See features/agents/mandates/FEATURE.md.
//
// Spoken Practice owns dedicated, MODE-AWARE mandates (examiner / interviewer
// / debate-judge) — it does NOT reuse the FastFire flashcard grader or the
// flashcard batch-review lane (adversarial-review GAP 1: those leaked
// "flashcard" framing into the oral-exam review). It still REUSES the
// grading-core primitives (uploadResponseClip + runSpokenGrader +
// coerceSpokenGrade), the study spine, and the trust stack unchanged.

export const SPOKEN_PRACTICE_MANDATES = {
  /** mode, focus, study_material, difficulty, count → grounded oral-exam / interview / debate plan */
  designSession: "education.spoken_practice_design",
  /** focus, difficulty, count, study_material → the same plan shape, target-language utterances (pronunciation mode) */
  designLanguageSession: "education.spoken_practice_design_language",
  /** front, back, rubric (mode-framed), seconds_allowed (+ audio) → unified spoken grade JSON */
  gradeAnswer: "education.spoken_practice_grade",
  /** Same grade JSON PLUS { pronunciation } — the dedicated pronunciation-mode grader */
  gradePronunciation: "education.spoken_practice_grade_pronunciation",
  /** mode, transcript, aggregate → { summary, strengths[], weaknesses[] } — mode-aware session review */
  reviewSession: "education.spoken_practice_review",
} as const;

export type SpokenPracticeMandateKey = keyof typeof SPOKEN_PRACTICE_MANDATES;

/** The study-spine item_type every graded spoken-practice prompt records under. */
export const SPOKEN_PROMPT_ITEM_TYPE = "spoken_prompt" as const;
