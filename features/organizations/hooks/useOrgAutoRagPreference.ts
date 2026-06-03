// features/organizations/hooks/useOrgAutoRagPreference.ts
//
// Reads / writes the per-org `organization_preferences` row that drives
// auto-ingest for the knowledge graph (Phase F → Step 3.1 of the KG
// activation plan). Mirrors `features/kg-suggestions/hooks/useAutoRagPreference`
// but keyed on `organization_id` instead of `user_id`. React → Supabase
// directly (CLAUDE.md "no Next.js middle tier" rule); RLS scopes writes to
// org admins/owners. Every field on the row has a DB default — only
// `organization_id` is required for upsert, so no JSON-cast escape hatch.
//
// Surface budgeting math:
//   - `usedTodayUsd` / `budgetUsd` come straight from the row (millicents
//     rolled into USD by the auto-ingest writer).
//   - `percentUsed` is computed in-hook so consumers don't reinvent it.
//   - `windowStart` tells the user when the 24h cap will roll over.

"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { extractErrorMessage } from "@/utils/errors";

export interface UseOrgAutoRagPreferenceResult {
  enabled: boolean;
  /** Daily auto-ingest cap in USD (column default 5.00). */
  budgetUsd: number;
  /** Auto-ingest cost charged in the current 24h window. */
  usedTodayUsd: number;
  /** `usedTodayUsd / budgetUsd * 100`, clamped to `>= 0`. `Infinity` when budget is 0. */
  percentUsed: number;
  /** ISO timestamp the current 24h window started at. */
  windowStart: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setEnabled: (next: boolean) => Promise<void>;
  setBudgetUsd: (next: number) => Promise<void>;
}

const DEFAULT_BUDGET_USD = 5.0;

export function useOrgAutoRagPreference(
  organizationId: string | null,
): UseOrgAutoRagPreferenceResult {
  const [enabled, setEnabledState] = useState(true); // column default is TRUE
  const [budgetUsd, setBudgetState] = useState<number>(DEFAULT_BUDGET_USD);
  const [usedTodayUsd, setUsedTodayState] = useState<number>(0);
  const [windowStart, setWindowStart] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data, error: qErr } = await supabase
          .from("organization_preferences")
          .select(
            "auto_rag_enabled, daily_auto_rag_budget_usd, daily_auto_rag_cost_used_usd, daily_auto_rag_window_start",
          )
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) throw qErr;
        // Sensible defaults when the row hasn't been created yet — first
        // toggle / first auto-ingest charge will materialize it.
        setEnabledState(data?.auto_rag_enabled ?? true);
        setBudgetState(
          data?.daily_auto_rag_budget_usd ?? DEFAULT_BUDGET_USD,
        );
        setUsedTodayState(data?.daily_auto_rag_cost_used_usd ?? 0);
        setWindowStart(data?.daily_auto_rag_window_start ?? null);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const setEnabled = useCallback(
    async (next: boolean) => {
      if (!organizationId) return;
      setSaving(true);
      const prev = enabled;
      setEnabledState(next); // optimistic
      try {
        const { error: uErr } = await supabase
          .from("organization_preferences")
          .upsert(
            {
              organization_id: organizationId,
              auto_rag_enabled: next,
            },
            { onConflict: "organization_id" },
          );
        if (uErr) throw uErr;
        setError(null);
      } catch (err) {
        setEnabledState(prev); // rollback
        setError(extractErrorMessage(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, enabled],
  );

  const setBudgetUsd = useCallback(
    async (next: number) => {
      if (!organizationId) return;
      if (!Number.isFinite(next) || next < 0) {
        throw new Error("Budget must be a non-negative number");
      }
      setSaving(true);
      const prev = budgetUsd;
      setBudgetState(next); // optimistic
      try {
        const { error: uErr } = await supabase
          .from("organization_preferences")
          .upsert(
            {
              organization_id: organizationId,
              daily_auto_rag_budget_usd: next,
            },
            { onConflict: "organization_id" },
          );
        if (uErr) throw uErr;
        setError(null);
      } catch (err) {
        setBudgetState(prev); // rollback
        setError(extractErrorMessage(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, budgetUsd],
  );

  const percentUsed =
    budgetUsd > 0 ? Math.max(0, (usedTodayUsd / budgetUsd) * 100) : Infinity;

  return {
    enabled,
    budgetUsd,
    usedTodayUsd,
    percentUsed,
    windowStart,
    loading,
    saving,
    error,
    setEnabled,
    setBudgetUsd,
  };
}
