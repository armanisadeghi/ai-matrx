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
import { resolveSessionKnob } from "@/lib/scoped-config/sessionKnob";

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

/**
 * THE RULES, by grade — the server's `ImpactRuleId` set (CONTRACT.md) with a
 * plain sentence each. The legend is DERIVED from this table (D8): a
 * hand-written "Red = variables or context slots" missed that the grader
 * also reds on an action-policy change.
 */
export const IMPACT_RULE_SENTENCES: Record<ImpactGrade, ReadonlyArray<{ ruleId: string; sentence: string }>> = {
  // Grades mirror aidream/services/agent_impact/rules.py (2026-09-14). The
  // guard for this table is the rules file itself: a rule that moves grade
  // moves here in the same change.
  red: [
    { ruleId: "var.added", sentence: "a variable was added" },
    { ruleId: "var.removed", sentence: "a variable was removed" },
    { ruleId: "var.renamed", sentence: "a variable was renamed" },
    { ruleId: "var.required_flipped", sentence: "a variable became required, or stopped being" },
    { ruleId: "var.required_default_changed", sentence: "a required variable's default changed" },
    { ruleId: "slot.added", sentence: "a context slot was added" },
    { ruleId: "slot.removed", sentence: "a context slot was removed" },
    { ruleId: "actions.apply_policy_changed", sentence: "the actions apply policy changed" },
    { ruleId: "actions.allowlist_grew", sentence: "the actions allowlist grew" },
    { ruleId: "schema.root_shape_changed", sentence: "the output schema's root shape changed" },
  ],
  orange: [
    { ruleId: "slot.config_changed", sentence: "a context slot is configured differently" },
    { ruleId: "actions.allowlist_shrank", sentence: "the actions allowlist shrank" },
    { ruleId: "schema.key_removed", sentence: "an output key was removed" },
    { ruleId: "schema.key_newly_required", sentence: "an output key became required" },
    { ruleId: "schema.key_redefined", sentence: "an output key was redefined" },
    { ruleId: "schema.output_kind_changed", sentence: "the output kind changed" },
    { ruleId: "contract.required_output_keys_unsatisfied", sentence: "the newest version no longer produces an output key this job requires" },
    { ruleId: "contract.required_context_policies_unsatisfied", sentence: "the newest version no longer carries a context policy this job requires" },
    { ruleId: "input_kind.changed", sentence: "the input kind changed" },
    { ruleId: "model.provider_changed", sentence: "the model moved to a different provider" },
    { ruleId: "tools.changed", sentence: "the tools it can use changed" },
    { ruleId: "mcp_servers.changed", sentence: "the MCP servers it can reach changed" },
    { ruleId: "custom_tools.changed", sentence: "its custom tools changed" },
    { ruleId: "tool_config.changed", sentence: "how its tools are configured changed" },
    { ruleId: "skill_config.changed", sentence: "the skills it carries changed" },
    { ruleId: "is_active.changed", sentence: "the version this would move to is switched off" },
  ],
  green: [
    { ruleId: "model.changed_same_provider", sentence: "the model changed on the same provider" },
    { ruleId: "prompt.changed", sentence: "the instructions (system prompt) were edited" },
    { ruleId: "schema.additive_only", sentence: "the output schema only gained optional keys" },
    { ruleId: "input_kind.stamped", sentence: "an input kind was stamped where there was none" },
    { ruleId: "metadata.changed", sentence: "metadata changed" },
  ],
  identical: [
    { ruleId: "pin.current", sentence: "nothing that affects a run changed between the pinned version and the newest one" },
  ],
};

/** The legend line for a grade: every rule that reaches it, in words, joined. */
export function gradeRulesSentence(grade: ImpactGrade): string {
  const rules = IMPACT_RULE_SENTENCES[grade];
  if (rules.length === 0) return "";
  return rules.map((rule) => rule.sentence).join("; ") + ".";
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
    meaning: gradeRulesSentence("identical").replace(/^./, (c) => c.toUpperCase()),
    toneClassName: "border-border bg-muted text-muted-foreground",
  },
  green: {
    label: "Green",
    meaning: `Low-risk changes only — ${gradeRulesSentence("green").replace(/\.$/, "")}. Almost never breaks a job.`,
    toneClassName:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  orange: {
    label: "Orange",
    meaning: `Can break whatever reads the result — ${gradeRulesSentence("orange").replace(/\.$/, "")}.`,
    toneClassName:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  red: {
    label: "Red",
    meaning: `The most common way a job breaks — look before you move it: ${gradeRulesSentence("red").replace(/\.$/, "")}.`,
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

export function batchEligibilityOf(
  verdict: ImpactVerdict,
  context: WriteContext = ADMIN_WRITE_CONTEXT,
): BatchEligibility {
  if (verdict.blocker) {
    return {
      batchable: false,
      why: `${BLOCKER_META[verdict.blocker].label}: ${BLOCKER_META[verdict.blocker].remedy}`,
    };
  }
  if (verdict.principal.kind === "user" && !isOwnPin(verdict, context)) {
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
export function isSafeGreen(
  verdict: ImpactVerdict,
  context: WriteContext = ADMIN_WRITE_CONTEXT,
): boolean {
  return (
    batchEligibilityOf(verdict, context).batchable &&
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
  /** Summed across pages and reads, by principal kind. */
  withheldTotal: number;
  withheldGroups: WithheldGroup[];
  /** Exactly one sentence (or none) for the merged counts, in the server's form. */
  withheldSentences: string[];
  agentsExamined: number;
  /** Ids the caller asked about that are not live agents it can read (Amendment 3d). */
  unknownAgentIds: string[];
  /** Exactly one sentence (or none) for the merged ids, in the server's form. */
  unknownSentences: string[];
  /** True when every page was graded against a hypothetical delta (R23). */
  dryRun: boolean;
  computedAt: string;
}

/**
 * The two doors the read has (I1): the super-admin `router` for the console
 * and the batch panel, and the `public_router` every signed-in person may
 * call, which answers only about the mandates THEY can already see (R31).
 * Both run the same grader; only the gate differs.
 */
export type ImpactPosture = "admin" | "mine";

export const IMPACT_READ_PATH: Record<ImpactPosture, "/mandates/impact" | "/mandates/impact/mine"> = {
  admin: "/mandates/impact",
  mine: "/mandates/impact/mine",
};

/**
 * The write doors (I3 admin lane, I12 owner lane). SAME writer on the server;
 * the owner lane moves only the caller's own personal pins and the org rungs
 * of organizations they administer, and refuses everything else with the
 * neutral unreadable sentence — never a pin on someone else's behalf.
 */
export const IMPACT_WRITE_PATH: Record<
  ImpactPosture,
  {
    advance: "/mandates/impact/advance" | "/mandates/impact/advance/mine";
    revert: "/mandates/impact/revert" | "/mandates/impact/revert/mine";
  }
> = {
  admin: { advance: "/mandates/impact/advance", revert: "/mandates/impact/revert" },
  mine: { advance: "/mandates/impact/advance/mine", revert: "/mandates/impact/revert/mine" },
};

/**
 * WHO is looking, for the eligibility rules below. `posture: "mine"` with an
 * `actorUserId` makes that person's OWN personal pins movable (I12 — the
 * owner lane lets the owner act); every other person's pin stays "theirs to
 * advance". The default is the admin lane, where no personal pin batches.
 */
export interface WriteContext {
  posture: ImpactPosture;
  actorUserId: string | null;
}

export const ADMIN_WRITE_CONTEXT: WriteContext = { posture: "admin", actorUserId: null };

/** A personal pin that belongs to the person looking at it. */
export function isOwnPin(verdict: ImpactVerdict, context: WriteContext): boolean {
  return (
    context.posture === "mine" &&
    verdict.principal.kind === "user" &&
    typeof context.actorUserId === "string" &&
    context.actorUserId.length > 0 &&
    verdict.principal.subject_user_id === context.actorUserId
  );
}

export interface FetchImpactOptions {
  /** Which door to read through. Default `admin` — the console and the batch panel. */
  posture?: ImpactPosture;
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
        path: IMPACT_READ_PATH[options.posture ?? "admin"],
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
        `POST ${IMPACT_READ_PATH[options.posture ?? "admin"]} did not return an impact report — the grades are unknown, not clean.`,
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

export interface WithheldGroup {
  principalKind: string;
  count: number;
  /** The server's own explanation for this kind, verbatim. */
  explanation: string;
}

/**
 * ONE sentence for merged withheld counts, in the server's own form
 * ("N rungs withheld: a <explanation>; b <explanation>") built from the
 * server's per-kind explanations. Pages each carry their own sentence with
 * their own numbers; printing those beside a summed total was the
 * "5 rungs withheld — 1 rung withheld… 2 rungs withheld…" screen (D1).
 */
export function withheldSentenceOf(groups: readonly WithheldGroup[]): string | null {
  const count = groups.reduce((sum, group) => sum + group.count, 0);
  if (count === 0) return null;
  return (
    `${count} rung${count === 1 ? "" : "s"} withheld: ` +
    groups.map((group) => `${group.count} ${group.explanation}`).join("; ")
  );
}

/** ONE sentence for merged unknown ids, in the server's own form (Amendment 3d). */
export function unknownSentenceOf(ids: readonly string[]): string | null {
  if (ids.length === 0) return null;
  const many = ids.length !== 1;
  return (
    `${ids.length} of the agent ids you sent ${many ? "are" : "is"} not ` +
    `${many ? "agents" : "an agent"} you can see — ${many ? "they were" : "it was"} ` +
    `mistyped, deleted, or not shared with you, so ${many ? "they are" : "it is"} ` +
    `not counted as having no impact: ${ids.join(", ")}`
  );
}

function mergeWithheldGroups(
  parts: ReadonlyArray<readonly WithheldGroup[]>,
): WithheldGroup[] {
  const byKind = new Map<string, WithheldGroup>();
  for (const groups of parts) {
    for (const group of groups) {
      const hit = byKind.get(group.principalKind);
      if (hit) hit.count += group.count;
      else byKind.set(group.principalKind, { ...group });
    }
  }
  return Array.from(byKind.values()).sort((a, b) =>
    a.principalKind.localeCompare(b.principalKind),
  );
}

/** Sum a set of page reports into one — exported so a test can prove the arithmetic. */
export function mergeImpactReports(
  reports: readonly ImpactReport[],
): StandingImpact {
  const unknownAgentIds = new Set<string>();
  const groupParts: WithheldGroup[][] = [];
  let agentsExamined = 0;
  let computedAt = "";
  let dryRun = reports.length > 0;
  const verdicts: ImpactVerdict[] = [];
  for (const report of reports) {
    verdicts.push(...(report.verdicts ?? []));
    groupParts.push(
      (report.withheld?.by_principal_kind ?? []).map((group) => ({
        principalKind: group.principal_kind,
        count: group.count,
        explanation: group.explanation,
      })),
    );
    for (const id of report.unknown_agent_ids ?? []) unknownAgentIds.add(id);
    agentsExamined += report.agents_examined ?? 0;
    if (report.computed_at > computedAt) computedAt = report.computed_at;
    if (report.dry_run !== true) dryRun = false;
  }
  const withheldGroups = mergeWithheldGroups(groupParts);
  const withheldSentence = withheldSentenceOf(withheldGroups);
  const unknownIds = Array.from(unknownAgentIds);
  const unknownSentence = unknownSentenceOf(unknownIds);
  return {
    verdicts,
    withheldTotal: withheldGroups.reduce((sum, group) => sum + group.count, 0),
    withheldGroups,
    withheldSentences: withheldSentence ? [withheldSentence] : [],
    agentsExamined,
    unknownAgentIds: unknownIds,
    unknownSentences: unknownSentence ? [unknownSentence] : [],
    dryRun,
    computedAt,
  };
}

/** Sum several already-merged reads (a dry run with one delta per model). */
export function mergeStandingImpacts(
  parts: readonly StandingImpact[],
): StandingImpact {
  const withheldGroups = mergeWithheldGroups(parts.map((part) => part.withheldGroups));
  const withheldSentence = withheldSentenceOf(withheldGroups);
  const unknownIds = Array.from(new Set(parts.flatMap((part) => part.unknownAgentIds)));
  const unknownSentence = unknownSentenceOf(unknownIds);
  return {
    verdicts: parts.flatMap((part) => part.verdicts),
    withheldTotal: withheldGroups.reduce((sum, group) => sum + group.count, 0),
    withheldGroups,
    withheldSentences: withheldSentence ? [withheldSentence] : [],
    agentsExamined: parts.reduce((sum, part) => sum + part.agentsExamined, 0),
    unknownAgentIds: unknownIds,
    unknownSentences: unknownSentence ? [unknownSentence] : [],
    dryRun: parts.length > 0 && parts.every((part) => part.dryRun),
    computedAt: parts.reduce((max, part) => (part.computedAt > max ? part.computedAt : max), ""),
  };
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
  posture: ImpactPosture = "admin",
): Promise<AdvanceReport> {
  const response = await dispatch(
    callApi({
      path: IMPACT_WRITE_PATH[posture].advance,
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
  posture: ImpactPosture = "admin",
): Promise<AdvanceReport> {
  const response = await dispatch(
    callApi({
      path: IMPACT_WRITE_PATH[posture].revert,
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

/**
 * The rows of a batch that actually moved and can therefore be put back —
 * MINUS any row a later revert (in `laterReports`) already put back, so a
 * "Revert (N)" never promises a row the server will refuse as already
 * reverted (D5).
 */
export function revertableRows(
  report: AdvanceReport,
  laterReports: readonly AdvanceReport[] = [],
): AdvanceRowResult[] {
  const alreadyReverted = new Set<string>();
  for (const later of laterReports) {
    if (later.action !== "revert" || later.reverts_batch_id !== report.batch_id) continue;
    for (const row of later.results ?? []) {
      if (row.status === "reverted") alreadyReverted.add(rungIdentityOf(row.token));
    }
  }
  return (report.results ?? []).filter(
    (row) => row.status === "advanced" && !alreadyReverted.has(rungIdentityOf(row.token)),
  );
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

export function batchTierOf(
  verdict: ImpactVerdict,
  options: { dryRun?: boolean; context?: WriteContext } = {},
): BatchTier {
  const context = options.context ?? ADMIN_WRITE_CONTEXT;
  if (verdict.blocker) return "blocked";
  if (verdict.principal.kind === "user" && !isOwnPin(verdict, context)) return "blocked";
  // A DRY RUN grades pinned → pinned ∪ delta (R23): its "latest" is the
  // hypothetical, its token has no target, and pin-vs-newest means nothing.
  // The pile comes from the grade alone; "current" is a post-write answer.
  if (!options.dryRun) {
    const eligibility = batchEligibilityOf(verdict, context);
    if (!eligibility.batchable && !isBehindLatest(verdict)) return "current";
  }
  if (verdict.grade === "red") return "red";
  if (verdict.grade === "orange") return "drift";
  if (settingsSignalOf(verdict).state !== "clean") return "drift";
  return "safe";
}

/** A row a person may move from the batch panel — safe, drift or red, never blocked/current. */
export function isBatchActionable(
  verdict: ImpactVerdict,
  context: WriteContext = ADMIN_WRITE_CONTEXT,
): boolean {
  const tier = batchTierOf(verdict, { context });
  return (
    (tier === "safe" || tier === "drift" || tier === "red") &&
    batchEligibilityOf(verdict, context).batchable
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
  options: { dryRun?: boolean; context?: WriteContext } = {},
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
    byTier[batchTierOf(verdict, options)] += 1;
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

/**
 * The post-edit badge's sentence (I6). ACTIONABLE FIRST, then the reach —
 * the Renovate/Dependabot reference: a notification leads with what the
 * person can do now, and the blast radius follows. "4 pins can advance now
 * (1 to check, 2 red) · reaches 26 mandates, 39 rungs not movable here".
 * The not-movable count stays visible (R31): a rung the edit reaches but
 * this person cannot move is still reached.
 */
export function describeReach(counts: BatchTierCounts): string {
  const safe = counts.byTier.safe;
  const head = `${safe} pin${safe === 1 ? "" : "s"} can advance now (${counts.byTier.drift} to check, ${counts.byTier.red} red)`;
  const reach = `reaches ${counts.mandates} mandate${counts.mandates === 1 ? "" : "s"}`;
  const tail: string[] = [];
  if (counts.byTier.blocked > 0) {
    tail.push(`${counts.byTier.blocked} rung${counts.byTier.blocked === 1 ? "" : "s"} not movable here`);
  }
  if (counts.byTier.current > 0) tail.push(`${counts.byTier.current} already current`);
  return `${head} · ${reach}${tail.length > 0 ? `, ${tail.join(", ")}` : ""}`;
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

/**
 * A bare number → "vN"; null → "latest". Use ONLY where null genuinely means
 * "no pin" (a rung that tracks latest). For a verdict, use the two helpers
 * below: the server returns null version NUMBERS on some blocked rungs
 * (set_aside) even though the rung IS pinned, and printing "latest" there
 * was a screen lie (D3).
 */
export function versionLabel(number: number | null | undefined): string {
  return number == null ? "latest" : `v${number}`;
}

/** The pinned side of a verdict: "vN", "latest" only when the rung tracks latest, else "unknown". */
export function pinnedLabelOf(verdict: ImpactVerdict): string {
  if (verdict.pinned_version_number != null) return `v${verdict.pinned_version_number}`;
  if (verdict.blocker === "tracks_latest") return "latest";
  if (verdict.pinned_version_id || verdict.apply_token.expected_pinned_version_id) {
    return "pinned (version unknown)";
  }
  return "latest";
}

/** The newest side of a verdict: "vN", or "unknown" when the read named none (never "latest"). */
export function newestLabelOf(verdict: ImpactVerdict): string {
  if (verdict.latest_version_number != null) return `v${verdict.latest_version_number}`;
  if (verdict.blocker === "unreachable") return "no saved version";
  return "unknown";
}

/** "vA → vB" for a verdict, with both sides honest. */
export function versionsLabelOf(verdict: ImpactVerdict): string {
  return `${pinnedLabelOf(verdict)} → ${newestLabelOf(verdict)}`;
}

/** The rung, for a person: "" for the mandate's own default, " (org binding)" for a binding. */
export function rungSuffixOf(verdict: Pick<ImpactVerdict, "holder_kind" | "principal">): string {
  return verdict.holder_kind === "binding" ? ` (${verdict.principal.kind} binding)` : "";
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
  // Three lines, never two: a green row whose SETTINGS check found something
  // (the drift pile) is not "green or identical" to a person — it was chosen
  // despite a warning too (D7).
  let clean = 0;
  let settingsWarned = 0;
  let graded = 0;
  for (const v of verdicts) {
    if (v.grade === "orange" || v.grade === "red") graded += 1;
    else if (settingsSignalOf(v).state !== "clean") settingsWarned += 1;
    else clean += 1;
  }
  const moves = verdicts.map((v) => {
    const settings = settingsSignalOf(v);
    const flag =
      settings.state === "unmeasured"
        ? " · settings unmeasured"
        : settings.state === "changed"
          ? " · settings changed"
          : "";
    return `${v.mandate_key}${rungSuffixOf(v)}: ${v.agent_name} ${versionsLabelOf(v)} · ${GRADE_META[v.grade].label}${flag}`;
  });
  const n = verdicts.length;
  const one = n === 1;
  const noun = one ? "mandate pin" : "mandate pins";
  const parts: string[] = [];
  if (clean > 0) parts.push(`${clean} ${clean === 1 ? "is" : "are"} green or identical with a clean settings check`);
  if (settingsWarned > 0) {
    parts.push(
      `${settingsWarned} ${settingsWarned === 1 ? "is" : "are"} low-risk but the settings check found something (or could not run) and you are choosing to advance ${settingsWarned === 1 ? "it" : "them"} anyway`,
    );
  }
  if (graded > 0) {
    parts.push(
      `${graded} ${graded === 1 ? "is" : "are"} orange or red and you are choosing to advance ${graded === 1 ? "it" : "them"} anyway`,
    );
  }
  return {
    title: `Advance ${n} ${noun}?`,
    description:
      (one
        ? `This moves 1 mandate pin from the version it runs now to the newest saved version of its agent — every run of that job uses the new version from the moment it lands. `
        : `This moves ${n} mandate pins from the versions they run now to the newest saved version of their agent — every run of those jobs uses the new version from the moment it lands. `) +
      `${parts.join("; ")}. ` +
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

/**
 * Whether the post-edit badge (I6) also OPENS the panel by itself. An
 * organization knob, default off — a save is the person's moment, and a
 * window that jumps on every save is the interruption Arman said he does
 * not want; the badge and the toast's "Review" door are always there. Read
 * through THE settings ladder (organization → user → device), never a
 * constant: `agent_impact.post_edit_auto_open`, seeded by
 * `migrations/agent_change_impact_06_post_edit_auto_open_knob.sql`.
 */
export const POST_EDIT_AUTO_OPEN_KNOB = "agent_impact.post_edit_auto_open";

export type PostEditAutoOpen =
  | { state: "known"; value: boolean }
  | { state: "unknown"; why: string };

export async function readPostEditAutoOpen(): Promise<PostEditAutoOpen> {
  try {
    const value = await resolveSessionKnob(POST_EDIT_AUTO_OPEN_KNOB);
    if (value === undefined) {
      return { state: "unknown", why: "no organization is active in this session" };
    }
    return { state: "known", value: value === true || value === "true" };
  } catch (error) {
    return { state: "unknown", why: describeError(error) };
  }
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
      const from = verdict ? newestLabelOf(verdict) : "the advanced version";
      const to = verdict
        ? pinnedLabelOf(verdict)
        : row.prior_pinned_version_id
          ? "the prior pinned version"
          : "tracking latest (no pin)";
      const rung = verdict
        ? rungSuffixOf(verdict)
        : row.token.holder_kind === "binding"
          ? " (binding)"
          : "";
      return `${row.mandate_key ?? row.token.row_id}${rung}: ${from} → ${to}`;
    }),
  };
}
