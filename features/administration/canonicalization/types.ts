// features/administration/canonicalization/types.ts
//
// Row shapes for the `audit.*` snapshot store and `iam.*` gate RPCs (see
// docs/canonicalization_worklog.md §5b). Manually typed — the `audit` schema
// is intentionally not exposed to PostgREST (read only through
// `execute_admin_query`), so it never appears in the generated database types.
// Verified live against project txzxabzwovsujtloxrus on 2026-07-01.

export interface AuditSummaryRow {
  schema_name: string;
  table_name: string;
  token: string;
  fails: number;
  warns: number;
  certified: boolean;
}

export interface CanonicalFindingRow {
  id: number;
  schema_name: string | null;
  table_name: string | null;
  token: string | null;
  source: string | null;
  check_name: string | null;
  status: string | null;
  detail: string | null;
}

export interface BrokenFunctionRow {
  schema_name: string | null;
  function_name: string | null;
  signature: string | null;
  lineno: number | null;
  level: string | null;
  sqlstate: string | null;
  message: string | null;
  context: string | null;
}

export interface FunctionDepRow {
  function_schema: string | null;
  function_name: string | null;
  signature: string | null;
  dep_type: string | null;
  dep_schema: string | null;
  dep_name: string | null;
}

export interface M2mCandidateRow {
  schema_name: string | null;
  table_name: string | null;
  registered: boolean | null;
  entity_fk_count: number | null;
  fk_targets: string | null;
  payload_cols: number | null;
}

export interface UnregisteredCandidateRow {
  schema_name: string | null;
  table_name: string | null;
  base_col_score: number | null;
  has_id_uuid: boolean | null;
  has_created_at: boolean | null;
}

export interface StaleRegistryRow {
  token: string | null;
  schema_name: string | null;
  table_name: string | null;
}

export interface RefreshLogRow {
  run_at: string;
  gate_fail: number | null;
  gate_warn: number | null;
  ext_fail: number | null;
  ext_warn: number | null;
  m2m: number | null;
  unregistered: number | null;
  stale: number | null;
  broken_fn: number | null;
  note: string | null;
}

/** Row from `audit.table_impact(schema, table)` — the pre-edit blast radius. */
export interface TableImpactRow {
  function_sig: string | null;
  dependency: string | null;
  currently_broken: boolean | null;
  referenced_columns: string[] | null;
}

/** Row from `iam.verify_canonical(...)` — one check per row. */
export interface VerifyCanonicalRow {
  check_name: string;
  status: string;
  detail: string | null;
}

/** Row from `iam.canonical_certify(...)` — blocking rows only; empty = perfect. */
export interface CanonicalCertifyRow {
  category: string;
  status: string;
  detail: string | null;
}

export interface VerifyCanonicalResult {
  checks: VerifyCanonicalRow[];
  verifyOk: boolean;
  certifyBlocking: CanonicalCertifyRow[];
  certifyOk: boolean;
}

export const CANONICALIZATION_DATASETS = [
  "overview",
  "summary",
  "findings",
  "broken-functions",
  "function-deps",
  "m2m-candidates",
  "unregistered-candidates",
  "stale-registry",
  "refresh-log",
] as const;

export type CanonicalizationDataset = (typeof CANONICALIZATION_DATASETS)[number];

export interface CanonicalizationOverview {
  totalTables: number;
  certifiedTables: number;
  notCertifiedTables: number;
  totalFails: number;
  totalWarns: number;
  brokenFunctionCount: number;
  m2mCandidateCount: number;
  unregisteredCandidateCount: number;
  staleRegistryCount: number;
  lastRefresh: RefreshLogRow | null;
}

export interface KnownTableRef {
  schema_name: string;
  table_name: string;
}
