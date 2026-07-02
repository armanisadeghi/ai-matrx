/**
 * windowPersistenceService.ts
 *
 * Supabase CRUD for the window_sessions table.
 * All operations use the browser singleton client — RLS ensures each user
 * can only read/write their own rows.
 *
 * No Next.js API route is needed; ownership is enforced at the DB layer.
 */

import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Database, Json } from "@/types/database.types";
import type { PanelState, WindowSessionRow } from "../registry/windowRegistryTypes";

// ─── DB row shape guard ────────────────────────────────────────────────────────

type WindowSessionDbRow = Database["public"]["Tables"]["window_sessions"]["Row"];

// Structural guard: WindowSessionRow's non-Json fields must line up with the
// generated table row (panel_state/data stay narrower than `Json` here by
// design — narrowed via the write/read casts below, per the type-safety
// skill's Pattern 4). Breaks at compile time if the DB adds/drops/retypes a
// column this interface also declares.
type _CheckWindowSessionRow = Omit<WindowSessionRow, "panel_state" | "data"> extends Omit<
  WindowSessionDbRow,
  "panel_state" | "data" | "metadata" | "organization_id" | "created_by" | "updated_by" | "deleted_at" | "version"
>
  ? true
  : false;
declare const _checkWindowSessionRow: _CheckWindowSessionRow;
true satisfies typeof _checkWindowSessionRow;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaveWindowSessionParams {
  /** Existing row id — pass undefined to INSERT a new row */
  sessionId?: string;
  userId: string;
  windowType: string;
  label: string;
  panelState: PanelState;
  data: Record<string, unknown>;
}

// ─── Save (upsert) ────────────────────────────────────────────────────────────

/**
 * Create or update a window session row.
 * Returns the row id (useful when creating a new row).
 *
 * Strategy:
 *  - If sessionId is provided → UPDATE that row.
 *  - If sessionId is undefined → INSERT a new row and return the generated id.
 *
 * Both paths use upsert via `onConflict: 'id'` so callers don't need to
 * track whether a row exists yet — first save always succeeds.
 */
export async function saveWindowSession(
  params: SaveWindowSessionParams,
): Promise<string> {
  const { sessionId, userId, windowType, label, panelState, data } = params;

  // MATRX-EXCEPTION: both panel_state and data are JSONB columns in
  // Supabase; the generated schema types them as `Json` (a recursive
  // primitive/object/array union) that TypeScript cannot structurally
  // verify a concrete object shape against. Our caller-side payload uses
  // the narrower PanelState / Record<string, unknown> shapes for
  // ergonomics — this is the accepted write-direction cast (mirrors the
  // read-side DbRpcRow-guard exception, but in reverse: we're asserting a
  // concrete, JSON-serializable object satisfies the wide `Json` union on
  // write, not narrowing an already-Json value on read).
  const row = {
    ...(sessionId ? { id: sessionId } : {}),
    user_id: userId,
    organization_id: await ensureOrgId(undefined),
    window_type: windowType,
    label,
    panel_state: panelState as unknown as Json,
    data: data as unknown as Json,
  };

  const { data: result, error } = await supabase
    .from("window_sessions")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .single();

  if (error) {
    throw new Error(
      `windowPersistenceService.saveWindowSession failed: ${error.message}`,
    );
  }

  return result.id as string;
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all session rows for a user, ordered by updated_at descending
 * (most-recently-used windows come first).
 */
export async function loadWindowSessions(
  userId: string,
): Promise<WindowSessionRow[]> {
  const { data, error } = await supabase
    .from("window_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(
      `windowPersistenceService.loadWindowSessions failed: ${error.message}`,
    );
  }

  // Guarded by _CheckWindowSessionRow above — panel_state/data stay `Json`
  // on the DB side and are narrowed at the call site (Pattern 4), never
  // given a concrete shape via this cast.
  return (data ?? []) as unknown as WindowSessionRow[];
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a single session row by id.
 * Called when the user closes a window — removes it from the "open windows" set
 * so it doesn't reopen on next load.
 */
export async function deleteWindowSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("window_sessions")
    .delete()
    .eq("id", sessionId);

  if (error) {
    throw new Error(
      `windowPersistenceService.deleteWindowSession failed: ${error.message}`,
    );
  }
}

/**
 * Delete ALL session rows for a user.
 * Useful for a "close all windows" action or a settings "clear session" button.
 */
export async function deleteAllWindowSessions(userId: string): Promise<void> {
  const { error } = await supabase
    .from("window_sessions")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      `windowPersistenceService.deleteAllWindowSessions failed: ${error.message}`,
    );
  }
}

/**
 * One-time slug migration. Rewrites any rows whose `window_type` matches
 * `fromSlug` to `toSlug` for the given user. Called by
 * WindowPersistenceManager on hydration to repair `window_sessions` rows
 * stranded by registry renames (e.g. quick-ai-results → quick-chat-history).
 * Returns the number of rows updated.
 */
export async function migrateWindowSessionSlug(
  userId: string,
  fromSlug: string,
  toSlug: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("window_sessions")
    .update({ window_type: toSlug })
    .eq("user_id", userId)
    .eq("window_type", fromSlug)
    .select("id");

  if (error) {
    throw new Error(
      `windowPersistenceService.migrateWindowSessionSlug failed: ${error.message}`,
    );
  }

  return data?.length ?? 0;
}
