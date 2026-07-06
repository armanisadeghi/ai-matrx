"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { CanonicalizationDataset } from "../types";
import { fetchAuditDataset } from "../utils/auditStoreClient";

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
      const rawRows = await fetchAuditDataset(dataset);
      const validRows = rawRows.filter(isRow);
      if (validRows.length !== rawRows.length) {
        toast.warning(
          `${dataset}: dropped ${rawRows.length - validRows.length} malformed row(s)`,
        );
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
