"use client";

// features/mandates/admin/impact.ts
//
// THE STANDING TABLE'S READ OF THE ONE GRADER (Agent Change Impact, I4).
//
// 🚨 ONE GRADER (R12). Every "is this pin safe to move?" answer on the mandate
// console comes from aidream `POST /mandates/impact` — the server's column-diff
// rules, its settings signal, its resolution walk's set-aside verdict. Nothing
// in this file re-derives a grade or a blocker; it groups the server's verdicts
// onto console rows, says in words what each value means, and decides which
// rows a BATCH may carry (R17: a blocked row is a per-row door, never a batch
// member).
//
// Contract: common-docs/projects/agent-change-impact/CONTRACT.md (frozen, with
// Amendments 1–3 — `global` principals, `tracks_latest`, the envelope, the
// unknown-agent sentence). The WRITE half (`/mandates/impact/advance` and
// `/mandates/impact/revert`, I3) is called from here too: every advance sends
// exactly the tokens the read emitted, and every per-row result sentence on a
// screen is the server's, verbatim (R8, R9).

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import type { components } from "@/types/python-generated/api-types";
import { knobInt } from "@/lib/knobs/featureKnobs";

export type ImpactReport = components["schemas"]["ImpactReport"];
export type ImpactVerdict = components["schemas"]["ImpactVerdict"];
export type ImpactFinding = components["schemas"]["ImpactFinding"];
export type ImpactWithheld = components["schemas"]["ImpactWithheld"];
export type ApplyToken = components["schemas"]["ApplyToken"];
export type AdvanceReport = components["schemas"]["AdvanceReport"];
export type AdvanceRowResult = components["schemas"]["AdvanceRowResult"];
export type AdvanceRowStatus = AdvanceRowResult["status"];
export type ImpactDelta = components["schemas"]["ImpactDelta"];
export type ImpactGrade = ImpactVerdict["grade"];
export type ImpactBlocker = NonNullable<ImpactVerdict["blocker"]>;

/** The grade ladder, least to most dangerous — the server's own total order. */
export const IMPACT_GRADE_ORDER: readonly ImpactGrade[] = [
  "identical",
  "green",
  "orange",
  "red",
];

/**
 * How many agent ids one read carries. The server caps a request with the
 * platform knob `agent_impact.max_agent_ids` (500 on 2026-09-14) and REFUSES
 * past it by name; the set-aside half separately caps distinct principal
 * groups per request (`max_principal_groups`, 64). Small pages keep a normal
 * console load under both. A refusal still reaches the screen verbatim — this
 * constant never hides one.
 */
export const IMPACT_AGENT_PAGE_SIZE = 40;

/**
 * The payload the advance door takes (aidream `AdvanceRequest`): exactly the
 * tokens the read emitted, never re-derived.
 */
export function buildAdvancePayload(
  verdicts: readonly ImpactVerdict[],
  batchLabel: string,
): { batch_label: string; tokens: ApplyToken[] } {
  return {
    batch_label: batchLabel,
    tokens: verdicts.map((verdict) => verdict.apply_token),
  };
}

export interface GradeMeta {
  label: string;
  /** One sentence for a person — the legend and the badge tooltip. */
  meaning: string;
  toneClassName: string;
}

export const GRADE_META: Record<ImpactGrade, GradeMeta> = {
  identical: {
    label: "Identical",
    meaning:
      "Nothing that affects a run changed between the pinned version and the newest one.",
    toneClassName: "border-border bg-muted text-muted-foreground",
  },
  green: {
    label: "Green",
    meaning:
      "Only low-risk things changed — the model on the same provider, the prompt, metadata. Almost never breaks a job.",
    toneClassName:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  orange: {
    label: "Orange",
    meaning:
      "The output changed — its kind or its schema — or the provider changed. Can break whatever reads the result.",
    toneClassName:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  red: {
    label: "Red",
    meaning:
      "Variables or context slots were added, removed or renamed. The most common way a job breaks — look before you move it.",
    toneClassName:
      "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
};

export interface BlockerMeta {
  label: string;
  meaning: string;
  /** What a person can do about it, in words — every blocker ships its door. */
  remedy: string;
  toneClassName: string;
}

export const BLOCKER_META: Record<ImpactBlocker | "none", BlockerMeta> = {
  none: {
    label: "None",
    meaning: "This pin can be moved.",
    remedy: "Select it for a batch, or advance it on its own.",
    toneClassName: "border-border text-muted-foreground",
  },
  unreachable: {
    label: "Unreachable",
    meaning:
      "The agent's live definition is ahead of every saved version, so there is no version to pin to.",
    remedy:
      "Open the mandate and choose “Track latest automatically”, or save a new version of the agent first.",
    toneClassName:
      "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
  set_aside: {
    label: "Set aside",
    meaning:
      "Resolution already skips this rung, so moving its pin would change nothing.",
    remedy: "Open the mandate and fix why it was set aside first.",
    toneClassName:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  tracks_latest: {
    label: "Tracks latest",
    meaning:
      "No pin — this rung follows the agent's newest definition already, so there is nothing to advance.",
    remedy:
      "Nothing to do. Its grade is against the version before the newest, so you can still see what the last change did.",
    toneClassName: "border-border bg-muted text-muted-foreground",
  },
  unsupported_holder: {
    label: "Not an agent",
    meaning:
      "The holder is not an agent (for example a workflow), so the agent classifier does not judge it.",
    remedy: "Open the mandate to review its holder by hand.",
    toneClassName: "border-border text-muted-foreground",
  },
};

export function blockerKeyOf(verdict: ImpactVerdict): ImpactBlocker | "none" {
  return verdict.blocker ?? "none";
}

/**
 * `set_aside_reason` is meaningful ONLY when the blocker is `set_aside`
 * (CONTRACT: present iff). The live read also fills it on other blockers
 * (R36 b) — reading it there would call hundreds of rows set aside.
 */
export function setAsideReasonOf(verdict: ImpactVerdict): string | null {
  return verdict.blocker === "set_aside"
    ? (verdict.set_aside_reason ?? null)
    : null;
}

/** A rung whose pin is not the newest saved version. `tracks_latest` has no pin. */
export function isBehindLatest(verdict: ImpactVerdict): boolean {
  if (verdict.blocker === "tracks_latest") return false;
  if (verdict.blocker === "unreachable") return true;
  return (
    verdict.pinned_version_id != null &&
    verdict.latest_version_id != null &&
    verdict.pinned_version_id !== verdict.latest_version_id
  );
}

/**
 * The settings half of the verdict, in the only three honest states. A
 * capability check that could not run, or keys that changed, are NEVER clean
 * (R15): the first is unmeasured, the second is a change the grade does not
 * weigh and a person should see.
 */
export type SettingsSignal =
  | { state: "clean" }
  | { state: "unmeasured"; sentence: string }
  | { state: "changed"; sentence: string };

export function settingsSignalOf(verdict: ImpactVerdict): SettingsSignal {
  const drift = verdict.settings_drift;
  const unexpected = (drift?.capability ?? []).filter(
    (issue) => !issue.expected,
  );
  if (!drift || drift.capability_checked !== true) {
    return {
      state: "unmeasured",
      sentence:
        "Settings unmeasured — the capability check could not run for this model, so these settings are not known to be clean.",
    };
  }
  const keys = drift.keys ?? [];
  if (keys.length > 0 || unexpected.length > 0) {
    const parts: string[] = [];
    if (keys.length > 0) {
      parts.push(
        `settings changed: ${keys.map((key) => `${key.key} (${key.change})`).join(", ")}`,
      );
    }
    for (const issue of unexpected) parts.push(issue.reason);
    return { state: "changed", sentence: parts.join("; ") };
  }
  return { state: "clean" };
}

/** Why a verdict can or cannot ride a batch — the sentence is shown when it can't. */
export type BatchEligibility =
  | { batchable: true }
  | { batchable: false; why: string };

export function batchEligibilityOf(verdict: ImpactVerdict): BatchEligibility {
  if (verdict.blocker) {
    return {
      batchable: false,
      why: `${BLOCKER_META[verdict.blocker].label}: ${BLOCKER_META[verdict.blocker].remedy}`,
    };
  }
  if (verdict.principal.kind === "user") {
    return {
      batchable: false,
      why: "A person's own pin — theirs to advance, never moved on their behalf.",
    };
  }
  if (!isBehindLatest(verdict)) {
    return { batchable: false, why: "Already on the newest saved version." };
  }
  if (!verdict.apply_token.target_version_id) {
    return {
      batchable: false,
      why: "The read named no version to move to, so no advance can be applied from it.",
    };
  }
  return { batchable: true };
}

/**
 * "Advance all green" — every condition the contract puts on a safe move:
 * green or identical, no blocker, and the server's own `auto_advance_eligible`
 * (capability measured, no unexpected settings issue, no descendant at a
 * higher grade, old enough).
 */
export function isSafeGreen(verdict: ImpactVerdict): boolean {
  return (
    batchEligibilityOf(verdict).batchable &&
    (verdict.grade === "green" || verdict.grade === "identical") &&
    verdict.auto_advance_eligible === true
  );
}

export function isAdvanceAnyway(verdict: ImpactVerdict): boolean {
  return verdict.grade === "orange" || verdict.grade === "red";
}

// ---------------------------------------------------------------------------
// The read.
// ---------------------------------------------------------------------------

function isImpactReport(value: unknown): value is ImpactReport {
  if (typeof value !== "object" || value === null) return false;
  const verdicts = (value as { verdicts?: unknown }).verdicts;
  const computedAt = (value as { computed_at?: unknown }).computed_at;
  return (
    (verdicts === undefined || Array.isArray(verdicts)) &&
    typeof computedAt === "string"
  );
}

export interface StandingImpact {
  verdicts: ImpactVerdict[];
  /** Summed across pages; the sentence is the server's, never composed here. */
  withheldTotal: number;
  withheldSentences: string[];
  agentsExamined: number;
  /** Ids the caller asked about that are not live agents it can read (Amendment 3d). */
  unknownAgentIds: string[];
  unknownSentences: string[];
  /** True when every page was graded against a hypothetical delta (R23). */
  dryRun: boolean;
  computedAt: string;
}

export interface FetchImpactOptions {
  /**
   * A DRY RUN (R14, R23): grade every rung as if this patch had been applied
   * to the pinned version. Every verdict then carries a null target token, so
   * no advance can be applied from it.
   */
  delta?: ImpactDelta | null;
  /**
   * Walk duplicated descendants (R4). OFF for the standing table, which passes
   * every holder agent itself; ON for a batch scoped to the agents a writer
   * touched, so a mandate on a duplicate of one of them is surfaced too.
   */
  includeDescendants: boolean;
}

/**
 * THE read, paged and bounded. Every caller — the standing table, the batch
 * dry-run, the post-batch census — goes through here so there is one place
 * that pages, one place that caps concurrency, and one place that sums what
 * the server withheld.
 */
export async function fetchImpact(
  dispatch: AppDispatch,
  agentIds: readonly string[],
  options: FetchImpactOptions,
): Promise<StandingImpact> {
  const unique = Array.from(new Set(agentIds)).sort();
  const pages: string[][] = [];
  for (let i = 0; i < unique.length; i += IMPACT_AGENT_PAGE_SIZE) {
    pages.push(unique.slice(i, i + IMPACT_AGENT_PAGE_SIZE));
  }
  // 🚨 BOUNDED FAN-OUT (R20). Measured 2026-09-14 on live f687a4e97: one page
  // of 30 agents took 23.6 s of server CPU, and the console holds ~383 holder
  // agents. Firing every page at once would pin the serving loop; two at a
  // time keeps the read honest without starving everyone else.
  const readPage = async (page: string[]): Promise<ImpactReport> => {
    const response = await dispatch(
      callApi({
        path: "/mandates/impact",
        method: "POST",
        body: {
          agent_ids: page,
          include_descendants: options.includeDescendants,
          delta: options.delta ?? null,
        },
      }),
    );
    if (response.error) throw new Error(response.error.message);
    if (!isImpactReport(response.data)) {
      throw new Error(
        "POST /mandates/impact did not return an impact report — the grades are unknown, not clean.",
      );
    }
    return response.data;
  };
  const IMPACT_PAGE_CONCURRENCY = 2;
  const reports: ImpactReport[] = new Array<ImpactReport>(pages.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < pages.length) {
      const index = cursor;
      cursor += 1;
      reports[index] = await readPage(pages[index]);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(IMPACT_PAGE_CONCURRENCY, pages.length) },
      () => worker(),
    ),
  );
  return mergeImpactReports(reports);
}

/** Sum a set of page reports into one — exported so a test can prove the arithmetic. */
export function mergeImpactReports(
  reports: readonly ImpactReport[],
): StandingImpact {
  const sentences = new Set<string>();
  const unknownSentences = new Set<string>();
  const unknownAgentIds = new Set<string>();
  let withheldTotal = 0;
  let agentsExamined = 0;
  let computedAt = "";
  let dryRun = reports.length > 0;
  const verdicts: ImpactVerdict[] = [];
  for (const report of reports) {
    verdicts.push(...(report.verdicts ?? []));
    withheldTotal += report.withheld?.total ?? 0;
    if (report.withheld?.sentence && (report.withheld.total ?? 0) > 0) {
      sentences.add(report.withheld.sentence);
    }
    for (const id of report.unknown_agent_ids ?? []) unknownAgentIds.add(id);
    if (report.unknown_sentence && (report.unknown_agent_ids ?? []).length > 0) {
      unknownSentences.add(report.unknown_sentence);
    }
    agentsExamined += report.agents_examined ?? 0;
    if (report.computed_at > computedAt) computedAt = report.computed_at;
    if (report.dry_run !== true) dryRun = false;
  }
  return {
    verdicts,
    withheldTotal,
    withheldSentences: Array.from(sentences),
    agentsExamined,
    unknownAgentIds: Array.from(unknownAgentIds),
    unknownSentences: Array.from(unknownSentences),
    dryRun,
    computedAt,
  };
}

/** Sum several already-merged reads (a dry run with one delta per model). */
export function mergeStandingImpacts(
  parts: readonly StandingImpact[],
): StandingImpact {
  const merged: StandingImpact = {
    verdicts: [],
    withheldTotal: 0,
    withheldSentences: [],
    agentsExamined: 0,
    unknownAgentIds: [],
    unknownSentences: [],
    dryRun: parts.length > 0 && parts.every((part) => part.dryRun),
    computedAt: "",
  };
  const withheld = new Set<string>();
  const unknownSentences = new Set<string>();
  const unknownIds = new Set<string>();
  for (const part of parts) {
    merged.verdicts.push(...part.verdicts);
    merged.withheldTotal += part.withheldTotal;
    for (const sentence of part.withheldSentences) withheld.add(sentence);
    for (const sentence of part.unknownSentences) unknownSentences.add(sentence);
    for (const id of part.unknownAgentIds) unknownIds.add(id);
    merged.agentsExamined += part.agentsExamined;
    if (part.computedAt > merged.computedAt) merged.computedAt = part.computedAt;
  }
  merged.withheldSentences = Array.from(withheld);
  merged.unknownSentences = Array.from(unknownSentences);
  merged.unknownAgentIds = Array.from(unknownIds);
  return merged;
}

/**
 * Grade every rung the named agents hold, directly. Descendants are OFF: the
 * console passes every holder agent it lists, so walking descendants would
 * return the same rung twice under two lineage paths.
 */
export function fetchStandingImpact(
  dispatch: AppDispatch,
  agentIds: readonly string[],
): Promise<StandingImpact> {
  return fetchImpact(dispatch, agentIds, { includeDescendants: false });
}

// ---------------------------------------------------------------------------
// The write (I3): advance and revert.
// ---------------------------------------------------------------------------

function isAdvanceReport(value: unknown): value is AdvanceReport {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { batch_id?: unknown; results?: unknown; action?: unknown };
  return (
    typeof record.batch_id === "string" &&
    (record.results === undefined || Array.isArray(record.results)) &&
    (record.action === "advance" || record.action === "revert")
  );
}

/**
 * Move the named pins. Sends exactly the read's tokens (R9); the server judges
 * every row again as the actor before it writes, and answers per row (R8) —
 * advanced, refused or excluded, each with its own sentence.
 */
export async function postAdvance(
  dispatch: AppDispatch,
  verdicts: readonly ImpactVerdict[],
  batchLabel: string,
): Promise<AdvanceReport> {
  const response = await dispatch(
    callApi({
      path: "/mandates/impact/advance",
      method: "POST",
      body: buildAdvancePayload(verdicts, batchLabel),
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (!isAdvanceReport(response.data)) {
    throw new Error(
      "POST /mandates/impact/advance did not return a batch report — whether any pin moved is unknown; reload the table before acting again.",
    );
  }
  return response.data;
}

/**
 * Put a batch (or one rung of it) back where the ledger says it was. The
 * server refuses, by sentence, a row outside the organization's revert window
 * or one already reverted; the sentence reaches the screen verbatim.
 */
export async function postRevert(
  dispatch: AppDispatch,
  batchId: string,
  rowId: string | null,
  batchLabel: string,
): Promise<AdvanceReport> {
  const response = await dispatch(
    callApi({
      path: "/mandates/impact/revert",
      method: "POST",
      body: { batch_id: batchId, row_id: rowId, batch_label: batchLabel },
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (!isAdvanceReport(response.data)) {
    throw new Error(
      "POST /mandates/impact/revert did not return a batch report — whether any pin moved back is unknown; reload the table before acting again.",
    );
  }
  return response.data;
}

/** `${holder_kind}:${row_id}` — the one identity a rung has across reads, tokens and results. */
export function rungIdentityOf(
  rung: Pick<ApplyToken, "holder_kind" | "row_id">,
): string {
  return `${rung.holder_kind}:${rung.row_id}`;
}

/** Results keyed by rung identity, so a row can show what the last write said about it. */
export function indexResultsByRung(
  report: AdvanceReport,
): Map<string, AdvanceRowResult> {
  const out = new Map<string, AdvanceRowResult>();
  for (const result of report.results ?? []) {
    out.set(rungIdentityOf(result.token), result);
  }
  return out;
}

export interface ResultStatusMeta {
  label: string;
  toneClassName: string;
}

export const RESULT_STATUS_META: Record<AdvanceRowStatus, ResultStatusMeta> = {
  advanced: {
    label: "Advanced",
    toneClassName:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  reverted: {
    label: "Reverted",
    toneClassName:
      "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  refused: {
    label: "Refused",
    toneClassName:
      "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
  excluded: {
    label: "Excluded",
    toneClassName:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
};

/**
 * One sentence for the toast after a write — counts only; the per-row
 * sentences live on the rows. The server's counts are trusted over a recount.
 */
export function summarizeAdvanceReport(report: AdvanceReport): string {
  const counts = report.counts ?? {};
  const total = counts.total ?? report.results?.length ?? 0;
  const parts: string[] = [];
  if (report.action === "revert") {
    parts.push(`${counts.reverted ?? 0} of ${total} put back`);
  } else {
    parts.push(`${counts.advanced ?? 0} of ${total} advanced`);
  }
  if ((counts.refused ?? 0) > 0) parts.push(`${counts.refused} refused`);
  if ((counts.excluded ?? 0) > 0) parts.push(`${counts.excluded} excluded`);
  return parts.join(", ") + ".";
}

/** The rows of a batch that actually moved and can therefore be put back. */
export function revertableRows(report: AdvanceReport): AdvanceRowResult[] {
  return (report.results ?? []).filter((row) => row.status === "advanced");
}

// ---------------------------------------------------------------------------
// The batch panel's three tiers (I5).
// ---------------------------------------------------------------------------

/**
 * Arman's three piles, plus the two a batch must name rather than hide:
 *   safe    — only low-risk things changed AND the settings check ran clean:
 *             one button moves them all.
 *   drift   — the change itself is low-risk but the programmatic settings
 *             check found something (or could not run), or the output changed
 *             (orange): click through, fix, or advance anyway.
 *   red     — variables or context slots changed: open one, or advance anyway.
 *   blocked — a blocker or someone else's personal pin (R17, I12): shown by
 *             name with the reason, never selectable.
 *   current — already on the newest saved version; nothing to do.
 */
export type BatchTier = "safe" | "drift" | "red" | "blocked" | "current";

export const BATCH_TIER_ORDER: readonly BatchTier[] = [
  "red",
  "drift",
  "safe",
  "blocked",
  "current",
];

export interface BatchTierMeta {
  label: string;
  /** What the pile means and what the door is, in words. */
  meaning: string;
  toneClassName: string;
}

export const BATCH_TIER_META: Record<BatchTier, BatchTierMeta> = {
  safe: {
    label: "Safe",
    meaning:
      "Only low-risk things changed and the settings check ran clean. One button moves all of these.",
    toneClassName:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  drift: {
    label: "Check settings",
    meaning:
      "Low-risk change, but the settings check found something (or could not run), or the output changed. Click through each one, or advance it anyway.",
    toneClassName:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  red: {
    label: "Red",
    meaning:
      "Variables or context slots changed — the most common way a job breaks. Open it, or advance it anyway.",
    toneClassName:
      "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
  blocked: {
    label: "Not in this batch",
    meaning:
      "Blocked, or a person's own pin — named here with the reason; never moved by a batch.",
    toneClassName: "border-border bg-muted text-muted-foreground",
  },
  current: {
    label: "Current",
    meaning: "Already on the newest saved version. Nothing to do.",
    toneClassName: "border-border text-muted-foreground",
  },
};

export function batchTierOf(verdict: ImpactVerdict): BatchTier {
  const eligibility = batchEligibilityOf(verdict);
  if (!eligibility.batchable) {
    // A dry run has no target token by design (R23) — that is not a blocker,
    // and a current row is not blocked either; both are told apart here.
    if (verdict.blocker || verdict.principal.kind === "user") return "blocked";
    if (!isBehindLatest(verdict)) return "current";
  }
  if (verdict.grade === "red") return "red";
  if (verdict.grade === "orange") return "drift";
  if (settingsSignalOf(verdict).state !== "clean") return "drift";
  return "safe";
}

/** A row a person may move from the batch panel — safe, drift or red, never blocked/current. */
export function isBatchActionable(verdict: ImpactVerdict): boolean {
  const tier = batchTierOf(verdict);
  return (
    (tier === "safe" || tier === "drift" || tier === "red") &&
    batchEligibilityOf(verdict).batchable
  );
}

export interface BatchTierCounts {
  agents: number;
  mandates: number;
  rungs: number;
  byTier: Record<BatchTier, number>;
}

export function countBatchTiers(
  verdicts: readonly ImpactVerdict[],
): BatchTierCounts {
  const byTier: Record<BatchTier, number> = {
    safe: 0,
    drift: 0,
    red: 0,
    blocked: 0,
    current: 0,
  };
  const agents = new Set<string>();
  const mandates = new Set<string>();
  for (const verdict of verdicts) {
    byTier[batchTierOf(verdict)] += 1;
    agents.add(verdict.agent_id);
    mandates.add(verdict.mandate_key);
  }
  return { agents: agents.size, mandates: mandates.size, rungs: verdicts.length, byTier };
}

/**
 * The headline sentence Arman asked for: "N agents, M mandates: x safe /
 * y to check / z red" — plus the piles a batch must name rather than hide.
 */
export function describeBatch(counts: BatchTierCounts): string {
  const head = `${counts.agents} agent${counts.agents === 1 ? "" : "s"}, ${counts.mandates} mandate${counts.mandates === 1 ? "" : "s"} (${counts.rungs} pin${counts.rungs === 1 ? "" : "s"})`;
  const piles = [
    `${counts.byTier.safe} safe`,
    `${counts.byTier.drift} to check`,
    `${counts.byTier.red} red`,
  ];
  if (counts.byTier.blocked > 0) piles.push(`${counts.byTier.blocked} not in this batch`);
  if (counts.byTier.current > 0) piles.push(`${counts.byTier.current} already current`);
  return `${head}: ${piles.join(" / ")}`;
}

/** Verdicts grouped by mandate key: the mandate's own default rung, then its bindings. */
export interface MandateImpact {
  defaultVerdict: ImpactVerdict | null;
  bindingVerdicts: ImpactVerdict[];
}

export function groupImpactByMandate(
  verdicts: readonly ImpactVerdict[],
): Map<string, MandateImpact> {
  const out = new Map<string, MandateImpact>();
  // A rung reached through two holder agents must never count twice.
  const seen = new Set<string>();
  for (const verdict of verdicts) {
    const identity = `${verdict.holder_kind}:${verdict.row_id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const entry = out.get(verdict.mandate_key) ?? {
      defaultVerdict: null,
      bindingVerdicts: [],
    };
    if (verdict.holder_kind === "mandate_default") {
      entry.defaultVerdict = verdict;
    } else {
      entry.bindingVerdicts.push(verdict);
    }
    out.set(verdict.mandate_key, entry);
  }
  return out;
}

export function versionLabel(number: number | null | undefined): string {
  return number == null ? "latest" : `v${number}`;
}

/**
 * The consequence sentence an advance states BEFORE the click
 * (destructive-and-expensive-actions law): how many rungs move, from which
 * versions to which, how many are green, how many were chosen despite a
 * warning, and what the undo is.
 */
export function describeAdvance(
  verdicts: readonly ImpactVerdict[],
  revertWindow: RevertWindow,
): { title: string; description: string; moves: string[] } {
  const green = verdicts.filter(
    (v) => v.grade === "green" || v.grade === "identical",
  ).length;
  const anyway = verdicts.length - green;
  const moves = verdicts.map(
    (v) =>
      `${v.mandate_key}${v.holder_kind === "binding" ? ` (${v.principal.kind} binding)` : ""}: ${v.agent_name} ${versionLabel(v.pinned_version_number)} → ${versionLabel(v.latest_version_number)} · ${GRADE_META[v.grade].label}`,
  );
  const noun = verdicts.length === 1 ? "mandate pin" : "mandate pins";
  return {
    title: `Advance ${verdicts.length} ${noun}?`,
    description:
      `This moves ${verdicts.length} ${noun} from the versions they run now to the newest saved version of their agent — every run of those jobs uses the new version from the moment it lands. ` +
      `${green} ${green === 1 ? "is" : "are"} green or identical; ${anyway} ${anyway === 1 ? "is" : "are"} orange or red and you are choosing to advance ${anyway === 1 ? "it" : "them"} anyway. ` +
      `A pin that moved since this page read it is refused, not overwritten. ${revertWindowSentence(revertWindow)}`,
    moves,
  };
}

/**
 * The undo window, as the dialog names it. The platform default is the
 * `agent_impact.revert_window_hours` knob (72 h on 2026-09-14); an organization
 * may override it, and the server judges every revert against the row's own
 * organization — so the dialog names the platform value and says so, rather
 * than promising a number it did not check per row.
 */
export type RevertWindow =
  | { state: "known"; hours: number }
  | { state: "unknown"; why: string };

export const REVERT_WINDOW_KNOB = {
  feature: "agent_impact",
  key: "revert_window_hours",
} as const;

export async function readRevertWindow(): Promise<RevertWindow> {
  try {
    const hours = await knobInt(REVERT_WINDOW_KNOB.feature, REVERT_WINDOW_KNOB.key);
    return { state: "known", hours };
  } catch (error) {
    return { state: "unknown", why: describeError(error) };
  }
}

export function revertWindowSentence(window: RevertWindow): string {
  if (window.state === "known") {
    return `Undo: each moved pin can be put back for ${window.hours} hours after the move (the platform default; an organization may set its own window, and the server applies the row's own).`;
  }
  return `Undo: each moved pin can be put back within the organization's revert window — this page could not read the platform default (${window.why}), so the server's answer on each revert is the one that counts.`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The consequence sentence a revert states before the click. */
export function describeRevert(
  rows: readonly AdvanceRowResult[],
  scope: "batch" | "row",
  /** The verdicts the advance was made from, so the dialog can name versions. */
  verdictByRung: ReadonlyMap<string, ImpactVerdict>,
): { title: string; description: string; moves: string[] } {
  const noun = rows.length === 1 ? "pin" : "pins";
  return {
    title:
      scope === "batch"
        ? `Put ${rows.length} ${noun} back?`
        : `Put ${rows[0]?.mandate_key ?? "this pin"} back?`,
    description:
      `This moves ${rows.length} ${noun} back to the version${rows.length === 1 ? "" : "s"} recorded before the advance — every run of ${rows.length === 1 ? "that job" : "those jobs"} uses the older version again from the moment it lands. ` +
      `A pin that moved again since the advance, or whose revert window has passed, is refused with the reason, not forced.`,
    moves: rows.map((row) => {
      const verdict = verdictByRung.get(rungIdentityOf(row.token));
      const from = verdict ? versionLabel(verdict.latest_version_number) : "the advanced version";
      const to = verdict
        ? versionLabel(verdict.pinned_version_number)
        : row.prior_pinned_version_id
          ? "the prior pinned version"
          : "tracking latest (no pin)";
      return `${row.mandate_key ?? row.token.row_id}: ${from} → ${to}`;
    }),
  };
}
