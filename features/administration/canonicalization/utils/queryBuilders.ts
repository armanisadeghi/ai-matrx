// features/administration/canonicalization/utils/queryBuilders.ts
//
// SQL text for every `audit.*` snapshot view + the interactive `iam.*` gate
// RPCs, per docs/canonicalization_worklog.md §5b. The dataset queries are
// fixed literals (no interpolation, no injection surface); the interactive
// builders (table-impact, verify) validate/escape every admin-supplied value
// via sqlSafety.ts before building the call.

import { assertSafeIdentifier, sqlLiteral } from "./sqlSafety";
import type { CanonicalizationDataset } from "../types";

export const DATASET_QUERIES: Record<
  Exclude<CanonicalizationDataset, "overview">,
  string
> = {
  summary: `select schema_name, table_name, token, fails, warns, certified
    from audit.summary
    order by fails desc, warns desc, schema_name, table_name;`,
  findings: `select id, schema_name, table_name, token, source, check_name, status, detail
    from audit.canonical_findings
    order by (status = 'FAIL') desc, (status = 'WARN') desc, schema_name, table_name, check_name;`,
  "broken-functions": `select schema_name, function_name, signature, lineno, level, sqlstate, message, context
    from audit.broken_functions
    order by schema_name, function_name;`,
  "function-deps": `select function_schema, function_name, signature, dep_type, dep_schema, dep_name
    from audit.function_deps
    order by function_schema, function_name, dep_schema, dep_name;`,
  "m2m-candidates": `select schema_name, table_name, registered, entity_fk_count, fk_targets, payload_cols
    from audit.m2m_candidates
    order by payload_cols asc nulls first, schema_name, table_name;`,
  "unregistered-candidates": `select schema_name, table_name, base_col_score, has_id_uuid, has_created_at
    from audit.unregistered_candidates
    order by base_col_score desc nulls last, schema_name, table_name;`,
  "stale-registry": `select token, schema_name, table_name
    from audit.stale_registry
    order by token;`,
  "refresh-log": `select run_at, gate_fail, gate_warn, ext_fail, ext_warn, m2m, unregistered, stale, broken_fn, note
    from audit.refresh_log
    order by run_at desc;`,
};

export const REFRESH_QUERY = `select audit.refresh() as note;`;

export const DISTINCT_TABLES_QUERY = `select distinct schema_name, table_name
  from audit.summary
  order by 1, 2;`;

export const RLS_VARIANTS = ["entity", "component", "ledger"] as const;
export type RlsVariant = (typeof RLS_VARIANTS)[number];

function variantLiteral(variant?: string | null): string {
  return variant && (RLS_VARIANTS as readonly string[]).includes(variant)
    ? sqlLiteral(variant)
    : "null";
}

export function buildTableImpactQuery(schema: string, table: string): string {
  const s = assertSafeIdentifier(schema, "schema");
  const t = assertSafeIdentifier(table, "table");
  return `select function_sig, dependency, currently_broken, referenced_columns
    from audit.table_impact(${sqlLiteral(s)}, ${sqlLiteral(t)});`;
}

export function buildEntityTokenLookupQuery(schema: string, table: string): string {
  const s = assertSafeIdentifier(schema, "schema");
  const t = assertSafeIdentifier(table, "table");
  return `select token from platform.entity_types
    where schema_name = ${sqlLiteral(s)} and table_name = ${sqlLiteral(t)} and is_active
    limit 1;`;
}

export function buildVerifyCanonicalQuery(
  schema: string,
  table: string,
  token: string,
  variant?: string | null,
): string {
  const s = assertSafeIdentifier(schema, "schema");
  const t = assertSafeIdentifier(table, "table");
  const tok = assertSafeIdentifier(token, "token");
  return `select check_name, status, detail
    from iam.verify_canonical(${sqlLiteral(s)}, ${sqlLiteral(t)}, ${sqlLiteral(tok)}, ${variantLiteral(variant)});`;
}

export function buildVerifyCanonicalOkQuery(
  schema: string,
  table: string,
  token: string,
  variant?: string | null,
): string {
  const s = assertSafeIdentifier(schema, "schema");
  const t = assertSafeIdentifier(table, "table");
  const tok = assertSafeIdentifier(token, "token");
  return `select iam.verify_canonical_ok(${sqlLiteral(s)}, ${sqlLiteral(t)}, ${sqlLiteral(tok)}, ${variantLiteral(variant)}) as ok;`;
}

export function buildCanonicalCertifyQuery(schema: string, table: string, token: string): string {
  const s = assertSafeIdentifier(schema, "schema");
  const t = assertSafeIdentifier(table, "table");
  const tok = assertSafeIdentifier(token, "token");
  return `select category, status, detail
    from iam.canonical_certify(${sqlLiteral(s)}, ${sqlLiteral(t)}, ${sqlLiteral(tok)});`;
}

export function buildCanonicalCertifyOkQuery(schema: string, table: string, token: string): string {
  const s = assertSafeIdentifier(schema, "schema");
  const t = assertSafeIdentifier(table, "table");
  const tok = assertSafeIdentifier(token, "token");
  return `select iam.canonical_certify_ok(${sqlLiteral(s)}, ${sqlLiteral(t)}, ${sqlLiteral(tok)}) as ok;`;
}
