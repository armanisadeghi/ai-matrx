// features/flashcards/data/tutor/config.ts
//
// Phase 4 (Flashcards Competitive Parity Push) — mode-agnostic config for the
// TWO optional AI-tutor lanes usable by ANY study surface (classic set study,
// adaptive due review, weak-area drill, Fast Fire): live help (`fc_help_live`)
// and the end-of-session "professor" review (`fc_review_batch`), plus the new
// per-card micro-coaching lane. All default to the live published agent
// (`FC_AGENTS`) and are skipped cleanly when unset — hard-requirement
// "grader-agent-optional" generalizes to every tutor lane, not just Fast
// Fire's grader. Fast Fire's OWN spoken-grading config (`fc_grade_spoken`)
// stays in `fast-fire/config.ts` since only Fast Fire's voice lane uses it.
//
// Overridable per-browser via localStorage (swap in a frozen version or a
// test agent) — same mechanism as Fast Fire's config, distinct keys so the
// two don't collide.

import { FC_AGENTS } from "../agents";

const STORAGE_KEYS = {
  help: "flashcards.tutor.agent.help_live",
  review: "flashcards.tutor.agent.review_batch",
  microCoach: "flashcards.tutor.agent.micro_coach",
} as const;

export type FcTutorLane = keyof typeof STORAGE_KEYS;

export interface FcTutorAgentConfig {
  helpAgentId: string | null;
  reviewAgentId: string | null;
  /**
   * Cheap/fast-model per-card tip, surfaced right after grading (not just
   * end-of-session). No live agent is registered yet — author one via
   * agent_author (spec: features/education/docs/AGENT_SPECS.md §11) and set
   * it here (or via `setFcTutorAgentId`) to light this lane up. Until then
   * this cleanly no-ops, same as every other optional lane.
   */
  microCoachAgentId: string | null;
}

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(key);
    return v && v.trim().length > 0 ? v.trim() : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value && value.trim().length > 0) {
      window.localStorage.setItem(key, value.trim());
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // best-effort — a blocked localStorage just leaves the lane on its default
  }
}

export function getFcTutorAgentConfig(): FcTutorAgentConfig {
  return {
    helpAgentId: read(STORAGE_KEYS.help) ?? FC_AGENTS.helpLive,
    reviewAgentId: read(STORAGE_KEYS.review) ?? FC_AGENTS.reviewBatch,
    microCoachAgentId: read(STORAGE_KEYS.microCoach) ?? FC_AGENTS.microCoach,
  };
}

export function setFcTutorAgentId(
  lane: FcTutorLane,
  agentId: string | null,
): void {
  write(STORAGE_KEYS[lane], agentId);
}
