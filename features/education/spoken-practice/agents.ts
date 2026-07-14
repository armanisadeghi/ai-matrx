// features/education/spoken-practice/agents.ts
//
// THE single source of truth for the live Spoken Practice agent ids.
// Authored + verified in-system (agent_author + agent_run, gemini-3.5-flash);
// see FEATURE.md for the contract. These permanent ids track the latest
// published version, so prompts/rubrics can be tuned in-system with no code
// change (same convention as FC_AGENTS / ASSESSMENT_AGENTS).
//
// Spoken Practice does NOT fork a grading path: it REUSES the crown-jewel spoken
// grader (FC_AGENTS.gradeSpoken) and the mode-agnostic end-of-session "professor"
// review (via the tutor `reviewSession` lane) exactly as FastFire + Audio Review
// do. The ONLY new agent is the session designer that generates the prompts.

import { FC_AGENTS } from "@/features/flashcards/data/agents";

export const SPOKEN_PRACTICE_AGENTS = {
  /**
   * mode, focus, study_material, difficulty, count
   *   → { session_title, intro, prompts[{ prompt, reference_answer, rubric,
   *       focus_area, confidence }] }
   * Designs a grounded oral-exam / interview / debate session. confidence is
   * honest per-prompt grounding ('grounded' | 'inferred' | 'not_in_material').
   */
  designSession: "e1d9c1f7-c523-4e7a-8090-a74495cdc58f",

  // ── REUSED (do not re-author) ──────────────────────────────────────────────
  /** front, back, rubric, seconds_allowed (+ audio message part) → spoken grade. */
  gradeSpoken: FC_AGENTS.gradeSpoken,
} as const;

export type SpokenPracticeAgentKey = keyof typeof SPOKEN_PRACTICE_AGENTS;

/** The study-spine item_type every graded spoken-practice prompt records under. */
export const SPOKEN_PROMPT_ITEM_TYPE = "spoken_prompt" as const;
