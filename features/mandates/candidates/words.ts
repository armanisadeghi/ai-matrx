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

/**
 * P16 — a pair that was interrupted (a restart, a deploy) and run again says
 * so. `null` on a first attempt.
 */
export function attemptWord(attempts: number | null | undefined): string | null {
  return typeof attempts === "number" && attempts > 1 ? `Attempt ${attempts}` : null;
}

/**
 * P10 as amended (A4): every pair leads with ONE explicit line — "Shared inputs
 * identical", or the shared parts that differed. Shared = every measured part
 * except the candidate's own (its instructions and tool offer, `expected`).
 * `null` differences = not measured yet.
 */
export function sharedInputsLine(
  differences: { flagged: readonly string[]; unmeasured: readonly string[] } | null,
): { text: string; tone: "same" | "differed" | "unknown" } {
  if (!differences) return { text: "Shared inputs not measured yet", tone: "unknown" };
  if (differences.flagged.length > 0) {
    return {
      text: `Shared inputs differed: ${differences.flagged.map(inputPartWord).join(", ")}`,
      tone: "differed",
    };
  }
  if (differences.unmeasured.length > 0) {
    return {
      text: `Shared inputs not measured: ${differences.unmeasured.map(inputPartWord).join(", ")}`,
      tone: "unknown",
    };
  }
  return { text: "Shared inputs identical", tone: "same" };
}

// ── THE DECISION CONFIRMATIONS (V2 N3) ───────────────────────────────────────
// Promote changes what runs for every real run, so it always asks first —
// naming what goes live in place of what — on every surface that offers it
// (the Candidates tab and the summary record). A Reject or Hold recommendation
// is said plainly in the same dialog, never left on the card behind it. Put
// back and Discard ask in the same shape. One builder per decision so the two
// surfaces can never word the same choice two ways.

export interface DecisionWords {
  title: string;
  description: string;
  confirmLabel: string;
}

export interface DecisionSubject {
  candidateName: string;
  /** What runs now; null when nothing does. */
  baselineName: string | null;
  recommendation: Recommendation | null | undefined;
  /** Pairs with a judge verdict. */
  judged: number;
  /** The job's name, when the surface does not already show it. */
  mandateName?: string | null;
}

export function promoteConfirmation(subject: DecisionSubject): DecisionWords {
  const baseline = subject.baselineName ?? "what runs now";
  const lead = `${subject.candidateName} replaces ${baseline} for every real run.`;
  if (subject.recommendation === "reject") {
    return { title: "Promote a rejected candidate?", description: `${lead} The review said reject.`, confirmLabel: "Promote anyway" };
  }
  if (subject.recommendation === "hold") {
    return { title: "Promote before the review is sure?", description: `${lead} The review said hold.`, confirmLabel: "Promote anyway" };
  }
  const evidence =
    subject.judged === 0
      ? "No run has been judged yet."
      : `Based on ${subject.judged} judged run${subject.judged === 1 ? "" : "s"}.`;
  const title = subject.mandateName ? `Make the candidate live for ${subject.mandateName}?` : "Make the candidate live?";
  return { title, description: `${lead} ${evidence}`, confirmLabel: "Promote" };
}

export function putBackConfirmation(subject: Pick<DecisionSubject, "candidateName" | "baselineName">): DecisionWords {
  const baseline = subject.baselineName ?? "What ran before";
  return {
    title: "Put back what ran before?",
    description: `${baseline} goes live again for every real run, replacing ${subject.candidateName}.`,
    confirmLabel: "Put back",
  };
}

export function discardConfirmation(subject: Pick<DecisionSubject, "baselineName">): DecisionWords {
  const baseline = subject.baselineName ?? "what runs now";
  return {
    title: "Discard this candidate?",
    description: `Its runs stop now and ${baseline} stays live. The recorded runs are kept.`,
    confirmLabel: "Discard",
  };
}

/**
 * FX-D2 — what tells one pair's walk windows from another's: the pair number
 * AND the time the pair ran. The number alone collides across candidates of
 * one mandate (each has a "Pair 1"); the time alone collides inside one batch.
 * Local 24-hour clock, ≤ 16 chars ("Pair 12 · 22:23").
 */
export function pairWalkLabel(run: Pick<LiveCandidateRun, "number" | "created_at">): string {
  const at = new Date(run.created_at);
  if (Number.isNaN(at.getTime())) return `Pair ${run.number}`;
  const clock = at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `Pair ${run.number} · ${clock}`;
}
