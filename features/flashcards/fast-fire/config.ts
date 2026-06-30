// features/flashcards/fast-fire/config.ts
//
// FastFire's agent-id settings. The three AI lanes — per-card grading
// (`fc_grade_spoken`), live help (`fc_help_live`), and the batch "professor"
// review (`fc_review_batch`) — are each OPTIONAL. The agents are authored by the
// user in-system; until an id is set here, that lane is simply skipped and the
// drill still runs fully (hard-requirement #6: grader-agent-optional). Grading
// "lights up" the moment an id is configured — no code change needed.
//
// Stored in localStorage (a per-user, per-browser setting) so they're trivially
// settable now for testing and survive reloads. Read through the typed helpers
// so callsites never touch the raw keys. Server-safe: guarded for SSR.

import { FC_AGENTS } from "@/features/flashcards/data/agents";

const STORAGE_KEYS = {
  grader: "fastfire.agent.grade_spoken",
  help: "fastfire.agent.help_live",
  review: "fastfire.agent.review_batch",
} as const;

export type FastFireAgentLane = keyof typeof STORAGE_KEYS;

/** The configured agent ids, any of which may be null (lane disabled). */
export interface FastFireAgentConfig {
  graderAgentId: string | null;
  helpAgentId: string | null;
  reviewAgentId: string | null;
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
    // best-effort — a blocked localStorage just leaves the lane disabled
  }
}

export function getFastFireAgentConfig(): FastFireAgentConfig {
  // Live published agents are the default; a localStorage value overrides per-browser
  // (for swapping in a frozen version or a test agent). All three lanes ship enabled.
  return {
    graderAgentId: read(STORAGE_KEYS.grader) ?? FC_AGENTS.gradeSpoken,
    helpAgentId: read(STORAGE_KEYS.help) ?? FC_AGENTS.helpLive,
    reviewAgentId: read(STORAGE_KEYS.review) ?? FC_AGENTS.reviewBatch,
  };
}

export function setFastFireAgentId(
  lane: FastFireAgentLane,
  agentId: string | null,
): void {
  write(STORAGE_KEYS[lane], agentId);
}

/** Convenience predicate — true when at least the grader lane is configured. */
export function hasGrader(config: FastFireAgentConfig): boolean {
  return !!config.graderAgentId;
}
