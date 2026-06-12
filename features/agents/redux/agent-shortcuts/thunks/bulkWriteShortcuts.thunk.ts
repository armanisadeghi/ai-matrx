"use client";

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { AgentShortcut } from "../types";
import type { ShortcutFormData } from "@/features/agent-shortcuts/types";
import { agentShortcutToInsert, dbRowToAgentShortcut } from "../converters";
import { upsertShortcuts } from "../slice";

type ThunkApi = { dispatch: AppDispatch; state: RootState };

/**
 * Bulk-create shortcuts in a single round trip.
 *
 * The batch editor produces N fully-specified drafts; rather than N inserts we
 * send one `insert([...])`. RLS still applies per row (the same policy the
 * single-row create relies on). Returns the new ids in input order.
 */
export const bulkCreateShortcuts = createAsyncThunk<
  string[],
  ShortcutFormData[],
  ThunkApi
>("agentShortcut/bulkCreate", async (drafts, { dispatch, getState }) => {
  if (drafts.length === 0) return [];
  const userId = selectUserId(getState());

  const rows = drafts.map((d) =>
    agentShortcutToInsert({
      ...d,
      id: "",
      userId: d.userId ?? userId,
      createdAt: "",
      updatedAt: "",
    } as AgentShortcut),
  );

  const { data, error } = await supabase
    .from("agx_shortcut")
    .insert(rows)
    .select();
  if (error) throw pgErrorToError(error);

  const created = (data ?? []).map(dbRowToAgentShortcut);
  if (created.length > 0) dispatch(upsertShortcuts(created));
  return created.map((s) => s.id);
});

/**
 * Bulk-update shortcuts in a single round trip.
 *
 * PostgREST can't express heterogeneous per-row UPDATEs in one statement, so we
 * upsert full rows keyed on `id` (one `upsert([...], { onConflict: "id" })`).
 * Callers must pass the COMPLETE merged shortcut (existing record + edits) so
 * no column is nulled out. Returns the saved rows.
 */
export const bulkUpdateShortcuts = createAsyncThunk<
  AgentShortcut[],
  AgentShortcut[],
  ThunkApi
>("agentShortcut/bulkUpdate", async (fullRows, { dispatch }) => {
  if (fullRows.length === 0) return [];

  const rows = fullRows.map((r) => ({
    ...(agentShortcutToInsert(r) as Record<string, unknown>),
    id: r.id,
  }));

  const { data, error } = await supabase
    .from("agx_shortcut")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, { onConflict: "id" })
    .select();
  if (error) throw pgErrorToError(error);

  const saved = (data ?? []).map(dbRowToAgentShortcut);
  if (saved.length > 0) dispatch(upsertShortcuts(saved));
  return saved;
});
