// features/crm/saved-views/service.ts
//
// Reads for CRM smart views go direct to Supabase (`supabase.schema("platform")`) under RLS.
// WRITES GO THROUGH THE DOORS. `platform` is not a client-writable schema (chair ruling,
// VERIFIER-8 HIGH-3, 2026-09-21): the base table refuses every client INSERT/UPDATE/DELETE and
// `public.saved_view_save` / `saved_view_set_default` / `saved_view_archive` decide on the one
// ladder instead. Those doors also resolve a row by (id, SURFACE KEY) together, which no policy
// on this multiplexed table has ever done — so a CRM view can no longer be reached from another
// surface's code path by id alone.
//
// THE VIEW LAW: the list read declares its scope explicitly — views I created
// OR views in one of my organizations. It is a work console (like the outreach
// list console), not a browse surface, so the scope is one blended work scope
// rather than a tab strip. Sharing is the platform `visibility` tier and
// nothing invented: `personal` = mine alone, `internal` = the whole org sees
// (and can edit) it, which is exactly what `iam.has_access` already confers.

import { supabase } from "@/utils/supabase/client";
import type { CrmQueryContext } from "../types";
import type {
  SavedView,
  SavedViewListKey,
  SavedViewRow,
  SavedViewVisibility,
} from "./types";

/**
 * Every list brings its own definition shape; the service is generic over it.
 * `listKey` scopes reads and stamps creates (as `platform.saved_view.surface_key`) so a
 * deals view never appears on the party bar; `parse` is that list's defensive
 * jsonb validator (party: `parseSavedViewDefinition`; deals:
 * `parseDealViewDefinition`).
 */
export interface SavedViewCodec<TDef> {
  listKey: SavedViewListKey;
  parse: (raw: unknown) => TDef;
}

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

/**
 * Saved views live in `platform.saved_view` — ONE table for every list surface
 * in the app, not a CRM-owned one. The shape here was always platform-shaped
 * (its `list_key` was documented as an open set); only its address was CRM's.
 *
 * `list_key` became the namespaced `surface_key` ("crm/parties"), so a CRM view
 * and a data-table view can never be mistaken for each other.
 */
function savedViewDb() {
  return supabase.schema("platform");
}

/** `list_key` → the platform-wide surface key. */
function surfaceKeyFor(listKey: string): string {
  return `crm/${listKey}`;
}

/** Row → the UI shape, with the jsonb definition validated (never trusted raw). */
function hydrate<TDef>(row: SavedViewRow, codec: SavedViewCodec<TDef>): SavedView<TDef> {
  return { ...row, definition: codec.parse(row.definition) };
}

/**
 * Every smart view this user can work: created by me OR living in one of my
 * organizations (declared scope — see the file header). Most-recently-used
 * first, so the bar orders itself around how the floor actually works.
 */
export async function fetchSavedViews<TDef>(
  ctx: CrmQueryContext,
  codec: SavedViewCodec<TDef>,
): Promise<SavedView<TDef>[]> {
  let q = savedViewDb()
    .from("saved_view")
    .select("*")
    .eq("surface_key", surfaceKeyFor(codec.listKey))
    .is("deleted_at", null)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(100);
  q = ctx.orgIds.length
    ? q.or(
        `created_by.eq.${ctx.userId},organization_id.in.(${ctx.orgIds.join(",")})`,
      )
    : q.eq("created_by", ctx.userId);
  const { data, error } = await q;
  if (error) throw pgError(error);
  return (data ?? []).map((row) => hydrate(row, codec));
}

/** One view by id — the enrollment path's read (a queue must know its query). */
export async function fetchSavedView<TDef>(
  id: string,
  codec: SavedViewCodec<TDef>,
): Promise<SavedView<TDef>> {
  const { data, error } = await savedViewDb()
    .from("saved_view")
    .select("*")
    .eq("id", id)
    .eq("surface_key", surfaceKeyFor(codec.listKey))
    .is("deleted_at", null)
    .single();
  if (error) throw pgError(error);
  return hydrate(data, codec);
}

/**
 * A door answers with the row as jsonb, or NULL when the view is not reachable
 * under the surface key it was asked for. NULL is never an empty success here:
 * the caller is told the view is gone rather than shown a silent no-op.
 */
function requireRow(row: unknown, what: string): SavedViewRow {
  if (row === null || row === undefined) {
    throw new Error(
      `${what}: this view is no longer available on this list. Reload your saved views.`,
    );
  }
  return row as SavedViewRow;
}

export async function createSavedView<TDef>(input: {
  name: string;
  description?: string;
  definition: TDef;
  orgId: string;
  visibility: SavedViewVisibility;
  codec: SavedViewCodec<TDef>;
}): Promise<SavedView<TDef>> {
  const name = input.name.trim();
  if (!name) throw new Error("Name the view so the team can find it again");
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: surfaceKeyFor(input.codec.listKey),
    p_organization_id: input.orgId,
    p_name: name,
    p_description: input.description?.trim() || undefined,
    p_set_description: true,
    // Serialized as-is: every codec's TDef is a plain JSON object.
    p_definition: input.definition as never,
    p_visibility: input.visibility,
    p_touch: true,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error(`You already have a view called "${name}"`);
    }
    throw pgError(error);
  }
  return hydrate(requireRow(data, "Save view"), input.codec);
}

/**
 * Rename / re-describe / re-share / re-define — whatever the caller passes.
 *
 * The door takes the surface key as well as the id, so this can only ever touch
 * a view belonging to THIS list.
 */
export async function updateSavedView<TDef>(
  id: string,
  listKey: SavedViewListKey,
  patch: {
    name?: string;
    description?: string | null;
    definition?: TDef;
    visibility?: SavedViewVisibility;
  },
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error("A view needs a name");
  }
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: surfaceKeyFor(listKey),
    p_id: id,
    // `undefined` and not `null` for an omitted optional: the generated Args type
    // for a door is `string | undefined`, because a defaulted plpgsql parameter is
    // absent from the call rather than explicitly NULL — and inside the door
    // `coalesce(p_x, s.x)` treats both the same way anyway.
    p_name: patch.name === undefined ? undefined : patch.name.trim(),
    p_description:
      patch.description === undefined ? undefined : patch.description?.trim() || undefined,
    p_set_description: patch.description !== undefined,
    p_definition: patch.definition === undefined ? undefined : (patch.definition as never),
    p_visibility: patch.visibility ?? undefined,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error(`You already have a view called "${patch.name?.trim()}"`);
    }
    throw pgError(error);
  }
  requireRow(data, "Update view");
}

/**
 * Stamp "a human opened this" — how the bar stays ordered by real use. Fire and
 * forget: a failed touch must never break opening the view, but it IS logged,
 * never swallowed silently.
 */
export async function touchSavedView(
  id: string,
  listKey: SavedViewListKey,
): Promise<void> {
  const { error } = await supabase.rpc("saved_view_save", {
    p_surface_key: surfaceKeyFor(listKey),
    p_id: id,
    p_touch: true,
  });
  if (error) {
    console.error("[crm] saved view touch failed:", pgError(error).message);
  }
}

/** Soft-delete. The query is gone from the bar; the records are untouched. */
export async function deleteSavedView(
  id: string,
  listKey: SavedViewListKey,
): Promise<void> {
  const { data, error } = await supabase.rpc("saved_view_archive", {
    p_surface_key: surfaceKeyFor(listKey),
    p_id: id,
  });
  if (error) throw pgError(error);
  requireRow(data, "Remove view");
}
