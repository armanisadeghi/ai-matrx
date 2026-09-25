// features/mandates/dashboard/metrics.ts
//
// The mandate dashboard's numbers, computed from the four real reads and
// nothing else. Pure and total: every function takes a payload that may be
// absent and answers `null` (not measured) rather than 0.
//
// Sources (each is the server's or the database's own classification — this
// module counts, it never re-judges):
//   console   fetchMandateConsoleData({ home: SYSTEM_HOME }) — mandate.definition + mandate.binding
//   coverage  GET /mandates/coverage                         — green / orange / red
//   truth     GET /mandates/code-truth                        — code ↔ DB drift counts
//   board     GET /mandates/references/board                  — scan freshness, findings, conversion list

import { unmetContractChecks } from "@/features/mandates/contract-check";
import { featureLabelOf } from "@/features/mandates/admin-list/rows";
import {
  buildCoverageIndex,
  scopedCoverageOf,
  type MandateCoverageBucket,
  type MandateCoverageResponse,
} from "@/features/mandates/coverage";
import type {
  MandateCodeTruthReport,
  MandateConsoleData,
} from "@/features/mandates/admin/service";
import type { MandateReferenceBoard } from "@/features/mandates/admin/references";
import type { WorkflowImpactReport } from "@/features/mandates/admin/workflow-impact";

export interface FeatureCount {
  feature: string;
  total: number;
  codeBacked: number;
}

export interface DefinitionMetrics {
  total: number;
  codeBacked: number;
  soft: number;
  disabled: number;
  features: FeatureCount[];
  workflowHeld: number;
  /** Default holders pinned to a version vs following latest. */
  defaultsPinned: number;
  defaultsLatest: number;
  defaultsNone: number;
}

export interface BindingMetrics {
  total: number;
  pinned: number;
  latest: number;
  org: number;
  orgMandates: number;
  orgCount: number;
  personal: number;
  personalMandates: number;
  personalUsers: number;
  disabled: number;
}

/**
 * Every section counts the SAME corpus the list's System tab shows (the
 * console's `system` home) — never the server's whole-registry totals, so a
 * tile and the filtered list behind it always agree.
 */
export function systemKeys(data: MandateConsoleData | null): string[] | null {
  return data ? data.mandates.map((row) => row.mandate_key) : null;
}

export function definitionMetrics(
  data: MandateConsoleData | null,
  truth: MandateCodeTruthReport | null,
): DefinitionMetrics | null {
  if (!data) return null;
  const moduleByKey = new Map<string, string | undefined>();
  for (const item of truth?.mandates ?? []) {
    moduleByKey.set(item.mandate_key, item.source?.module);
  }
  const byFeature = new Map<string, FeatureCount>();
  let codeBacked = 0;
  let disabled = 0;
  let workflowHeld = 0;
  let defaultsPinned = 0;
  let defaultsLatest = 0;
  let defaultsNone = 0;
  for (const row of data.mandates) {
    const isCode = row.origin === "code";
    if (isCode) codeBacked += 1;
    if (!row.is_enabled) disabled += 1;
    if (row.default_holder_type === "workflow") workflowHeld += 1;
    if (!row.default_holder_id) defaultsNone += 1;
    else if (row.default_holder_version_id) defaultsPinned += 1;
    else defaultsLatest += 1;
    // The list's own Feature label, so a feature row filters to exactly its rows.
    const feature = featureLabelOf(row.mandate_key, moduleByKey.get(row.mandate_key));
    const entry = byFeature.get(feature) ?? { feature, total: 0, codeBacked: 0 };
    entry.total += 1;
    if (isCode) entry.codeBacked += 1;
    byFeature.set(feature, entry);
  }
  const features = [...byFeature.values()].sort(
    (a, b) => b.total - a.total || a.feature.localeCompare(b.feature),
  );
  return {
    total: data.mandates.length,
    codeBacked,
    soft: data.mandates.length - codeBacked,
    disabled,
    features,
    workflowHeld,
    defaultsPinned,
    defaultsLatest,
    defaultsNone,
  };
}

export function bindingMetrics(
  data: MandateConsoleData | null,
): BindingMetrics | null {
  if (!data) return null;
  const rows = Object.values(data.bindingsByMandateId).flat();
  const orgMandates = new Set<string>();
  const orgs = new Set<string>();
  const personalMandates = new Set<string>();
  const users = new Set<string>();
  let pinned = 0;
  let org = 0;
  let personal = 0;
  let disabled = 0;
  for (const row of rows) {
    if (row.holder_version_id) pinned += 1;
    if (!row.is_enabled) disabled += 1;
    if (row.principal_type === "org") {
      org += 1;
      orgMandates.add(row.mandate_id);
      orgs.add(row.organization_id);
    } else if (row.principal_type === "user") {
      personal += 1;
      personalMandates.add(row.mandate_id);
      if (row.subject_user_id) users.add(row.subject_user_id);
    }
  }
  return {
    total: rows.length,
    pinned,
    latest: rows.length - pinned,
    org,
    orgMandates: orgMandates.size,
    orgCount: orgs.size,
    personal,
    personalMandates: personalMandates.size,
    personalUsers: users.size,
    disabled,
  };
}

export interface DriftMetrics {
  total: number;
  /**
   * Code-backed mandates only. A soft mandate has no code declaration, so its
   * "match" (empty inputs vs empty inputs) says nothing about code and DB
   * agreeing — counting it made the tile read "469 of 469" over a registry
   * where most jobs have no code at all.
   */
  codeBacked: number;
  /** Code-backed mandates whose code and DB inputs agree. */
  match: number;
  /** Code-backed mandates whose code and DB inputs differ. */
  diff: number;
  codeOnly: number;
  dbOnly: number;
  undelivered: number;
  spilled: number;
  importFailed: number;
}

/** Keys whose definition is declared in code (`origin === "code"`). */
export function codeBackedKeys(data: MandateConsoleData | null): string[] | null {
  return data
    ? data.mandates.filter((row) => row.origin === "code").map((row) => row.mandate_key)
    : null;
}

export function driftMetrics(
  report: MandateCodeTruthReport | null,
  keys: readonly string[] | null,
  codeKeys: readonly string[] | null,
): DriftMetrics | null {
  if (!report || !keys || !codeKeys) return null;
  const wanted = new Set(keys);
  const code = new Set(codeKeys);
  const out: DriftMetrics = {
    total: 0,
    codeBacked: 0,
    match: 0,
    diff: 0,
    codeOnly: 0,
    dbOnly: 0,
    undelivered: 0,
    spilled: 0,
    importFailed: 0,
  };
  for (const item of report.mandates) {
    if (!wanted.has(item.mandate_key)) continue;
    out.total += 1;
    const isCode = code.has(item.mandate_key);
    if (isCode) out.codeBacked += 1;
    if (item.drift === "match") {
      if (isCode) out.match += 1;
    } else if (item.drift === "diff") {
      if (isCode) out.diff += 1;
    } else if (item.drift === "code_only") out.codeOnly += 1;
    else if (item.drift === "db_only") out.dbOnly += 1;
    if (item.resolution === "code_exists_but_import_failed") out.importFailed += 1;
    const spilled = new Set(item.bound_agent_spilled_variables ?? []);
    if (spilled.size > 0) out.spilled += 1;
    if ((item.bound_agent_missing_variables ?? []).some((name) => !spilled.has(name))) {
      out.undelivered += 1;
    }
  }
  return out;
}

export interface ScanMetrics {
  repos: number;
  unverified: number;
  /** Newest complete candidate scan across every repo, ISO. */
  lastCompleteScanAt: string | null;
  openFindings: number;
  /** On the conversion list (flag conversion_pending). */
  conversion: number;
  /** EVERY AI call outside a mandate — the Unconverted page's total.
   * `null` = a server too old to report it; never stood in for by `conversion`. */
  bypass: number | null;
  patrolEnabled: boolean | null;
  patrolLastRunAt: string | null;
  patrolNextDueAt: string | null;
  /** Lifetime history — never the headline (a fixed outage reads as current). */
  patrolRunsFailed: number | null;
  patrolRunsCounted: number | null;
  /** RECENT HEALTH, the headline: the last N finished runs. */
  patrolRecentFailed: number | null;
  patrolRecentCounted: number | null;
  /** Consecutive failures ending at the newest finished run (0 = healthy now). */
  patrolFailingStreak: number | null;
  patrolLastSuccessAt: string | null;
}

export function scanMetrics(
  board: MandateReferenceBoard | null,
): ScanMetrics | null {
  if (!board) return null;
  let newest: string | null = null;
  for (const repo of board.repos) {
    const at = repo.last_complete_candidate?.scanned_at ?? null;
    if (at && (!newest || at > newest)) newest = at;
  }
  const patrol = board.patrol ?? null;
  return {
    repos: board.repos.length,
    unverified: board.unverified_repos.length,
    lastCompleteScanAt: newest,
    openFindings: board.open_finding_count,
    conversion: board.conversion_count,
    bypass: board.bypass_count ?? null,
    patrolEnabled: patrol ? patrol.enabled && patrol.trigger_enabled : null,
    patrolLastRunAt: patrol?.last_run_at ?? null,
    patrolNextDueAt: patrol?.next_due_at ?? null,
    patrolRunsFailed: patrol?.runs_failed ?? null,
    patrolRunsCounted: patrol?.runs_counted ?? null,
    patrolRecentFailed: patrol?.recent_runs_failed ?? null,
    patrolRecentCounted: patrol?.recent_runs_counted ?? null,
    patrolFailingStreak: patrol?.failing_streak ?? null,
    patrolLastSuccessAt: patrol?.last_success_at ?? null,
  };
}

export function coverageCounts(
  coverage: MandateCoverageResponse | null,
  keys: readonly string[] | null,
): Record<MandateCoverageBucket, number> | null {
  if (!coverage || !keys) return null;
  return scopedCoverageOf(buildCoverageIndex(coverage), keys).counts;
}

/**
 * 🚨 JOBS WITH A HOLDER SAVED RED — the default or any binding whose contract
 * check the server persisted as `unmet` (Arman, 2026-09-25: a mismatch saves,
 * and is never quiet). `null` = the console read has not landed.
 */
export function contractMismatchKeys(
  data: MandateConsoleData | null,
): string[] | null {
  if (!data) return null;
  return data.mandates
    .filter(
      (mandate) =>
        unmetContractChecks(mandate, data.bindingsByMandateId[mandate.id] ?? [])
          .length > 0,
    )
    .map((mandate) => mandate.mandate_key)
    .sort();
}

export interface WorkflowGradeMetrics {
  rungs: number;
  workflows: number;
  contractBroken: number;
  behindLatest: number;
  /** Rungs graded red — the newest version would break the mandate's callers. */
  breaking: number;
  blocked: number;
  withheld: number;
  withheldSentence: string | null;
}

/** The workflow twin of the agent grades (POST /mandates/impact/workflows). */
export function workflowGradeMetrics(
  report: WorkflowImpactReport | null,
): WorkflowGradeMetrics | null {
  if (!report) return null;
  const count = (test: (v: WorkflowImpactReport["verdicts"][number]) => boolean) =>
    report.verdicts.filter(test).length;
  return {
    rungs: report.verdicts.length,
    workflows: report.workflows_examined,
    contractBroken: count((v) => v.contract_broken),
    behindLatest: count((v) => v.behind_latest),
    breaking: count((v) => v.grade === "red"),
    blocked: count((v) => v.blocker !== null),
    withheld: report.withheld.total,
    withheldSentence: report.withheld.sentence,
  };
}
