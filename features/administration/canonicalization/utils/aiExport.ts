/**
 * Canonicalization toolkit — human summaries + agent-copy payloads.
 *
 * Mirrors the error-inspector pattern (`lib/diagnostics/buildCapturedErrorPayload.ts`):
 * one serializer module consumed by `<CopyButtons>` / `buildAgentPayload`, not
 * hand-rolled xml at callsites. CSV export stays for spreadsheets; these
 * payloads are for AI agents fixing gate failures, broken functions, and
 * migration backlog rows.
 */

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type {
  AuditSummaryRow,
  BrokenFunctionRow,
  CanonicalCertifyRow,
  CanonicalFindingRow,
  CanonicalizationOverview,
  FunctionDepRow,
  M2mCandidateRow,
  StaleRegistryRow,
  TableImpactRow,
  UnregisteredCandidateRow,
  VerifyCanonicalRow,
} from "../types";

/** Config consumed by AdminAuditTable to render Copy + Copy for AI. */
export interface AuditTableCopyForAi<T> {
  /** Per-row toast/tooltip label base */
  label: string;
  /** Whole-table toast/tooltip label */
  listLabel: string;
  location: string;
  rowKind: string;
  listKind: string;
  rowDescription: string;
  listDescription: string;
  humanRow: (row: T) => string;
  rowAttributes?: (
    row: T,
  ) => Record<string, string | number | boolean | null | undefined>;
  listAttributes?: (
    visible: T[],
    all: T[],
  ) => Record<string, string | number | boolean | null | undefined>;
}

const BASE = "AI Matrx Admin — Canonicalization Toolkit";

export function canonicalRouteLocation(route: string): string {
  return `${BASE} (${route})`;
}

// ─── Summary ─────────────────────────────────────────────────────────────

export function auditSummaryToHuman(row: AuditSummaryRow): string {
  return [
    `Table: ${row.schema_name}.${row.table_name}`,
    `Token: ${row.token}`,
    `Gate: ${row.fails} FAIL · ${row.warns} WARN`,
    `Certified: ${row.certified ? "yes" : "no"}`,
  ].join("\n");
}

export const SUMMARY_TABLE_COPY: AuditTableCopyForAi<AuditSummaryRow> = {
  label: "Summary row",
  listLabel: "Summary table",
  location: canonicalRouteLocation("/administration/database/canonicalization/summary"),
  rowKind: "canonicalization-summary-row",
  listKind: "canonicalization-summary-rows",
  rowDescription: "One registered table row from audit.summary.",
  listDescription:
    "All registered tables from audit.summary (visible rows after filters).",
  humanRow: auditSummaryToHuman,
  rowAttributes: (r) => ({
    schema: r.schema_name,
    table: r.table_name,
    token: r.token,
    certified: r.certified,
  }),
  listAttributes: (visible, all) => ({
    count: visible.length,
    total: all.length,
  }),
};

// ─── Findings ────────────────────────────────────────────────────────────

export function canonicalFindingToHuman(row: CanonicalFindingRow): string {
  const where =
    row.schema_name && row.table_name
      ? `${row.schema_name}.${row.table_name}`
      : "(unknown table)";
  return [
    `${row.status ?? "?"} · ${row.check_name ?? "check"}`,
    `Table: ${where}`,
    row.token ? `Token: ${row.token}` : null,
    row.source ? `Source: ${row.source}` : null,
    row.detail ? `Detail: ${row.detail}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const FINDINGS_TABLE_COPY: AuditTableCopyForAi<CanonicalFindingRow> = {
  label: "Finding",
  listLabel: "Findings",
  location: canonicalRouteLocation("/administration/database/canonicalization/findings"),
  rowKind: "canonicalization-finding",
  listKind: "canonicalization-findings",
  rowDescription: "One gate finding (FAIL/WARN) from audit.findings.",
  listDescription: "Gate findings visible after filters.",
  humanRow: canonicalFindingToHuman,
  rowAttributes: (r) => ({
    status: r.status,
    check: r.check_name,
    schema: r.schema_name,
    table: r.table_name,
  }),
  listAttributes: (visible, all) => ({
    count: visible.length,
    total: all.length,
  }),
};

// ─── Broken functions ────────────────────────────────────────────────────

export function brokenFunctionToHuman(row: BrokenFunctionRow): string {
  return [
    `Function: ${row.schema_name ?? "?"}.${row.function_name ?? "?"}`,
    row.signature ? `Signature: ${row.signature}` : null,
    row.lineno != null ? `Line: ${row.lineno}` : null,
    row.level ? `Level: ${row.level}` : null,
    row.sqlstate ? `SQLSTATE: ${row.sqlstate}` : null,
    row.message ? `Message: ${row.message}` : null,
    row.context ? `Context: ${row.context}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const BROKEN_FUNCTIONS_TABLE_COPY: AuditTableCopyForAi<BrokenFunctionRow> =
  {
    label: "Broken function",
    listLabel: "Broken functions",
    location: canonicalRouteLocation(
      "/administration/database/canonicalization/broken-functions",
    ),
    rowKind: "canonicalization-broken-function",
    listKind: "canonicalization-broken-functions",
    rowDescription: "One plpgsql_check failure from audit.broken_functions.",
    listDescription: "Broken functions visible after filters.",
    humanRow: brokenFunctionToHuman,
    rowAttributes: (r) => ({
      schema: r.schema_name,
      function: r.function_name,
      level: r.level,
    }),
    listAttributes: (visible, all) => ({
      count: visible.length,
      total: all.length,
    }),
  };

// ─── Function deps ───────────────────────────────────────────────────────

export function functionDepToHuman(row: FunctionDepRow): string {
  return [
    `Function: ${row.function_schema ?? "?"}.${row.function_name ?? "?"}`,
    row.signature ? `Signature: ${row.signature}` : null,
    `Dependency (${row.dep_type ?? "?"}): ${row.dep_schema ?? "?"}.${row.dep_name ?? "?"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const FUNCTION_DEPS_TABLE_COPY: AuditTableCopyForAi<FunctionDepRow> = {
  label: "Function dependency",
  listLabel: "Function dependencies",
  location: canonicalRouteLocation(
    "/administration/database/canonicalization/function-deps",
  ),
  rowKind: "canonicalization-function-dep",
  listKind: "canonicalization-function-deps",
  rowDescription: "One function dependency edge from audit.function_deps.",
  listDescription: "Function dependency edges visible after filters.",
  humanRow: functionDepToHuman,
  rowAttributes: (r) => ({
    function: r.function_name,
    dep_type: r.dep_type,
    dep: r.dep_name,
  }),
  listAttributes: (visible, all) => ({
    count: visible.length,
    total: all.length,
  }),
};

// ─── Candidates ──────────────────────────────────────────────────────────

export function m2mCandidateToHuman(row: M2mCandidateRow): string {
  return [
    `Table: ${row.schema_name ?? "?"}.${row.table_name ?? "?"}`,
    `Registered: ${row.registered ? "yes" : "no"}`,
    `Entity FKs: ${row.entity_fk_count ?? "—"}`,
    row.fk_targets ? `FK targets: ${row.fk_targets}` : null,
    `Payload cols: ${row.payload_cols ?? "—"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const M2M_CANDIDATES_TABLE_COPY: AuditTableCopyForAi<M2mCandidateRow> = {
  label: "M2M candidate",
  listLabel: "M2M candidates",
  location: canonicalRouteLocation(
    "/administration/database/canonicalization/candidates",
  ),
  rowKind: "canonicalization-m2m-candidate",
  listKind: "canonicalization-m2m-candidates",
  rowDescription: "One M2M migration candidate from audit.m2m_candidates.",
  listDescription: "M2M candidates visible after filters.",
  humanRow: m2mCandidateToHuman,
  rowAttributes: (r) => ({
    schema: r.schema_name,
    table: r.table_name,
    registered: r.registered,
  }),
  listAttributes: (visible, all) => ({
    count: visible.length,
    total: all.length,
  }),
};

export function unregisteredCandidateToHuman(
  row: UnregisteredCandidateRow,
): string {
  return [
    `Table: ${row.schema_name ?? "?"}.${row.table_name ?? "?"}`,
    `Base col score: ${row.base_col_score ?? "—"}`,
    `Has id uuid: ${row.has_id_uuid ? "yes" : "no"}`,
    `Has created_at: ${row.has_created_at ? "yes" : "no"}`,
  ].join("\n");
}

export const UNREGISTERED_CANDIDATES_TABLE_COPY: AuditTableCopyForAi<UnregisteredCandidateRow> =
  {
    label: "Unregistered candidate",
    listLabel: "Unregistered candidates",
    location: canonicalRouteLocation(
      "/administration/database/canonicalization/candidates",
    ),
    rowKind: "canonicalization-unregistered-candidate",
    listKind: "canonicalization-unregistered-candidates",
    rowDescription:
      "One unregistered table candidate from audit.unregistered_candidates.",
    listDescription: "Unregistered candidates visible after filters.",
    humanRow: unregisteredCandidateToHuman,
    rowAttributes: (r) => ({
      schema: r.schema_name,
      table: r.table_name,
      score: r.base_col_score,
    }),
    listAttributes: (visible, all) => ({
      count: visible.length,
      total: all.length,
    }),
  };

export function staleRegistryToHuman(row: StaleRegistryRow): string {
  return [
    `Token: ${row.token ?? "?"}`,
    `Registered as: ${row.schema_name ?? "?"}.${row.table_name ?? "?"}`,
  ].join("\n");
}

export const STALE_REGISTRY_TABLE_COPY: AuditTableCopyForAi<StaleRegistryRow> =
  {
    label: "Stale registry row",
    listLabel: "Stale registry",
    location: canonicalRouteLocation(
      "/administration/database/canonicalization/candidates",
    ),
    rowKind: "canonicalization-stale-registry-row",
    listKind: "canonicalization-stale-registry-rows",
    rowDescription: "One stale platform.entity_types registry row.",
    listDescription: "Stale registry rows visible after filters.",
    humanRow: staleRegistryToHuman,
    rowAttributes: (r) => ({
      token: r.token,
      schema: r.schema_name,
      table: r.table_name,
    }),
    listAttributes: (visible, all) => ({
      count: visible.length,
      total: all.length,
    }),
  };

// ─── Table impact ────────────────────────────────────────────────────────

export function tableImpactRowToHuman(row: TableImpactRow): string {
  const cols = (row.referenced_columns ?? []).join(", ") || "—";
  return [
    `Function: ${row.function_sig ?? "?"}`,
    `Dependency: ${row.dependency ?? "?"}`,
    `Currently broken: ${row.currently_broken ? "yes" : "no"}`,
    `Referenced columns: ${cols}`,
  ].join("\n");
}

export const TABLE_IMPACT_TABLE_COPY: AuditTableCopyForAi<TableImpactRow> = {
  label: "Table impact row",
  listLabel: "Table impact",
  location: canonicalRouteLocation(
    "/administration/database/canonicalization/table-impact",
  ),
  rowKind: "canonicalization-table-impact-row",
  listKind: "canonicalization-table-impact-rows",
  rowDescription:
    "One dependent function row from audit.table_impact(schema, table).",
  listDescription: "Blast-radius rows visible after filters.",
  humanRow: tableImpactRowToHuman,
  rowAttributes: (r) => ({
    broken: r.currently_broken,
    dependency: r.dependency,
  }),
  listAttributes: (visible, all) => ({
    count: visible.length,
    total: all.length,
    broken: visible.filter((r) => r.currently_broken).length,
  }),
};

// ─── Verify checklist rows ───────────────────────────────────────────────

export function verifyCheckToHuman(row: VerifyCanonicalRow): string {
  return [
    `Check: ${row.check_name}`,
    `Status: ${row.status}`,
    row.detail ? `Detail: ${row.detail}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const VERIFY_CHECKLIST_TABLE_COPY: AuditTableCopyForAi<VerifyCanonicalRow> =
  {
    label: "Verify check",
    listLabel: "Verify checklist",
    location: canonicalRouteLocation("/administration/database/canonicalization/verify"),
    rowKind: "canonicalization-verify-check",
    listKind: "canonicalization-verify-checklist",
    rowDescription: "One iam.verify_canonical check result.",
    listDescription: "Verify checklist rows visible after filters.",
    humanRow: verifyCheckToHuman,
    rowAttributes: (r) => ({
      check: r.check_name,
      status: r.status,
    }),
    listAttributes: (visible, all) => ({
      count: visible.length,
      total: all.length,
      fails: visible.filter((r) => r.status?.toUpperCase() === "FAIL").length,
      warns: visible.filter((r) => r.status?.toUpperCase() === "WARN").length,
    }),
  };

export function certifyBlockingToHuman(row: CanonicalCertifyRow): string {
  return [
    `Category: ${row.category}`,
    `Status: ${row.status}`,
    row.detail ? `Detail: ${row.detail}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const VERIFY_BLOCKING_TABLE_COPY: AuditTableCopyForAi<CanonicalCertifyRow> =
  {
    label: "Certify blocking row",
    listLabel: "Certify blocking",
    location: canonicalRouteLocation("/administration/database/canonicalization/verify"),
    rowKind: "canonicalization-certify-blocking-row",
    listKind: "canonicalization-certify-blocking-rows",
    rowDescription: "One iam.canonical_certify blocking row.",
    listDescription: "Certify blocking rows visible after filters.",
    humanRow: certifyBlockingToHuman,
    rowAttributes: (r) => ({
      category: r.category,
      status: r.status,
    }),
    listAttributes: (visible, all) => ({
      count: visible.length,
      total: all.length,
    }),
  };

// ─── Page-level payloads (verify run, table impact run, overview) ────────

export interface VerifyRunSnapshot {
  schema: string;
  table: string;
  token: string;
  variant: string;
  verifyOk: boolean;
  certifyOk: boolean;
  checks: VerifyCanonicalRow[];
  certifyBlocking: CanonicalCertifyRow[];
}

export function verifyRunToHuman(snapshot: VerifyRunSnapshot): string {
  const failCount = snapshot.checks.filter(
    (c) => c.status?.toUpperCase() === "FAIL",
  ).length;
  const warnCount = snapshot.checks.filter(
    (c) => c.status?.toUpperCase() === "WARN",
  ).length;
  const lines = [
    `Target: ${snapshot.schema}.${snapshot.table} (token: ${snapshot.token})`,
    `RLS variant: ${snapshot.variant}`,
    `Verify gate: ${snapshot.verifyOk ? "OK" : "NOT OK"} (${failCount} FAIL · ${warnCount} WARN)`,
    `Certify gate: ${snapshot.certifyOk ? "OK" : "NOT OK"} (${snapshot.certifyBlocking.length} blocking)`,
    "",
    "── Checklist ──",
    ...snapshot.checks.map(
      (c, i) =>
        `[${i + 1}] ${c.status} · ${c.check_name}${c.detail ? `\n    ${c.detail}` : ""}`,
    ),
  ];
  if (snapshot.certifyBlocking.length > 0) {
    lines.push("", "── Certify blocking ──");
    snapshot.certifyBlocking.forEach((r, i) => {
      lines.push(
        `[${i + 1}] ${r.status} · ${r.category}${r.detail ? `\n    ${r.detail}` : ""}`,
      );
    });
  }
  return lines.join("\n");
}

export function verifyRunToAgentInput(
  snapshot: VerifyRunSnapshot,
): AgentPayloadInput {
  return {
    kind: "canonicalization-verify-run",
    location: canonicalRouteLocation("/administration/database/canonicalization/verify"),
    description:
      "Full iam.verify_canonical + iam.canonical_certify result for one table.",
    summary: verifyRunToHuman(snapshot),
    attributes: {
      schema: snapshot.schema,
      table: snapshot.table,
      token: snapshot.token,
      variant: snapshot.variant,
      verifyOk: snapshot.verifyOk,
      certifyOk: snapshot.certifyOk,
      checkCount: snapshot.checks.length,
      blockingCount: snapshot.certifyBlocking.length,
    },
    context: {
      "docs-ref": "docs/db_changes/CANONICAL_DATABASE_SYSTEM.md",
    },
    data: snapshot,
  };
}

export interface TableImpactRunSnapshot {
  schema: string;
  table: string;
  rows: TableImpactRow[];
}

export function tableImpactRunToHuman(
  snapshot: TableImpactRunSnapshot,
): string {
  const broken = snapshot.rows.filter((r) => r.currently_broken).length;
  const lines = [
    `Target: ${snapshot.schema}.${snapshot.table}`,
    `Dependent functions: ${snapshot.rows.length} (${broken} currently broken)`,
    "",
    ...snapshot.rows.map(
      (r, i) =>
        `[${i + 1}] ${r.currently_broken ? "BROKEN" : "OK"} · ${r.function_sig ?? "?"}\n    dep=${r.dependency ?? "?"} cols=${(r.referenced_columns ?? []).join(", ") || "—"}`,
    ),
  ];
  return lines.join("\n");
}

export function tableImpactRunToAgentInput(
  snapshot: TableImpactRunSnapshot,
): AgentPayloadInput {
  return {
    kind: "canonicalization-table-impact-run",
    location: canonicalRouteLocation(
      "/administration/database/canonicalization/table-impact",
    ),
    description: "Full audit.table_impact preflight for one schema.table.",
    summary: tableImpactRunToHuman(snapshot),
    attributes: {
      schema: snapshot.schema,
      table: snapshot.table,
      count: snapshot.rows.length,
      broken: snapshot.rows.filter((r) => r.currently_broken).length,
    },
    context: {
      "docs-ref": "docs/db_changes/CANONICAL_DATABASE_SYSTEM.md",
    },
    data: snapshot,
  };
}

export function overviewToHuman(data: CanonicalizationOverview): string {
  const last = data.lastRefresh?.run_at ?? "never";
  return [
    `Registered tables: ${data.totalTables} (${data.certifiedTables} certified · ${data.notCertifiedTables} not)`,
    `Gate totals: ${data.totalFails} FAIL · ${data.totalWarns} WARN`,
    `Broken functions: ${data.brokenFunctionCount}`,
    `M2M candidates: ${data.m2mCandidateCount}`,
    `Unregistered candidates: ${data.unregisteredCandidateCount}`,
    `Stale registry: ${data.staleRegistryCount}`,
    `Last audit refresh: ${last}`,
  ].join("\n");
}

export function overviewToAgentInput(
  data: CanonicalizationOverview,
): AgentPayloadInput {
  return {
    kind: "canonicalization-overview",
    location: canonicalRouteLocation("/administration/database/canonicalization"),
    description: "Canonicalization toolkit KPI snapshot from audit.* views.",
    summary: overviewToHuman(data),
    attributes: {
      totalTables: data.totalTables,
      certifiedTables: data.certifiedTables,
      totalFails: data.totalFails,
      totalWarns: data.totalWarns,
      brokenFunctions: data.brokenFunctionCount,
    },
    context: {
      "docs-ref": "docs/db_changes/CANONICAL_DATABASE_SYSTEM.md",
    },
    data,
  };
}

/** Build a row-level agent payload from a table copy config. */
export function auditRowToAgentInput<T>(
  config: AuditTableCopyForAi<T>,
  row: T,
): AgentPayloadInput {
  return {
    kind: config.rowKind,
    location: config.location,
    description: config.rowDescription,
    summary: config.humanRow(row),
    attributes: config.rowAttributes?.(row),
    data: row,
  };
}

/** Build a list-level agent payload from visible rows. */
export function auditRowsToAgentInput<T>(
  config: AuditTableCopyForAi<T>,
  visible: T[],
  all: T[],
  extraContext?: Record<string, string | number | boolean | null | undefined>,
): AgentPayloadInput {
  return {
    kind: config.listKind,
    location: config.location,
    description: config.listDescription,
    summary: visible.map((r) => config.humanRow(r)).join("\n\n"),
    attributes: config.listAttributes?.(visible, all),
    context: extraContext,
    data: visible,
  };
}
