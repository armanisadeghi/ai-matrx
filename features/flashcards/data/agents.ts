// features/flashcards/data/agents.ts
//
// THE single source of truth for the live Education/Flashcards agent ids.
// Authored + tuned in-system (gemini-3.5-flash); see features/education/docs/LIVE_AGENTS.md
// for the agent definitions + variable shapes, and AGENT_SPECS.md for the contracts.
//
// These permanent ids always track the latest published version of each agent — so the
// user can keep optimizing the prompts/rubrics with no code change. Pin a frozen version
// only if a surface ever needs reproducibility (the version ids are in LIVE_AGENTS.md).
//
// Variable names below are the AGENT's actual variable names (what `runtime.variables`
// keys must be) — a few differ from the first-draft spec, so wire to THESE.

export const FC_AGENTS = {
  /** topic, count, difficulty, grade_level, user_request → { set_title, cards[] } */
  generateCards: "1fd0cb1f-5b95-49f0-a7f8-79308dc50f58",
  /** source_content, document_id, count, difficulty → { set_title, cards[] (with source) } */
  generateFromSource: "f728ac6b-8504-4b8c-83fc-5f9df947d6a9",
  /** front, back, topic, difficulty, kinds, existing_details → { details[] } */
  enrichCard: "9f8eab67-96e4-4a08-9563-7a982f920527",
  /** cards (JSON string), voice_style → { helpers[] } */
  writeHelper: "df0e6c90-e1f2-4530-a766-f8b3302083f9",
  /** front, back, rubric, seconds_allowed (+ audio message part) → grade JSON */
  gradeSpoken: "e0449378-370f-4b08-baec-5bd6128d3c64",
  /** front, back, card_history, learner_context (JSON string), user_request → help JSON */
  helpLive: "9035ed6e-a936-488d-9e9b-582cc6effb7d",
  /** transcript, attempts, aggregate, remaining_cards (JSON strings) → review JSON */
  reviewBatch: "780fb7ab-bb27-47e9-8aeb-d9d1ed032901",
  /** front, back, topic, distractor_count → { question, correct, distractors[], explanation } */
  makeQuizItems: "03ea2bc2-2c2a-426d-8ea9-21799ae1f05d",
  /** topic, front, back, struggle_signal → { sub_cards[] } */
  expandCard: "5f77de33-887d-4bb0-9432-91f2f6dddaa4",
  /** front, back, which → { spoken_text } */
  spokenQuestion: "d07d40bb-3cac-478d-ab33-859de3cd8d02",
} as const;

export type FcAgentKey = keyof typeof FC_AGENTS;
