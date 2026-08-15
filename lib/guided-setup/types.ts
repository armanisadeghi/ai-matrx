/**
 * lib/guided-setup — the persistent, resumable guided checklist.
 *
 * Arman's ruling, 2026-08-14: "anything we can do on their behalf we'll do on
 * their behalf, and anything we can't, we'll teach them how to do it… if there
 * are things they have to do themselves, we create a checklist for them that
 * has persistence… if there are things we can programmatically check, we check
 * it for them."
 *
 * That is three kinds of step and nothing else:
 *
 *   auto      — we perform it. The user does nothing.
 *   verified  — the user performs it, WE machine-check the result and show a
 *               live pass/fail with the reason and the fix. Never make a human
 *               self-report something we can verify.
 *   confirmed — genuinely un-checkable. We hand over exact copy-paste values
 *               plus a how-to, and the user ticks it off.
 *
 * A checklist is DECLARED as config (see registry.ts) and rendered by the one
 * shell (components/GuidedChecklist.tsx). A surface that hand-builds its own
 * step list is the defect this primitive exists to delete.
 *
 * THE TRUE-CURRENT-STATUS LAW. Nothing machine-checkable is ever stamped: every
 * `verified` and `auto` step is re-checked on arrival, so a step that passed in
 * March and regressed in April reads FAILING today. Only human confirmations
 * persist, because only they cannot be derived.
 *
 * Copy rule: every user-facing string in a definition is written for a
 * brilliant, absolutely non-technical expert. Zero jargon, zero developer
 * concepts. This module supplies no domain words of its own.
 */

import type { ReactNode } from "react";

/** Where a run's persisted state is scoped. */
export interface ChecklistScope {
  /** The org that owns the run. A teammate's confirmation counts for everyone. */
  organizationId: string;
  /**
   * WHICH instance this checklist is about — a site id, a domain, a mailbox.
   * Omit for a checklist that is a singleton per org.
   */
  targetKey?: string;
}

/** What a live check concluded. */
export type CheckStatus =
  /** Verified good, right now. */
  | "pass"
  /** Verified not-good, right now. `reason` says why in the user's words. */
  | "fail"
  /** We are looking. */
  | "checking"
  /**
   * We could not look — the API was down, a permission is missing, the data is
   * not loaded yet. NOT the same as `fail`, and must never be rendered as one:
   * "we could not check" and "you have not done it" are different answers and
   * only one of them is true.
   */
  | "unknown";

export interface CheckFix {
  /** Verb-labelled, e.g. "Open Integrations", "Import history now". */
  label: string;
  /** A route to send the user to. Use for anything the user must do. */
  href?: string;
  /** Or an action we run on their behalf. Resolves when the world changed. */
  run?: () => Promise<void>;
  /** Opens `href` in a new tab so the user keeps their place. */
  newTab?: boolean;
}

export interface CheckResult {
  status: CheckStatus;
  /**
   * Why, in plain words, from the user's point of view. Required for `fail`
   * and `unknown` — a red state with no reason is the dead end this replaces.
   */
  reason?: string;
  /** Extra evidence: a date range, a count, the exact record we saw. */
  detail?: string;
  /** The one-click way out of a `fail`. NO DEAD ENDS. */
  fix?: CheckFix;
}

/** A value we want the user to copy verbatim into someone else's UI. */
export interface CopyValue {
  label: string;
  value: string;
  /** e.g. "Paste this into the Host / Name field." */
  hint?: string;
}

interface StepBase<Ctx> {
  /** Stable across releases — it is the persistence key. */
  id: string;
  /** What the user gets out of it, in their words. No jargon. */
  title: string;
  /** One sentence of why it matters. Optional. */
  description?: string;
  /**
   * Step ids that must be `pass` before this one can be acted on. A blocked
   * step still renders (the user sees what is coming) but is not actionable.
   */
  dependsOn?: string[];
  /**
   * Declaring a step optional keeps it out of the "are we done" verdict while
   * still offering it. Use sparingly — a checklist of optional steps is a menu.
   */
  optional?: boolean;
  /** Rendered under the step when it is the one being worked on. */
  extra?: (ctx: Ctx) => ReactNode;
}

/** We do it for them. */
export interface AutoStep<Ctx> extends StepBase<Ctx> {
  kind: "auto";
  /** Is it already done? Same contract as a verified step's check. */
  check: (ctx: Ctx) => Promise<CheckResult>;
  /** Perform it. Must be idempotent — it can be retried. */
  run: (ctx: Ctx) => Promise<void>;
  /**
   * Run without being asked the moment the step becomes unblocked and its
   * check says it is not done. Default true — "anything we can do on their
   * behalf we'll do on their behalf". Set false only when the action costs
   * real money or is not safely repeatable.
   */
  autoRun?: boolean;
  /** Button label when `autoRun` is false, e.g. "Import history now". */
  runLabel?: string;
  /** Shown while `run` is in flight, e.g. "Bringing in your history…". */
  runningLabel?: string;
}

/** They do it; we check it. */
export interface VerifiedStep<Ctx> extends StepBase<Ctx> {
  kind: "verified";
  check: (ctx: Ctx) => Promise<CheckResult>;
  /** Where the user goes to do the thing, when the check itself has no fix. */
  fix?: CheckFix;
}

/** Genuinely un-checkable: teach, hand over the values, let them tick it off. */
export interface ConfirmedStep<Ctx> extends StepBase<Ctx> {
  kind: "confirmed";
  /** Exact values to copy. Rendered with a copy button each. */
  values?: (ctx: Ctx) => CopyValue[];
  /** Numbered, plain-language instructions. */
  howTo?: (ctx: Ctx) => string[];
  /** The tick-box label, e.g. "I've added these records". */
  confirmLabel?: string;
  /**
   * A confirmation is a human's word, and words go stale. When set, a
   * confirmation older than this many days reverts to unconfirmed and asks
   * again rather than quietly asserting something nobody has looked at.
   */
  reconfirmAfterDays?: number;
}

export type ChecklistStep<Ctx> =
  | AutoStep<Ctx>
  | VerifiedStep<Ctx>
  | ConfirmedStep<Ctx>;

export interface ChecklistDefinition<Ctx = unknown> {
  /** Registry key. Stable — it is the persistence key. */
  key: string;
  /** e.g. "Get your site ready". Written for the non-technical expert. */
  title: string;
  /** One sentence under the title. Optional. */
  description?: string;
  /** Shown once every required step passes. */
  completeTitle?: string;
  completeDescription?: string;
  steps: ChecklistStep<Ctx>[];
}

// ── Persisted state ────────────────────────────────────────────────────────

/**
 * The last check result we saw, kept ONLY to paint the screen instantly on
 * return before the live re-check lands. It is never the answer — the live
 * check always overwrites it, and the UI marks it as last-known until then.
 */
export interface LastKnownResult {
  status: CheckStatus;
  reason?: string;
  at: string;
}

export interface PersistedStepState {
  /** `confirmed` steps only. ISO timestamp of the human's tick. */
  confirmedAt?: string;
  confirmedBy?: string;
  /** `auto` steps only. When we last performed it on their behalf. */
  ranAt?: string;
  /** Paint-fast cache. Never authoritative. */
  lastResult?: LastKnownResult;
}

export interface ChecklistRunState {
  steps: Record<string, PersistedStepState>;
}

export interface ChecklistRun {
  id: string;
  checklistKey: string;
  targetKey: string;
  organizationId: string;
  state: ChecklistRunState;
  completedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Resolved view (what the UI renders) ────────────────────────────────────

export type StepStatus =
  /** Done — verified live, or confirmed by a human and still in date. */
  | "done"
  /** Needs the user, right now. */
  | "action"
  /** We are checking or running. */
  | "busy"
  /** Waiting on an earlier step. */
  | "blocked"
  /** We could not check. Shown as neutral, never as a failure. */
  | "unknown";

export interface ResolvedStep {
  id: string;
  kind: ChecklistStep<never>["kind"];
  title: string;
  description?: string;
  optional: boolean;
  status: StepStatus;
  /** Live result for auto/verified steps; null for confirmed steps. */
  result: CheckResult | null;
  /** True while the live check has not landed and we are showing last-known. */
  stale: boolean;
  /** When last-known is what is on screen, when it was taken. */
  lastCheckedAt: string | null;
  /** Which earlier steps are holding this one up (titles, for the copy). */
  blockedBy: string[];
  /**
   * True when this step was `done` at the last check and is `action` now —
   * a regression, which the UI must say out loud rather than silently reopen.
   */
  regressed: boolean;
}

export interface ResolvedChecklist {
  key: string;
  title: string;
  description?: string;
  steps: ResolvedStep[];
  /** Required steps that are done. */
  doneCount: number;
  /** Required steps in total. */
  requiredCount: number;
  /** Every required step is done. */
  complete: boolean;
  /** The step the user should look at, or null when there is nothing to do. */
  currentStepId: string | null;
  /** True when any step regressed since the last visit. */
  hasRegression: boolean;
}
