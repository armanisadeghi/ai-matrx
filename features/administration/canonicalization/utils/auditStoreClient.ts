// features/administration/canonicalization/utils/auditStoreClient.ts
//
// Client helpers for the canonicalization audit store. Every read uses
// cache: 'no-store' — stale UI here is almost always because audit.* is a
// snapshot rebuilt only by audit.refresh(), not browser/Next caching.

import type { CanonicalizationDataset } from "../types";
import { errorMessageFrom, readJsonObject } from "./apiClient";

const NO_STORE: RequestInit = { cache: "no-store" };

export async function fetchAuditDataset(
  dataset: Exclude<CanonicalizationDataset, "overview">,
): Promise<unknown[]> {
  const res = await fetch(
    `/api/admin/canonicalization?dataset=${encodeURIComponent(dataset)}`,
    NO_STORE,
  );
  const data = await readJsonObject(res);
  if (!res.ok) throw new Error(errorMessageFrom(data, res));
  return Array.isArray(data.rows) ? data.rows : [];
}

/** Rebuilds every audit.* snapshot (plpgsql_check, gate, deps, …). */
export async function refreshAuditStore(): Promise<{
  note: string;
  durationMs: number;
}> {
  const res = await fetch("/api/admin/canonicalization", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "refresh" }),
    ...NO_STORE,
  });
  const data = await readJsonObject(res);
  if (!res.ok) throw new Error(errorMessageFrom(data, res));
  return {
    note: typeof data.note === "string" ? data.note : "",
    durationMs: typeof data.durationMs === "number" ? data.durationMs : 0,
  };
}

export async function fetchLastAuditRefreshRunAt(): Promise<string | null> {
  const rows = await fetchAuditDataset("refresh-log");
  const first = rows[0];
  if (typeof first !== "object" || first === null) return null;
  const runAt = (first as Record<string, unknown>).run_at;
  return typeof runAt === "string" ? runAt : null;
}
