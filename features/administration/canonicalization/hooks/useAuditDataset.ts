"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { CanonicalizationDataset } from "../types";
import { errorMessageFrom, readJsonObject } from "../utils/apiClient";

/**
 * Fetches one `audit.*` dataset from the canonicalization API and exposes a
 * reload fn. `isRow` is the per-dataset shape guard from `types.ts`
 * (`isAuditSummaryRow`, `isBrokenFunctionRow`, …) — rows that fail it are
 * dropped and reported via toast rather than silently trusted, since these
 * rows never pass through a Supabase-generated/`DbRpcRow` compile-time check
 * (the `audit` schema is hidden from PostgREST).
 */
export function useAuditDataset<T>(
  dataset: Exclude<CanonicalizationDataset, "overview">,
  isRow: (v: unknown) => v is T,
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/canonicalization?dataset=${dataset}`);
      const data = await readJsonObject(res);
      if (!res.ok) throw new Error(errorMessageFrom(data, res));
      // The caller-supplied `isRow` predicate IS the runtime validation the
      // dataset's `T` needs — rows failing it are dropped loudly, never cast.
      const rawRows: unknown[] = Array.isArray(data.rows) ? data.rows : [];
      const validRows = rawRows.filter(isRow);
      if (validRows.length !== rawRows.length) {
        toast.warning(`${dataset}: dropped ${rawRows.length - validRows.length} malformed row(s)`);
      }
      setRows(validRows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [dataset, isRow]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, reload: load };
}
