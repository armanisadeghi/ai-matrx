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
// Amendments 1 and 2 — `global` principals, `tracks_latest`, the envelope).

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import type { components } from "@/types/python-generated/api-types";

export type ImpactReport = components["schemas"]["ImpactReport"];
export type ImpactVerdict = components["schemas"]["ImpactVerdict"];
export type ImpactFinding = components["schemas"]["ImpactFinding"];
export type ImpactWithheld = components["schemas"]["ImpactWithheld"];
export type ApplyToken = components["schemas"]["ApplyToken"];
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
  computedAt: string;
}

/**
 * Grade every rung the named agents hold, directly. Descendants are OFF: the
 * console passes every holder agent it lists, so walking descendants would
 * return the same rung twice under two lineage paths.
 */
export async function fetchStandingImpact(
  dispatch: AppDispatch,
  agentIds: readonly string[],
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
          body: { agent_ids: page, include_descendants: false },
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
  const sentences = new Set<string>();
  let withheldTotal = 0;
  let agentsExamined = 0;
  let computedAt = "";
  const verdicts: ImpactVerdict[] = [];
  for (const report of reports) {
    verdicts.push(...(report.verdicts ?? []));
    withheldTotal += report.withheld?.total ?? 0;
    if (report.withheld?.sentence && (report.withheld.total ?? 0) > 0) {
      sentences.add(report.withheld.sentence);
    }
    agentsExamined += report.agents_examined ?? 0;
    if (report.computed_at > computedAt) computedAt = report.computed_at;
  }
  return {
    verdicts,
    withheldTotal,
    withheldSentences: Array.from(sentences),
    agentsExamined,
    computedAt,
  };
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
      `A pin that moved since this page read it is refused, not overwritten. Each moved pin can be reverted within your organization's revert window.`,
    moves,
  };
}
