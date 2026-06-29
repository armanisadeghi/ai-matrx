// features/kg-suggestions/hooks/useAutoRagPreference.ts
//
// Reads / writes the per-user `user_preferences.auto_rag_enabled` column
// — the per-user Knowledge-Graph auto-ingest opt-out (Phase A). React →
// Supabase directly (per CLAUDE.md — this is a plain user-owned row
// write, RLS-scoped to the user). When OFF, the user's content is not
// auto-ingested into the KG / RAG corpus.
//
// The column was added in Phase A and now lives natively on
// `Database['users']['Tables']['user_preferences']]['Row']`, so we read
// it from the typed row without any casts.
//
// Write path: UPDATE first, fall back to INSERT only when no row exists.
// We can't use a plain `upsert(...)` because `preferences jsonb` is
// `NOT NULL` with no DB default: a row that already has a real
// preferences blob must not be clobbered with `{}`. Splitting the path
// keeps the column untouched on update and seeds it on first-write.

"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";

export interface UseAutoRagPreferenceResult {
  enabled: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setEnabled: (next: boolean) => Promise<void>;
}

export function useAutoRagPreference(): UseAutoRagPreferenceResult {
  const userId = useAppSelector(selectUserId);
  const [enabled, setEnabledState] = useState(true); // column default is TRUE
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data, error: qErr } = await supabase
          .schema("users").from("user_preferences")
          .select("auto_rag_enabled")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) throw qErr;
        // Default TRUE when the row is absent — matches DB column default.
        setEnabledState(data?.auto_rag_enabled ?? true);
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
  }, [userId]);

  const setEnabled = useCallback(
    async (next: boolean) => {
      if (!userId) return;
      setSaving(true);
      const prev = enabled;
      setEnabledState(next); // optimistic
      try {
        // 1) Try UPDATE first — the common path for users who already have
        //    a preferences row. Leaves `preferences` jsonb untouched.
        const { data: updated, error: updateErr } = await supabase
          .schema("users").from("user_preferences")
          .update({ auto_rag_enabled: next })
          .eq("user_id", userId)
          .select("user_id");
        if (updateErr) throw updateErr;

        // 2) If nothing was updated, seed a fresh row. `preferences` is
        //    NOT NULL with no DB default, so we seed with `{}` on create.
        if (!updated || updated.length === 0) {
          const { error: insertErr } = await supabase
            .schema("users").from("user_preferences")
            .insert({
              user_id: userId,
              organization_id: await ensureOrgId(undefined),
              auto_rag_enabled: next,
              preferences: {},
            });
          if (insertErr) throw insertErr;
        }
        setError(null);
      } catch (err) {
        setEnabledState(prev); // rollback
        setError(extractErrorMessage(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [userId, enabled],
  );

  return { enabled, loading, saving, error, setEnabled };
}
