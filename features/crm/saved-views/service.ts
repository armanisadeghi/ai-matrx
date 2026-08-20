// features/crm/saved-views/service.ts
//
// Reads/writes for CRM smart views — direct browser → Supabase
// (`supabase.schema("crm")`), RLS as the authorization layer.
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
  SavedViewUpdate,
  SavedViewVisibility,
} from "./types";

/**
 * Every list brings its own definition shape; the service is generic over it.
 * `listKey` scopes reads and stamps creates (`crm.saved_view.list_key`) so a
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

function crm() {
  return supabase.schema("crm");
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
  let q = crm()
    .from("saved_view")
    .select("*")
    .eq("list_key", codec.listKey)
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
  const { data, error } = await crm()
    .from("saved_view")
    .select("*")
    .eq("id", id)
    .eq("list_key", codec.listKey)
    .is("deleted_at", null)
    .single();
  if (error) throw pgError(error);
  return hydrate(data, codec);
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
  const { data, error } = await crm()
    .from("saved_view")
    .insert({
      name,
      description: input.description?.trim() || null,
      // Serialized as-is: every codec's TDef is a plain JSON object.
      definition: input.definition as SavedViewRow["definition"],
      list_key: input.codec.listKey,
      organization_id: input.orgId,
      visibility: input.visibility,
      last_used_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(`You already have a view called "${name}"`);
    }
    throw pgError(error);
  }
  return hydrate(data, input.codec);
}

/** Rename / re-describe / re-share / re-define — whatever the caller passes. */
export async function updateSavedView<TDef>(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    definition?: TDef;
    visibility?: SavedViewVisibility;
  },
): Promise<void> {
  const next: SavedViewUpdate = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("A view needs a name");
    next.name = name;
  }
  if (patch.description !== undefined) {
    next.description = patch.description?.trim() || null;
  }
  if (patch.definition !== undefined)
    next.definition = patch.definition as SavedViewRow["definition"];
  if (patch.visibility !== undefined) next.visibility = patch.visibility;
  if (Object.keys(next).length === 0) return;

  const { error } = await crm()
    .from("saved_view")
    .update(next)
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      throw new Error(`You already have a view called "${patch.name?.trim()}"`);
    }
    throw pgError(error);
  }
}

/**
 * Stamp "a human opened this" — how the bar stays ordered by real use. Fire and
 * forget: a failed touch must never break opening the view, but it IS logged,
 * never swallowed silently.
 */
export async function touchSavedView(id: string): Promise<void> {
  const { error } = await crm()
    .from("saved_view")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[crm] saved view touch failed:", pgError(error).message);
  }
}

/** Soft-delete. The query is gone from the bar; the records are untouched. */
export async function deleteSavedView(id: string): Promise<void> {
  const { error } = await crm()
    .from("saved_view")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw pgError(error);
}
