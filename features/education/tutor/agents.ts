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
   * The persistent, memory-carrying, RAG-grounded conversational tutor. A
   * streaming TEXT agent (markdown out), grounded in the learner's own material
   * (injected per-turn via the request `context` channel), Socratic-capable
   * (`teaching_mode` variable), personality-tunable (`personality_style`), and
   * honest about the boundary of the material (refuses rather than fabricates).
   */
  tutor: "df4a4142-214a-4ca6-bf8b-81293fdc8235",
} as const;

export type EduTutorAgentKey = keyof typeof EDU_TUTOR_AGENTS;

/** The default agent that starts a new /education/tutor conversation. */
export const DEFAULT_TUTOR_AGENT_ID = EDU_TUTOR_AGENTS.tutor;
