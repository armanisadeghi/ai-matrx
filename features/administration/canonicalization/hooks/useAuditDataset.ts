"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { CanonicalizationDataset } from "../types";

/** Fetches one `audit.*` dataset from the canonicalization API and exposes a reload fn. */
export function useAuditDataset<T>(dataset: Exclude<CanonicalizationDataset, "overview">) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/canonicalization?dataset=${dataset}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      // `audit.*` rows have no generated schema (see types.ts header) — the
      // caller-supplied `T` can't be runtime-validated generically here, so
      // this goes through `unknown` per the "Json returned directly" pattern.
      setRows((data.rows ?? []) as unknown as T[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [dataset]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, reload: load };
}
