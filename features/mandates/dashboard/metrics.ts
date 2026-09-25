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

import { splitMandateKey } from "@/features/mandates/mandate-key";
import type { MandateCoverageResponse } from "@/features/mandates/coverage";
import type {
  MandateCodeTruthReport,
  MandateConsoleData,
} from "@/features/mandates/admin/service";
import type { MandateReferenceBoard } from "@/features/mandates/admin/references";

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
  global: number;
  disabled: number;
}

export function definitionMetrics(
  data: MandateConsoleData | null,
): DefinitionMetrics | null {
  if (!data) return null;
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
    const { feature } = splitMandateKey(row.mandate_key);
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
  let global = 0;
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
    } else if (row.principal_type === "global") {
      global += 1;
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
    global,
    disabled,
  };
}

export interface DriftMetrics {
  total: number;
  match: number;
  diff: number;
  codeOnly: number;
  dbOnly: number;
  undelivered: number;
  spilled: number;
  importFailed: number;
}

export function driftMetrics(
  report: MandateCodeTruthReport | null,
): DriftMetrics | null {
  if (!report) return null;
  const c = report.counts;
  const n = (key: string) => c[key] ?? 0;
  return {
    total: n("total"),
    match: n("match"),
    diff: n("diff"),
    codeOnly: n("code_only"),
    dbOnly: n("db_only"),
    undelivered: n("bound_agent_undelivered"),
    spilled: n("bound_agent_spilled"),
    importFailed: n("import_failed"),
  };
}

export interface ScanMetrics {
  repos: number;
  unverified: number;
  /** Newest complete candidate scan across every repo, ISO. */
  lastCompleteScanAt: string | null;
  openFindings: number;
  conversion: number;
  patrolEnabled: boolean | null;
  patrolLastRunAt: string | null;
  patrolNextDueAt: string | null;
  patrolRunsFailed: number | null;
  patrolRunsCounted: number | null;
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
    patrolEnabled: patrol ? patrol.enabled && patrol.trigger_enabled : null,
    patrolLastRunAt: patrol?.last_run_at ?? null,
    patrolNextDueAt: patrol?.next_due_at ?? null,
    patrolRunsFailed: patrol?.runs_failed ?? null,
    patrolRunsCounted: patrol?.runs_counted ?? null,
  };
}

export function coverageCounts(
  coverage: MandateCoverageResponse | null,
): MandateCoverageResponse["counts"] | null {
  return coverage?.counts ?? null;
}
