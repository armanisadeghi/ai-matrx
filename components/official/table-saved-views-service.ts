"use client";

import { guardedUpdate, readAllRows } from "@ai-matrx/data/db";
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
  const { data, error } = await supabase.schema("platform").from("saved_view")
    .insert({ name: name.trim(), organization_id: actor.organizationId, created_by: actor.userId,
      surface_key: surfaceKey(tableId), visibility: "personal", definition_version: 1,
      definition: definition(snapshot) })
    .select("*").abortSignal(signal).single().setHeader("Authorization", `Bearer ${actor.accessToken}`);
  if (error) throw error;
  return decode(data);
}
export async function updatePersonalTableView(actor: TableViewActor, tableId: string, view: PersonalTableView, snapshot: TableViewSnapshot, signal: AbortSignal) {
  const result = await guardedUpdate<ViewRow>({
    expectedVersion: view.version,
    applyUpdate: ({ expectedVersion, nextVersion }) => supabase.schema("platform").from("saved_view")
      .update({ definition: definition(snapshot), version: nextVersion, updated_by: actor.userId })
      .eq("id", view.id).eq("version", expectedVersion).eq("created_by", actor.userId)
      .eq("surface_key", surfaceKey(tableId)).eq("visibility", "personal").is("deleted_at", null)
      .select("*").abortSignal(signal).maybeSingle().setHeader("Authorization", `Bearer ${actor.accessToken}`),
    fetchCurrent: () => supabase.schema("platform").from("saved_view").select("*")
      .eq("id", view.id).eq("created_by", actor.userId).eq("surface_key", surfaceKey(tableId))
      .eq("visibility", "personal").is("deleted_at", null)
      .abortSignal(signal).maybeSingle().setHeader("Authorization", `Bearer ${actor.accessToken}`),
  });
  if (result.status === "conflict") throw new Error("This saved view changed elsewhere. Your table is unchanged. Reload saved views and select the newer view, or save your current layout with a new name.");
  if (result.status === "not_found") throw new Error("This saved view is no longer available. Save your current layout with a new name.");
  return decode(result.row);
}
