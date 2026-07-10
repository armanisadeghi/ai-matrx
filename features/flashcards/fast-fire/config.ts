// features/flashcards/fast-fire/config.ts
//
// FastFire's agent-id settings. Three AI lanes — per-card grading
// (`fc_grade_spoken`), live help (`fc_help_live`), and the batch "professor"
// review (`fc_review_batch`) — are each OPTIONAL; the agents are authored by
// the user in-system, and until an id is set that lane is simply skipped
// (hard-requirement #6: grader-agent-optional).
//
// Grading (`fc_grade_spoken`) is Fast-Fire-only, so it keeps its own
// localStorage override here. Help + review are now MODE-AGNOSTIC (Phase 4
// parity push generalized them to every study surface) — this module
// delegates those two to the shared `features/education/tutor/lanes/config.ts`
// so there is exactly ONE override per lane, not a FastFire-local one that
// could silently diverge from what every other surface reads.

import { FC_AGENTS } from "@/features/flashcards/data/agents";
import { getFcTutorAgentConfig } from "@/features/education/tutor/lanes/config";

const STORAGE_KEYS = {
  grader: "fastfire.agent.grade_spoken",
} as const;

export type FastFireAgentLane = "grader";

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
  const tutor = getFcTutorAgentConfig();
  return {
    graderAgentId: read(STORAGE_KEYS.grader) ?? FC_AGENTS.gradeSpoken,
    helpAgentId: tutor.helpAgentId,
    reviewAgentId: tutor.reviewAgentId,
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
