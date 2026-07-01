// features/administration/canonicalization/service/canonicalizationService.ts
//
// SERVER ONLY — uses createAdminClient() (service-role secret key). Never
// import this from a client component; it is consumed exclusively by the
// app/api/admin/canonicalization/** route handlers. Same admin-SQL path as
// lib/integrity/server.ts and the SQL Workbench: `execute_admin_query`.

import { createAdminClient } from "@/utils/supabase/adminClient";
import { unwrapRows } from "@/lib/integrity/unwrap";
import {
  DATASET_QUERIES,
  DISTINCT_TABLES_QUERY,
  REFRESH_QUERY,
  buildCanonicalCertifyOkQuery,
  buildCanonicalCertifyQuery,
  buildEntityTokenLookupQuery,
  buildTableImpactQuery,
  buildVerifyCanonicalOkQuery,
  buildVerifyCanonicalQuery,
} from "../utils/queryBuilders";
import type {
  AuditSummaryRow,
  BrokenFunctionRow,
  CanonicalCertifyRow,
  CanonicalFindingRow,
  CanonicalizationDataset,
  CanonicalizationOverview,
  FunctionDepRow,
  KnownTableRef,
  M2mCandidateRow,
  RefreshLogRow,
  StaleRegistryRow,
  TableImpactRow,
  UnregisteredCandidateRow,
  VerifyCanonicalResult,
  VerifyCanonicalRow,
} from "../types";

async function runQuery<T>(query: string): Promise<T[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("execute_admin_query", { query });
  if (error) throw new Error(error.message);
  return unwrapRows(data) as T[];
}

type DatasetRowMap = {
  summary: AuditSummaryRow;
  findings: CanonicalFindingRow;
  "broken-functions": BrokenFunctionRow;
  "function-deps": FunctionDepRow;
  "m2m-candidates": M2mCandidateRow;
  "unregistered-candidates": UnregisteredCandidateRow;
  "stale-registry": StaleRegistryRow;
  "refresh-log": RefreshLogRow;
};

export async function fetchDatasetRows<D extends Exclude<CanonicalizationDataset, "overview">>(
  dataset: D,
): Promise<DatasetRowMap[D][]> {
  const query = DATASET_QUERIES[dataset];
  if (!query) throw new Error(`Unknown dataset: ${dataset}`);
  return runQuery<DatasetRowMap[D]>(query);
}

export async function fetchOverview(): Promise<CanonicalizationOverview> {
  const [summary, brokenFns, m2m, unregistered, stale, refreshLog] = await Promise.all([
    runQuery<AuditSummaryRow>(DATASET_QUERIES.summary),
    runQuery<BrokenFunctionRow>(DATASET_QUERIES["broken-functions"]),
    runQuery<M2mCandidateRow>(DATASET_QUERIES["m2m-candidates"]),
    runQuery<UnregisteredCandidateRow>(DATASET_QUERIES["unregistered-candidates"]),
    runQuery<StaleRegistryRow>(DATASET_QUERIES["stale-registry"]),
    runQuery<RefreshLogRow>(DATASET_QUERIES["refresh-log"]),
  ]);

  const totalFails = summary.reduce((sum, r) => sum + Number(r.fails ?? 0), 0);
  const totalWarns = summary.reduce((sum, r) => sum + Number(r.warns ?? 0), 0);
  const certifiedTables = summary.filter((r) => r.certified).length;

  return {
    totalTables: summary.length,
    certifiedTables,
    notCertifiedTables: summary.length - certifiedTables,
    totalFails,
    totalWarns,
    brokenFunctionCount: brokenFns.length,
    m2mCandidateCount: m2m.length,
    unregisteredCandidateCount: unregistered.length,
    staleRegistryCount: stale.length,
    lastRefresh: refreshLog[0] ?? null,
  };
}

export async function runAuditRefresh(): Promise<{ note: string }> {
  const rows = await runQuery<{ note: string }>(REFRESH_QUERY);
  return { note: rows[0]?.note ?? "" };
}

export async function runTableImpact(schema: string, table: string): Promise<TableImpactRow[]> {
  return runQuery<TableImpactRow>(buildTableImpactQuery(schema, table));
}

export async function lookupEntityToken(schema: string, table: string): Promise<string | null> {
  const rows = await runQuery<{ token: string }>(buildEntityTokenLookupQuery(schema, table));
  return rows[0]?.token ?? null;
}

export async function listKnownTables(): Promise<KnownTableRef[]> {
  return runQuery<KnownTableRef>(DISTINCT_TABLES_QUERY);
}

export async function runVerifyCanonical(
  schema: string,
  table: string,
  token: string,
  variant?: string | null,
): Promise<VerifyCanonicalResult> {
  const [checks, okRows, certifyBlocking, certifyOkRows] = await Promise.all([
    runQuery<VerifyCanonicalRow>(buildVerifyCanonicalQuery(schema, table, token, variant)),
    runQuery<{ ok: boolean }>(buildVerifyCanonicalOkQuery(schema, table, token, variant)),
    runQuery<CanonicalCertifyRow>(buildCanonicalCertifyQuery(schema, table, token)),
    runQuery<{ ok: boolean }>(buildCanonicalCertifyOkQuery(schema, table, token)),
  ]);

  return {
    checks,
    verifyOk: okRows[0]?.ok ?? false,
    certifyBlocking,
    certifyOk: certifyOkRows[0]?.ok ?? false,
  };
}
