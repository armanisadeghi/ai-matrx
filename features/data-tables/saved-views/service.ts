/**
 * Saved views — the typed read/write layer over `platform.saved_view`.
 *
 * Direct Supabase for READS, RLS as the authorization layer, per the repo's
 * data-flow rule: a plain table read never routes through Next.js or the Python
 * server. WRITES GO THROUGH THE DOORS — `platform` is not a client-writable
 * schema (chair ruling, VERIFIER-8 HIGH-3, 2026-09-21), so create, re-define,
 * rename, default and archive call `public.saved_view_save`,
 * `public.saved_view_set_default` and `public.saved_view_archive`, each of which
 * decides on the one ladder and resolves the row by (id, SURFACE KEY) together.
 *
 * ONE TABLE, EVERY LIST. `surface_key` says which list a view belongs to and
 * `subject_id` narrows it to one record of that list (the dataset, for data
 * tables). Every read filters on BOTH — a view saved for one table surfacing on
 * another would be worse than no saved views at all.
 *
 * The definition is jsonb owned by the calling surface; this layer never
 * interprets it beyond handing it to the surface's parser, which validates.
 */
"use client";

import { supabase } from "@/utils/supabase/client";

import {
  DATA_TABLE_SURFACE_KEY,
  SAVED_VIEW_DEFINITION_VERSION,
  parseSavedViewDefinition,
  type SavedViewDefinition,
} from "./definition";

export type SavedView = {
  id: string;
  name: string;
  description: string | null;
  definition: SavedViewDefinition;
  isDefault: boolean;
  visibility: string;
  createdBy: string | null;
  updatedAt: string;
};

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const TABLE = "saved_view";

function db() {
  return supabase.schema("platform");
}

/** Row → domain. The definition is VALIDATED here, never trusted. */
function toSavedView(row: Record<string, unknown>): SavedView {
  return {
    id: String(row.id),
    name: typeof row.name === "string" ? row.name : "Untitled view",
    description: typeof row.description === "string" ? row.description : null,
    definition: parseSavedViewDefinition(row.definition),
    isDefault: row.is_default === true,
    visibility: typeof row.visibility === "string" ? row.visibility : "personal",
    createdBy: typeof row.created_by === "string" ? row.created_by : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

/**
 * Every saved view for one table.
 *
 * Soft-deleted rows are excluded here rather than relying on RLS: `deleted_at`
 * is a trash marker, and an authenticated policy deliberately does not gate on
 * it (see the platform soft-delete rule), so the caller must.
 */
export async function listSavedViews(args: {
  tableId: string;
}): Promise<ServiceResult<SavedView[]>> {
  const { data, error } = await db()
    .from(TABLE)
    .select(
      "id,name,description,definition,is_default,visibility,created_by,updated_at",
    )
    .eq("surface_key", DATA_TABLE_SURFACE_KEY)
    .eq("subject_id", args.tableId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: (data ?? []).map((row) => toSavedView(row as Record<string, unknown>)),
  };
}

/**
 * The organization a view must be stamped with.
 *
 * A view of a table belongs where the TABLE belongs — not to whichever org the
 * person happens to have active. Stamping the active org would put a view in an
 * organization that cannot see the table it describes.
 *
 * Read explicitly rather than left to a trigger or resolver: every write in this
 * codebase carries its own organization_id, and no database default may choose
 * one.
 */
export async function getTableOrganizationId(
  tableId: string,
): Promise<ServiceResult<string>> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_datasets")
    .select("organization_id")
    .eq("id", tableId)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  const org = (data as { organization_id?: unknown } | null)?.organization_id;
  if (typeof org !== "string") {
    return {
      success: false,
      error: "This table has no organization, so a view cannot be saved to it.",
    };
  }
  return { success: true, data: org };
}

/**
 * A door returns the row as jsonb, or NULL when the view is not reachable under
 * the surface key it was asked for. NULL is a REFUSAL the caller must see, never
 * a silent success — so it becomes the service's own error result.
 */
const GONE =
  "This saved view is no longer available on this table. Reload your saved views.";

export async function createSavedView(args: {
  tableId: string;
  organizationId: string;
  name: string;
  definition: SavedViewDefinition;
  makeDefault?: boolean;
}): Promise<ServiceResult<SavedView>> {
  // THE ORG IS EXPLICIT ON EVERY WRITE — no resolver, no trigger, chooses one.
  // The door refuses a NULL organization by name rather than letting the insert
  // fail on a NOT NULL nobody reads.
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: DATA_TABLE_SURFACE_KEY,
    p_subject_id: args.tableId,
    p_organization_id: args.organizationId,
    p_name: args.name.trim() || "Untitled view",
    p_definition: args.definition as never,
    p_definition_version: SAVED_VIEW_DEFINITION_VERSION,
    p_is_default: args.makeDefault === true,
  });

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: GONE };
  return { success: true, data: toSavedView(data as Record<string, unknown>) };
}

/** Overwrite a view's definition with the current one ("Update this view"). */
export async function updateSavedViewDefinition(args: {
  id: string;
  definition: SavedViewDefinition;
}): Promise<ServiceResult<SavedView>> {
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: DATA_TABLE_SURFACE_KEY,
    p_id: args.id,
    p_definition: args.definition as never,
    p_definition_version: SAVED_VIEW_DEFINITION_VERSION,
  });

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: GONE };
  return { success: true, data: toSavedView(data as Record<string, unknown>) };
}

export async function renameSavedView(args: {
  id: string;
  name: string;
}): Promise<ServiceResult<SavedView>> {
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: DATA_TABLE_SURFACE_KEY,
    p_id: args.id,
    p_name: args.name.trim() || "Untitled view",
  });

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: GONE };
  return { success: true, data: toSavedView(data as Record<string, unknown>) };
}

/**
 * Make one view the default, clearing any previous one.
 *
 * ONE CALL, because the ordering is not the client's to get right. A partial
 * unique index enforces one default per person per table, so the clear has to
 * run before the set — and doing that in two round trips could leave a table
 * with NO default when the second one failed. `saved_view_set_default` does
 * both inside the database, and scopes the clear to the caller's own rows,
 * which is what the index is actually keyed on.
 */
export async function setDefaultSavedView(args: {
  tableId: string;
  id: string | null;
}): Promise<ServiceResult<null>> {
  const { data, error } = await supabase.rpc("saved_view_set_default", {
    p_surface_key: DATA_TABLE_SURFACE_KEY,
    p_subject_id: args.tableId,
    p_id: args.id,
  });

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: GONE };
  return { success: true, data: null };
}

/**
 * Delete a view.
 *
 * SOFT delete: `deleted_at` is the platform's trash marker, and a view someone
 * removed by mistake should be recoverable rather than gone. The list read
 * already excludes trashed rows.
 */
export async function deleteSavedView(args: {
  id: string;
}): Promise<ServiceResult<null>> {
  const { data, error } = await supabase.rpc("saved_view_archive", {
    p_surface_key: DATA_TABLE_SURFACE_KEY,
    p_id: args.id,
  });

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: GONE };
  return { success: true, data: null };
}
