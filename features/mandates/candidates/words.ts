/**
 * Mandate Candidates — the words a person reads for every server value.
 *
 * One place, so the pair window, the summary and F4's list/tab say the same
 * thing about the same state. Labels only; nothing here is a sentence longer
 * than its slot allows (interface-text).
 */

import type { LiveCandidate, LiveCandidateRun } from "./api";

type RunStatus = LiveCandidateRun["status"];
type Verdict = NonNullable<LiveCandidateRun["verdict"]>;
type StopMatch = NonNullable<LiveCandidateRun["stop_match"]>;
type CandidateStatus = LiveCandidate["status"];
type Recommendation = NonNullable<LiveCandidate["recommendation"]>;

export const VERDICT_WORD: Record<Verdict, string> = {
  better: "Better",
  same: "Same",
  worse: "Worse",
  regressed: "Regressed",
};

/** Semantic tone per verdict — the same pairs Hindsight's verdict chips use. */
export const VERDICT_TONE: Record<Verdict, string> = {
  better: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  same: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  worse: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  regressed: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export const RUN_STATUS_WORD: Record<RunStatus, string> = {
  queued: "Waiting to run",
  running: "Running",
  completed: "Finished",
  stopped: "Stopped at a write",
  failed: "Failed",
  timed_out: "Timed out",
};

export const STOP_MATCH_WORD: Record<StopMatch, string> = {
  same_call: "The live run made the same call",
  same_tool_different_args: "Same tool, different arguments",
  different_tool: "The live run called a different tool",
  live_made_no_call: "The live run made no call here",
};

export const CANDIDATE_STATUS_WORD: Record<CandidateStatus, string> = {
  collecting: "Collecting runs",
  ready: "Ready for your decision",
  promoted: "Promoted",
  discarded: "Discarded",
  cancelled: "Cancelled",
};

export const RECOMMENDATION_WORD: Record<Recommendation, string> = {
  promote: "Promote",
  hold: "Hold",
  reject: "Reject",
};

export const RECOMMENDATION_TONE: Record<Recommendation, string> = {
  promote: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  hold: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  reject: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export const DISPOSITION_WORD: Record<"real" | "borrowed" | "stopped", string> = {
  real: "Ran for real",
  borrowed: "Used the live result",
  stopped: "Stopped here",
};

/** How the pair reached its terminal state — the pair's one-word outcome. */
export function runOutcomeWord(run: Pick<LiveCandidateRun, "status" | "verdict">): string {
  if (run.status === "completed" && run.verdict) return VERDICT_WORD[run.verdict];
  if (run.status === "completed") return "Not judged";
  return RUN_STATUS_WORD[run.status];
}

/** Door names from PLAN §2.3 — how the live run started. */
export const DOOR_WORD: Record<string, string> = {
  chat_start: "Chat",
  run_mandate: "Server run",
  batch_submit: "Batch",
  run_mandated: "Named agent",
  workflow_step: "Workflow step",
  held_code_call: "Held code call",
};

export function doorWord(door: string): string {
  return DOOR_WORD[door] ?? door;
}

/** Skip reasons (P17) the tap counts on the candidate. */
export const SKIP_WORD: Record<string, string> = {
  not_visible: "You can't open the live chat",
  other_rung: "Ran on another rung",
  uncovered_door: "Door not covered",
  continuation: "A follow-up turn",
};

export function skipWord(reason: string): string {
  return SKIP_WORD[reason] ?? reason;
}

/** Input parts measured at the send seam (P10). */
export const INPUT_PART_WORD: Record<string, string> = {
  system: "Instructions",
  variables: "Variables",
  context_blocks: "Context",
  scope_slots: "Scopes",
  messages: "Messages",
  tools_offered: "Tools offered",
  attachments: "Attachments",
  live: "Live input",
  candidate: "Candidate input",
};

export function inputPartWord(part: string): string {
  return INPUT_PART_WORD[part] ?? part;
}
