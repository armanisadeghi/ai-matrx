"use client";

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@ai-matrx/data";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { AgentShortcut } from "../types";
import type { ShortcutFormData } from "@/features/agent-shortcuts/types";
import { agentShortcutToInsert, dbRowToAgentShortcut } from "../converters";
import { upsertShortcuts } from "../slice";
import { selectCategoryById } from "../../agent-shortcut-categories/selectors";
import { resolveShortcutWriteScope } from "@/features/agent-shortcuts/resolveShortcutWriteScope";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import {
  SHORTCUT_STORAGE_CUTOVER,
  shortcutTable,
} from "@/lib/supabase/shortcutStorage";

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
  const state = getState();
  const userId = selectUserId(state);
  const systemOrgId = await resolveSystemOrgId();

  const rows = await Promise.all(
    drafts.map(async (d) => {
      const category = selectCategoryById(state, d.categoryId);
      if (!category) {
        throw new Error(
          `[agent-shortcuts] category ${d.categoryId} is not loaded; refusing to guess shortcut scope`,
        );
      }

      const scope = category.userId
        ? "user"
        : category.projectId
          ? "project"
          : category.taskId
            ? "task"
            : category.organizationId && category.organizationId !== systemOrgId
              ? "organization"
              : "global";
      const scopeId =
        scope === "organization"
          ? (category.organizationId ?? undefined)
          : scope === "project"
            ? (category.projectId ?? undefined)
            : scope === "task"
              ? (category.taskId ?? undefined)
              : undefined;
      const scopeFields = await resolveShortcutWriteScope({
        scope,
        scopeId,
        userId,
      });

      return agentShortcutToInsert({
        ...d,
        ...scopeFields,
        id: "",
        createdAt: "",
        updatedAt: "",
      } as AgentShortcut);
    }),
  );

  const { data, error } = await shortcutTable(supabase)
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
    ...agentShortcutToInsert(r),
    id: r.id,
  }));

  let saved: AgentShortcut[];
  if (SHORTCUT_STORAGE_CUTOVER) {
    // Postgres rejects `INSERT ... ON CONFLICT` on a trigger-updatable view,
    // so on the mandate storage the "upsert of complete existing rows" (see
    // the docstring — callers always pass EXISTING shortcuts, merged) becomes
    // per-row full UPDATEs through mandate.vw_shortcut's INSTEAD OF trigger.
    const results = await Promise.all(
      rows.map(({ id, ...rest }) =>
        shortcutTable(supabase).update(rest).eq("id", id).select().single(),
      ),
    );
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) throw pgErrorToError(firstError);
    saved = results
      .map((r) => r.data)
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map(dbRowToAgentShortcut);
  } else {
    const { data, error } = await shortcutTable(supabase)
      .upsert(rows, { onConflict: "id" })
      .select();
    if (error) throw pgErrorToError(error);
    saved = (data ?? []).map(dbRowToAgentShortcut);
  }
  if (saved.length > 0) dispatch(upsertShortcuts(saved));
  return saved;
});
