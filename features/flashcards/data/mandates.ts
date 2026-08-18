// features/flashcards/data/mandates.ts
//
// Mandate keys for the Flashcards AI lanes. These are MANDATE KEYS, not agent
// ids: each key resolves LIVE (system default → org binding → user binding) to
// whatever agent the DATABASE currently binds — agent identity never lives in
// code. Swap the agent behind any lane at /agents/mandates (or the admin
// console at /administration/agents/mandates); no code change, no deploy.
// See features/agents/mandates/FEATURE.md.

export const FC_MANDATES = {
  /** topic, count, difficulty, grade_level, user_request → { __kind, title, cards[] } */
  generateCards: "flashcards.generate_cards",
  /** source_content, document_id, count, difficulty → { __kind, title, cards[] (source + trust) } */
  generateFromSource: "flashcards.generate_from_source",
  /** front, back, topic, difficulty, kinds, existing_details → { details[] } */
  enrichCard: "flashcards.enrich_card",
  /** topic, front, back, struggle_signal → { sub_cards[] } */
  expandCard: "flashcards.expand_card",
  /** front, back, rubric, seconds_allowed (+ audio message part) → spoken grade JSON */
  gradeSpoken: "flashcards.grade_spoken",
  /** question, expected_answer, learner_answer → GradeVerdict (grade-on-meaning, paraphrase-tolerant) */
  gradeTypedAnswer: "flashcards.grade_typed_answer",
  /** front, back, card_history, learner_context (JSON string), user_request → help JSON */
  helpLive: "flashcards.help_live",
  /** transcript, attempts, aggregate, remaining_cards → end-of-session review JSON */
  reviewBatch: "flashcards.review_batch",
  /** front, back, result, prior_attempts → { tip } — cheap per-card micro-coaching */
  microCoach: "flashcards.micro_coach",
  /** front, back, topic, distractor_count → { question, correct, distractors[], explanation } */
  makeQuizItems: "flashcards.make_quiz_items",
  /** front, back, source_excerpt → { status, explanation, suggested_fix } ("Verify against source") */
  verifyAgainstSource: "flashcards.verify_against_source",
} as const;

export type FcMandateKey = keyof typeof FC_MANDATES;
