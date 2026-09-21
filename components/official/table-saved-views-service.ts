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
