/**
 * Saved views — the typed read/write layer over `platform.saved_view`.
 *
 * Direct Supabase, RLS as the authorization layer, per the repo's data-flow
 * rule: this is a plain table read/write, so it never routes through Next.js or
 * the Python server.
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

export async function createSavedView(args: {
  tableId: string;
  organizationId: string;
  name: string;
  definition: SavedViewDefinition;
  makeDefault?: boolean;
}): Promise<ServiceResult<SavedView>> {
  // THE ORG IS EXPLICIT ON EVERY WRITE — no resolver, no trigger, chooses one.
  const { data, error } = await db()
    .from(TABLE)
    .insert({
      name: args.name.trim() || "Untitled view",
      surface_key: DATA_TABLE_SURFACE_KEY,
      subject_id: args.tableId,
      organization_id: args.organizationId,
      definition: args.definition as never,
      definition_version: SAVED_VIEW_DEFINITION_VERSION,
      is_default: args.makeDefault === true,
    })
    .select(
      "id,name,description,definition,is_default,visibility,created_by,updated_at",
    )
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: toSavedView(data as Record<string, unknown>) };
}

/** Overwrite a view's definition with the current one ("Update this view"). */
export async function updateSavedViewDefinition(args: {
  id: string;
  definition: SavedViewDefinition;
}): Promise<ServiceResult<SavedView>> {
  const { data, error } = await db()
    .from(TABLE)
    .update({
      definition: args.definition as never,
      definition_version: SAVED_VIEW_DEFINITION_VERSION,
    })
    .eq("id", args.id)
    .select(
      "id,name,description,definition,is_default,visibility,created_by,updated_at",
    )
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: toSavedView(data as Record<string, unknown>) };
}

export async function renameSavedView(args: {
  id: string;
  name: string;
}): Promise<ServiceResult<SavedView>> {
  const { data, error } = await db()
    .from(TABLE)
    .update({ name: args.name.trim() || "Untitled view" })
    .eq("id", args.id)
    .select(
      "id,name,description,definition,is_default,visibility,created_by,updated_at",
    )
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: toSavedView(data as Record<string, unknown>) };
}

/**
 * Make one view the default, clearing any previous one.
 *
 * Two statements, and the CLEAR runs first on purpose: a partial unique index
 * enforces one default per person per table, so setting before clearing would
 * be refused by the database. Clearing first can at worst leave no default —
 * recoverable and visible — where the other order simply fails.
 */
export async function setDefaultSavedView(args: {
  tableId: string;
  id: string | null;
}): Promise<ServiceResult<null>> {
  const clear = await db()
    .from(TABLE)
    .update({ is_default: false })
    .eq("surface_key", DATA_TABLE_SURFACE_KEY)
    .eq("subject_id", args.tableId)
    .eq("is_default", true);

  if (clear.error) return { success: false, error: clear.error.message };
  if (args.id === null) return { success: true, data: null };

  const { error } = await db()
    .from(TABLE)
    .update({ is_default: true })
    .eq("id", args.id);

  if (error) return { success: false, error: error.message };
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
  const { error } = await db()
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", args.id);

  if (error) return { success: false, error: error.message };
  return { success: true, data: null };
}
