// features/education/tutor/agents.ts
//
// THE single source of truth for the live AI Tutor agent ids (P2 — AI Tutor).
// Authored + tuned in-system via agent_author; see
// features/education/docs/LIVE_AGENTS.md for definitions + variable shapes.
//
// These permanent ids track the latest published version of each agent, so the
// prompts/rubrics can keep being optimized with no code change. The one-shot
// in-study help lanes (fc_help_live / fc_review_batch / fc_micro_coach) still
// live in FC_AGENTS (features/flashcards/data/agents.ts) — they are flashcards
// study-mode lanes; the CONVERSATIONAL tutor below is the education-wide one.

export const EDU_TUTOR_AGENTS = {
  /**
   * The persistent, memory-carrying, grounded conversational tutor. A streaming
   * TEXT agent (markdown out) with NO user-facing variables (clean composer) —
   * grounding rides declared CONTEXT SLOTS the FE fills silently every turn:
   *   learner_memory · study_material · teaching_mode · personality_style
   * Each slot has a `max_inline_chars` ceiling; content is inlined into the
   * model's view up to that limit. Also carries platform DATA TOOLS so it can
   * query the learner's notes/flashcards/docs live. Cites the learner's material
   * inline, honest about the boundary. Grounding is injected via
   * `setContextEntries` in EducationTutorClient.
   */
  tutor: "d80cc27e-63ce-49b6-a285-fdb78a66c537",
} as const;

export type EduTutorAgentKey = keyof typeof EDU_TUTOR_AGENTS;

/** The default agent that starts a new /education/tutor conversation. */
export const DEFAULT_TUTOR_AGENT_ID = EDU_TUTOR_AGENTS.tutor;
