// features/kg-suggestions/hooks/useAutoRagPreference.ts
//
// Reads / writes the per-user `user_preferences.auto_rag_enabled` column
// (added in Phase A — the Knowledge-Graph auto-ingest opt-out). React →
// Supabase directly (per CLAUDE.md — this is a plain user-owned row write,
// RLS-scoped to the user). When OFF, the user's content is not auto-ingested
// into the KG / RAG corpus.
//
// NOTE: `auto_rag_enabled` is not yet in the generated database.types
// (the column was applied to the DB in Phase A but FE types haven't been
// regenerated). We read/write it through a narrow local shape and a cast.
// TODO(types): regenerate Supabase types and drop the cast once the column
// appears in types/database.types.ts.

"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";
import type { Database } from "@/types/database.types";

interface AutoRagRow {
  auto_rag_enabled: boolean | null;
}

/**
 * The upsert payload. `auto_rag_enabled` (Phase A) isn't in the generated
 * `user_preferences` Insert type yet, so we build a typed object and adapt it
 * to the Insert shape at the call site. The column exists in the DB; this is a
 * types-regen gap, not a schema gap.
 */
type UserPreferencesInsert =
  Database["public"]["Tables"]["user_preferences"]["Insert"];

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
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        // Select the whole row (typed as the generated user_preferences Row),
        // then read the Phase-A column via an intersection — no double cast.
        // The column exists in the DB; it's just missing from generated types.
        const { data, error: qErr } = await supabase
          .from("user_preferences")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle<AutoRagRow>();
        if (cancelled) return;
        if (qErr) throw qErr;
        // Default TRUE when the row or column is absent.
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
        // Adapt the payload to the generated Insert type. `auto_rag_enabled`
        // rides along as an extra key the DB accepts (Phase A column). The
        // generated Insert type marks `preferences` required and lacks the new
        // column, so we bridge through unknown — strictly a types-regen gap,
        // not a schema gap (the column exists live; see file header TODO).
        const payload = {
          user_id: userId,
          auto_rag_enabled: next,
        } satisfies { user_id: string; auto_rag_enabled: boolean };
        const { error: uErr } = await supabase
          .from("user_preferences")
          // Upsert so a user with no preferences row still persists the toggle.
          .upsert(payload as unknown as UserPreferencesInsert, {
            onConflict: "user_id",
          });
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
    [userId, enabled],
  );

  return { enabled, loading, saving, error, setEnabled };
}
