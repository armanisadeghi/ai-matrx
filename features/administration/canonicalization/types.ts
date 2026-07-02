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

// ─── Runtime shape guards ────────────────────────────────────────────────
// These rows never touch the Supabase-generated types (the `audit` schema is
// intentionally hidden from PostgREST — see the file header), so there is no
// `DbRpcRow` compile-time guard available. They arrive over the wire from
// `/api/admin/canonicalization` as a plain JSON object; the guards below let
// call sites validate the actual field count/type instead of trusting a
// network response uncritically (TYPESCRIPT_STANDARDS.md §4).

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStrOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

export function isAuditSummaryRow(v: unknown): v is AuditSummaryRow {
  return (
    isRec(v) &&
    typeof v.schema_name === "string" &&
    typeof v.table_name === "string" &&
    typeof v.token === "string" &&
    typeof v.fails === "number" &&
    typeof v.warns === "number" &&
    typeof v.certified === "boolean"
  );
}

export function isCanonicalFindingRow(v: unknown): v is CanonicalFindingRow {
  return (
    isRec(v) &&
    isStrOrNull(v.schema_name) &&
    isStrOrNull(v.table_name) &&
    isStrOrNull(v.token) &&
    isStrOrNull(v.source) &&
    isStrOrNull(v.check_name) &&
    isStrOrNull(v.status) &&
    isStrOrNull(v.detail)
  );
}

export function isBrokenFunctionRow(v: unknown): v is BrokenFunctionRow {
  return (
    isRec(v) &&
    isStrOrNull(v.schema_name) &&
    isStrOrNull(v.function_name) &&
    isStrOrNull(v.signature) &&
    (v.lineno === null || typeof v.lineno === "number") &&
    isStrOrNull(v.level) &&
    isStrOrNull(v.sqlstate) &&
    isStrOrNull(v.message) &&
    isStrOrNull(v.context)
  );
}

export function isFunctionDepRow(v: unknown): v is FunctionDepRow {
  return (
    isRec(v) &&
    isStrOrNull(v.function_schema) &&
    isStrOrNull(v.function_name) &&
    isStrOrNull(v.signature) &&
    isStrOrNull(v.dep_type) &&
    isStrOrNull(v.dep_schema) &&
    isStrOrNull(v.dep_name)
  );
}

export function isM2mCandidateRow(v: unknown): v is M2mCandidateRow {
  return (
    isRec(v) &&
    isStrOrNull(v.schema_name) &&
    isStrOrNull(v.table_name) &&
    (v.registered === null || typeof v.registered === "boolean") &&
    (v.entity_fk_count === null || typeof v.entity_fk_count === "number") &&
    isStrOrNull(v.fk_targets) &&
    (v.payload_cols === null || typeof v.payload_cols === "number")
  );
}

export function isUnregisteredCandidateRow(v: unknown): v is UnregisteredCandidateRow {
  return (
    isRec(v) &&
    isStrOrNull(v.schema_name) &&
    isStrOrNull(v.table_name) &&
    (v.base_col_score === null || typeof v.base_col_score === "number") &&
    (v.has_id_uuid === null || typeof v.has_id_uuid === "boolean") &&
    (v.has_created_at === null || typeof v.has_created_at === "boolean")
  );
}

export function isStaleRegistryRow(v: unknown): v is StaleRegistryRow {
  return isRec(v) && isStrOrNull(v.token) && isStrOrNull(v.schema_name) && isStrOrNull(v.table_name);
}
