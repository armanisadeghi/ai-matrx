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
import { describeWriteFailure } from "@/lib/errors/writeFailure";

export type OrgAutoRagField = "enabled" | "indexNonPdf" | "suggestionSweeps" | "budget";

/** Completes "Could not …" for a refused write of each field. */
export const FIELD_ACTION: Record<OrgAutoRagField, string> = {
  enabled: "change auto knowledge-graph for this organization",
  indexNonPdf: "change non-PDF auto-indexing for this organization",
  suggestionSweeps: "change scope-value suggestions for this organization",
  budget: "change the daily auto-ingest budget",
};

export interface UseOrgAutoRagPreferenceResult {
  enabled: boolean;
  /** Whether this org opts into auto-ingesting NON-PDF content (notes,
   * transcripts, web scrapes, etc.). NULL/false = OFF (the default); PDFs are
   * always indexed regardless. */
  indexNonPdf: boolean;
  /** Whether this org opts into suggestion sweeps — when a scope/field is
   * added, an agent proposes back-filled value suggestions over already-
   * extracted content. NULL/false = OFF (the default); suggestions always
   * require confirmation. */
  suggestionSweeps: boolean;
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
  /** Which field's write is in flight (its control shows busy and keeps its value until it lands). */
  pendingField: OrgAutoRagField | null;
  error: string | null;
  setEnabled: (next: boolean) => Promise<void>;
  setIndexNonPdf: (next: boolean) => Promise<void>;
  setSuggestionSweeps: (next: boolean) => Promise<void>;
  setBudgetUsd: (next: number) => Promise<void>;
}

const DEFAULT_BUDGET_USD = 5.0;

export function useOrgAutoRagPreference(
  organizationId: string | null,
): UseOrgAutoRagPreferenceResult {
  const [enabled, setEnabledState] = useState(true); // column default is TRUE
  const [indexNonPdf, setIndexNonPdfState] = useState(false); // NULL/false = OFF default
  const [suggestionSweeps, setSuggestionSweepsState] = useState(false); // NULL/false = OFF default
  const [budgetUsd, setBudgetState] = useState<number>(DEFAULT_BUDGET_USD);
  const [usedTodayUsd, setUsedTodayState] = useState<number>(0);
  const [windowStart, setWindowStart] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data, error: qErr } = await supabase
          .schema("iam").from("organization_preferences")
          .select(
            "auto_rag_enabled, auto_index_non_pdf, suggestion_sweeps_enabled, daily_auto_rag_budget_usd, daily_auto_rag_cost_used_usd, daily_auto_rag_window_start",
          )
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) throw qErr;
        // Sensible defaults when the row hasn't been created yet — first
        // toggle / first auto-ingest charge will materialize it.
        setEnabledState(data?.auto_rag_enabled ?? true);
        // NULL/false both mean OFF — the org hasn't opted into non-PDF ingest.
        setIndexNonPdfState(data?.auto_index_non_pdf ?? false);
        // NULL/false both mean OFF — the org hasn't opted into suggestion sweeps.
        setSuggestionSweepsState(data?.suggestion_sweeps_enabled ?? false);
        setBudgetState(
          data?.daily_auto_rag_budget_usd ?? DEFAULT_BUDGET_USD,
        );
        setUsedTodayState(data?.daily_auto_rag_cost_used_usd ?? 0);
        setWindowStart(data?.daily_auto_rag_window_start ?? null);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          const w = describeWriteFailure(err, {
            action: "read this organization's knowledge-graph settings",
            remedy: "Reload the page to try again.",
          });
          setError(`${w.title} ${w.description}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // PENDING, NEVER OPTIMISTIC (GATES-TAIL-2): the value changes only once the door agreed; while
  // the write is in flight `saving` / `pendingField` say so, and a refusal leaves the value as it
  // was with `error` in words (describeWriteFailure), never the database's own line.
  const [pendingField, setPendingField] = useState<OrgAutoRagField | null>(null);

  const writePatch = useCallback(
    async (field: OrgAutoRagField, patch: Record<string, unknown>, apply: () => void) => {
      if (!organizationId) return;
      setSaving(true);
      setPendingField(field);
      try {
        // THROUGH THE DOOR. `iam` is not a client-writable schema (DOORS-ONLY-3).
        // `public.org_preferences_set` writes the preference flags and the budget
        // CEILING and cannot touch `daily_auto_rag_cost_used_usd` or
        // `daily_auto_rag_window_start` — the live spend meter aidream writes, which
        // the base-table UPDATE grant let a browser reset for itself.
        const { error: uErr } = await supabase.rpc("org_preferences_set", {
          p_organization_id: organizationId,
          p_patch: patch as never,
        });
        if (uErr) throw uErr;
        apply();
        setError(null);
      } catch (err) {
        const words = describeWriteFailure(err, { action: FIELD_ACTION[field], remedy: "Try again." });
        setError(`${words.title} ${words.description}`);
        throw err;
      } finally {
        setSaving(false);
        setPendingField(null);
      }
    },
    [organizationId],
  );

  const setEnabled = useCallback(
    (next: boolean) => writePatch("enabled", { auto_rag_enabled: next }, () => setEnabledState(next)),
    [writePatch],
  );
  const setIndexNonPdf = useCallback(
    (next: boolean) => writePatch("indexNonPdf", { auto_index_non_pdf: next }, () => setIndexNonPdfState(next)),
    [writePatch],
  );
  const setSuggestionSweeps = useCallback(
    (next: boolean) =>
      writePatch("suggestionSweeps", { suggestion_sweeps_enabled: next }, () => setSuggestionSweepsState(next)),
    [writePatch],
  );
  const setBudgetUsd = useCallback(
    async (next: number) => {
      if (!Number.isFinite(next) || next < 0) {
        throw new Error("Budget must be a non-negative number");
      }
      return writePatch("budget", { daily_auto_rag_budget_usd: next }, () => setBudgetState(next));
    },
    [writePatch],
  );

  const percentUsed =
    budgetUsd > 0 ? Math.max(0, (usedTodayUsd / budgetUsd) * 100) : Infinity;

  return {
    enabled,
    indexNonPdf,
    suggestionSweeps,
    budgetUsd,
    usedTodayUsd,
    percentUsed,
    windowStart,
    loading,
    saving,
    pendingField,
    error,
    setEnabled,
    setIndexNonPdf,
    setSuggestionSweeps,
    setBudgetUsd,
  };
}
