"use client";

import { readAllRows } from "@ai-matrx/data/db";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { parseTableViewSnapshot, type TableViewSnapshot } from "@ai-matrx/design-system/data-table";
import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

/** Host persistence only. The package owns the view definition and controls. */
export interface TableViewActor {
  userId: string;
  accessToken: string;
  organizationId: string | null;
}
type ViewRow = Database["platform"]["Tables"]["saved_view"]["Row"];
export interface PersonalTableView {
  id: string;
  name: string;
  version: number;
  snapshot: TableViewSnapshot;
}
const surfaceKey = (tableId: string) => `matrx/table/${tableId}`;
const definition = (snapshot: TableViewSnapshot) => ({
  __kind: "matrx-table-view",
  version: 1,
  format: "canonical-table-snapshot",
  snapshot: JSON.stringify(snapshot),
});
function decode(row: ViewRow): PersonalTableView {
  const stored = row.definition;
  if (!stored || typeof stored !== "object" || Array.isArray(stored) ||
    !(KIND_KEY in stored) || !("format" in stored) || !("version" in stored) || !("snapshot" in stored) ||
    stored[KIND_KEY] !== "matrx-table-view" || stored.format !== "canonical-table-snapshot" ||
    stored.version !== 1 || typeof stored.snapshot !== "string") {
    throw new Error(`Saved view “${row.name}” has an unsupported definition. The table remains unchanged.`);
  }
  let raw: unknown;
  try { raw = JSON.parse(stored.snapshot); }
  catch { throw new Error(`Saved view “${row.name}” could not be read. The table remains unchanged.`); }
  const snapshot = parseTableViewSnapshot(raw);
  if (!snapshot) throw new Error(`Saved view “${row.name}” is invalid. The table remains unchanged.`);
  return { id: row.id, name: row.name, version: row.version, snapshot };
}

export async function listPersonalTableViews(actor: TableViewActor, tableId: string, signal: AbortSignal) {
  const rows = await readAllRows<ViewRow>(({ from, to }) => supabase.schema("platform")
    .from("saved_view").select("*", { count: "exact" })
    .eq("surface_key", surfaceKey(tableId)).eq("created_by", actor.userId)
    .eq("visibility", "personal").is("deleted_at", null)
    .order("name").order("id").range(from, to)
    .setHeader("Authorization", `Bearer ${actor.accessToken}`).abortSignal(signal),
  { label: "Personal canonical table views" });
  return rows.map(decode);
}
export async function createPersonalTableView(actor: TableViewActor, tableId: string, name: string, snapshot: TableViewSnapshot, signal: AbortSignal) {
  if (!actor.organizationId) throw new Error("Choose an organization from the page header before saving a view.");
  if (!name.trim()) throw new Error("Give this view a name.");
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: surfaceKey(tableId), p_organization_id: actor.organizationId,
    p_name: name.trim(), p_visibility: "personal", p_definition_version: 1,
    p_definition: definition(snapshot) as never,
  }).abortSignal(signal).setHeader("Authorization", `Bearer ${actor.accessToken}`);
  if (error) throw error;
  if (!data) throw new Error("This table's saved views could not be written. Save your current layout with a new name.");
  return decode(data as unknown as ViewRow);
}
/**
 * THE CAS MOVED INTO THE DOOR. `saved_view_save` takes `p_expected_version` and answers NULL on
 * a miss, which is one statement instead of the read-then-write round trip `guardedUpdate` ran
 * from the browser — and the door resolves the row by (id, SURFACE KEY) together, so a personal
 * table view can no longer be reached by id from another list surface's code path.
 */
export async function updatePersonalTableView(actor: TableViewActor, tableId: string, view: PersonalTableView, snapshot: TableViewSnapshot, signal: AbortSignal) {
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: surfaceKey(tableId), p_id: view.id, p_expected_version: view.version,
    p_definition: definition(snapshot) as never,
  }).abortSignal(signal).setHeader("Authorization", `Bearer ${actor.accessToken}`);
  if (error) throw error;
  // NULL is the CAS miss OR an absent row, and the door deliberately does not say which — a
  // door never tells a caller that somebody else`s row exists. Both mean the same thing here.
  if (!data) throw new Error("This saved view changed elsewhere or is no longer available. Your table is unchanged. Reload saved views and select the newer view, or save your current layout with a new name.");
  return decode(data as unknown as ViewRow);
}

export async function renamePersonalTableView(actor: TableViewActor, tableId: string, view: PersonalTableView, name: string, signal: AbortSignal) {
  if (!name.trim()) throw new Error("Give this view a name.");
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: surfaceKey(tableId), p_id: view.id, p_expected_version: view.version,
    p_name: name.trim(),
  }).abortSignal(signal).setHeader("Authorization", `Bearer ${actor.accessToken}`);
  if (error) throw error;
  if (!data) throw new Error("This view changed elsewhere or is no longer available. Reload views before renaming it.");
  return decode(data as unknown as ViewRow);
}

// ─── ANY LIST SURFACE (not only package tables) ─────────────────────────────
//
// The same `platform.saved_view` store and the same two doors
// (`saved_view_save`, `saved_view_archive`), for a surface that owns its own
// definition shape — the Knowledge hub (`knowledge/hub`) is the first. The
// surface validates `definition` itself; this layer only moves rows.

export type SavedViewVisibility = "personal" | "internal" | "link" | "public";

export interface SurfaceView {
  id: string;
  name: string;
  surfaceKey: string;
  organizationId: string;
  createdBy: string | null;
  visibility: SavedViewVisibility;
  version: number;
  definition: unknown;
  lastUsedAt: string | null;
  sortOrder: number | null;
}

type SurfaceViewRow = Pick<ViewRow,
  "id" | "name" | "surface_key" | "organization_id" | "created_by" | "visibility" |
  "version" | "definition" | "last_used_at" | "sort_order">;

export function surfaceViewFromRow(row: SurfaceViewRow): SurfaceView {
  return {
    id: row.id,
    name: row.name,
    surfaceKey: row.surface_key,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    visibility: row.visibility as SavedViewVisibility,
    version: row.version,
    definition: row.definition,
    lastUsedAt: row.last_used_at,
    sortOrder: row.sort_order === null ? null : Number(row.sort_order),
  };
}

function doorError(error: unknown, fallback: string): Error {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return new Error(error.message.replace(/^saved_view_(save|archive): /, ""));
  return new Error(fallback);
}

/**
 * Every live view of one surface the caller can read, in the declared scope:
 * made by me, OR in one of `organizationIds` (RLS then admits only the shared
 * ones). Capped at 500 — a surface with more views than that is a defect in
 * its own right, and the cap is announced by the caller, never hidden.
 */
export async function listSurfaceViews(
  surfaceKey: string,
  scope: { userId: string; organizationIds: string[] },
  signal?: AbortSignal,
): Promise<SurfaceView[]> {
  let q = supabase.schema("platform").from("saved_view")
    .select("id,name,surface_key,organization_id,created_by,visibility,version,definition,last_used_at,sort_order")
    .eq("surface_key", surfaceKey).is("deleted_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true }).order("id").limit(500);
  q = scope.organizationIds.length
    ? q.or(`created_by.eq.${scope.userId},organization_id.in.(${scope.organizationIds.join(",")})`)
    : q.eq("created_by", scope.userId);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw doorError(error, "Could not read saved views.");
  return ((data ?? []) as SurfaceViewRow[]).map(surfaceViewFromRow);
}

export async function createSurfaceView(input: {
  surfaceKey: string;
  organizationId: string;
  name: string;
  visibility: SavedViewVisibility;
  definition: Record<string, unknown>;
  definitionVersion: number;
}): Promise<SurfaceView> {
  if (!input.name.trim()) throw new Error("Give this view a name.");
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: input.surfaceKey, p_organization_id: input.organizationId,
    p_name: input.name.trim(), p_visibility: input.visibility,
    p_definition_version: input.definitionVersion, p_definition: input.definition as never,
    p_touch: true,
  });
  if (error) throw doorError(error, "The view could not be saved.");
  if (!data) throw new Error("The view could not be saved. Nothing was written.");
  return surfaceViewFromRow(data as unknown as SurfaceViewRow);
}

/**
 * One door for rename / save changes / share / touch. `expectedVersion`
 * makes it a compare-and-swap: NULL back means the view changed elsewhere or
 * is gone (the door does not say which, by design) — both read the same.
 */
export async function updateSurfaceView(input: {
  surfaceKey: string;
  id: string;
  expectedVersion?: number;
  name?: string;
  visibility?: SavedViewVisibility;
  definition?: Record<string, unknown>;
  touch?: boolean;
}): Promise<SurfaceView> {
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: input.surfaceKey, p_id: input.id,
    ...(input.expectedVersion !== undefined ? { p_expected_version: input.expectedVersion } : {}),
    ...(input.name !== undefined ? { p_name: input.name } : {}),
    ...(input.visibility !== undefined ? { p_visibility: input.visibility } : {}),
    ...(input.definition !== undefined ? { p_definition: input.definition as never } : {}),
    ...(input.touch ? { p_touch: true } : {}),
  });
  if (error) throw doorError(error, "The view could not be changed.");
  if (!data) throw new Error("This view changed elsewhere or is no longer available. Nothing was changed — reload the views and try again.");
  return surfaceViewFromRow(data as unknown as SurfaceViewRow);
}

/** Soft delete (`deleted_at`) through the archive door. */
export async function archiveSurfaceView(input: { surfaceKey: string; id: string; expectedVersion?: number }): Promise<void> {
  const { data, error } = await supabase.rpc("saved_view_archive", {
    p_surface_key: input.surfaceKey, p_id: input.id,
    ...(input.expectedVersion !== undefined ? { p_expected_version: input.expectedVersion } : {}),
  });
  if (error) throw doorError(error, "The view could not be deleted.");
  if (!data) throw new Error("This view changed elsewhere or is already gone. Reload the views.");
}
