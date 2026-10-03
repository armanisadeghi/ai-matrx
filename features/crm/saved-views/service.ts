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
// THE VIEW LAW: the list read declares its scope through the lane reader
// (`public.saved_view_list_lanes`): Mine, Shared with me, Organization. The bar
// shows them as sections of its one row, never a tab strip of its own. Sharing is the platform `visibility` tier and
// nothing invented: `personal` = mine alone, `internal` = the whole org sees
// (and can edit) it, which is exactly what `iam.has_access` already confers.

import { supabase } from "@/utils/supabase/client";
import { readListRpc } from "@/lib/entity-list/readListRpc";
import type { LaneRow } from "@/lib/entity-list/laneRows";
import type { CrmQueryContext } from "../types";
import type {
  SavedView,
  SavedViewListKey,
  SavedViewRow,
  SavedViewVisibility,
} from "./types";
import { postgrestError } from "@/lib/failure/postgrestError";

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
  return postgrestError(error, {
    action: "loading the saved views",
    fallback: "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  });
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

/** Where a view sits for the person reading it — the sections of the views bar. */
export type SavedViewSection = "mine" | "shared" | "orgs";

/**
 * Every smart view this user can work, in the lanes `public.saved_view_list_lanes`
 * declares for this surface (SECURITY INVOKER — row security stays the ceiling):
 * Mine, Shared with me (an explicit grant to me or one of my organizations), and
 * Organization (other people's views in my organizations, as each row's Shown to
 * allows). Each view carries its section: Mine wins, then Shared, then Organization.
 * Most-recently-used first, so the bar orders itself around how the floor works.
 */
export async function fetchSavedViews<TDef>(
  _ctx: CrmQueryContext,
  codec: SavedViewCodec<TDef>,
): Promise<Array<SavedView<TDef> & { section: SavedViewSection }>> {
  const { data: lanes, error: laneError } = await readListRpc<LaneRow>(
    "saved_view_list_lanes",
    { p_surface_key: surfaceKeyFor(codec.listKey), p_org_id: null },
    { order: ["lane", "id"] },
  );
  if (laneError) throw pgError(laneError);
  const section = new Map<string, SavedViewSection>();
  const rank: Record<SavedViewSection, number> = { mine: 0, shared: 1, orgs: 2 };
  for (const row of lanes ?? []) {
    if (row.lane !== "mine" && row.lane !== "shared" && row.lane !== "orgs") continue;
    const prev = section.get(row.id);
    if (!prev || rank[row.lane] < rank[prev]) section.set(row.id, row.lane);
  }
  if (section.size === 0) return [];
  const { data, error } = await savedViewDb()
    .from("saved_view")
    .select("*")
    .in("id", [...section.keys()])
    .is("deleted_at", null)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(100);
  if (error) throw pgError(error);
  return (data ?? []).map((row) => ({
    ...hydrate(row, codec),
    section: section.get(row.id) ?? "orgs",
  }));
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
