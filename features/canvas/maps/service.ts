// features/canvas/maps/service.ts
//
// Browser → Supabase directly (CLAUDE.md § Data flow). Maps are canvas items,
// so every write goes through the EXISTING canvasItemsService — this module
// adds no second write path, only the read shape the entity-list shell wants
// and the map-specific create/save verbs on top of it.
//
// No RPCs: canvas_items is a per-user table, the only scope declared is
// "mine", and PostgREST can serve that with a filtered select. Hand-writing a
// canvas_list_scoped RPC for one scope would be a second query authority for
// rows the browser can already read.

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { buildSearchOr } from "@/utils/supabase-search";
import type { DiagramData } from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import { canvasItemsService } from "@/features/canvas/services/canvasItemsService";
import {
  MAP_CANVAS_TYPE,
  diagramFromCanvasContent,
  starterMap,
  type MapListRow,
} from "./types";

/** Columns the list needs. `content` comes along for the box/arrow counts. */
const LIST_COLUMNS =
  "id,title,description,content,tags,is_favorited,is_archived,is_public,share_token,created_at,updated_at";

const SORTABLE: Record<string, string> = {
  title: "title",
  updated_at: "updated_at",
  created_at: "created_at",
  box_count: "updated_at", // derived client-side; fall back to a real column
  arrow_count: "updated_at",
};

function toRow(raw: Record<string, unknown>): MapListRow {
  const title = typeof raw.title === "string" && raw.title ? raw.title : "Untitled map";
  const diagram = diagramFromCanvasContent(raw.content, title);
  return {
    id: String(raw.id),
    title,
    description: typeof raw.description === "string" ? raw.description : null,
    box_count: diagram?.nodes.length ?? 0,
    arrow_count: diagram?.edges.length ?? 0,
    is_favorited: raw.is_favorited === true,
    is_archived: raw.is_archived === true,
    is_public: raw.is_public === true,
    share_token: typeof raw.share_token === "string" ? raw.share_token : null,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
  };
}

export async function fetchMapListPage(
  query: EntityListQuery,
  sort: EntityListSort,
): Promise<EntityListPage<MapListRow>> {
  const userId = requireUserId();
  let q = supabase
    .schema("canvas")
    .from("canvas_items")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null)
    .eq("user_id", userId)
    .eq("type", MAP_CANVAS_TYPE);

  if (query.archived === "active") q = q.eq("is_archived", false);
  else if (query.archived === "archived") q = q.eq("is_archived", true);

  const search = query.search.trim();
  if (search) q = q.or(buildSearchOr(search, ["title", "description"]));

  const column = SORTABLE[sort.sort] ?? "updated_at";
  q = q.order(column, { ascending: sort.direction === "asc" });

  const from = (query.page - 1) * sort.pageSize;
  q = q.range(from, from + sort.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message || "Could not load your maps.");

  return {
    rows: (data ?? []).map((r) => toRow(r as Record<string, unknown>)),
    total: count ?? 0,
  };
}

export async function fetchMapScopeCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const userId = requireUserId();
  let q = supabase
    .schema("canvas")
    .from("canvas_items")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("user_id", userId)
    .eq("type", MAP_CANVAS_TYPE);

  if (query.archived === "active") q = q.eq("is_archived", false);
  else if (query.archived === "archived") q = q.eq("is_archived", true);

  const search = query.search.trim();
  if (search) q = q.or(buildSearchOr(search, ["title", "description"]));

  const { count, error } = await q;
  if (error) throw new Error(error.message || "Could not count your maps.");
  return { byKind: { mine: count ?? 0 }, narrow: {} };
}

/**
 * No server-computed facets: a per-user map library has no finite dimension
 * worth faceting yet. Returning an empty set is honest; inventing one from the
 * loaded page would be a filter that silently only sees the current page.
 */
export async function fetchMapFacets(
  _query: EntityListQuery,
): Promise<EntityFacets> {
  return { byKind: {} };
}

// ── Map verbs — thin over canvasItemsService, which owns every write ────────

export interface CreateMapResult {
  id: string | null;
  /** The content already existed byte-for-byte; `id` points at that map. */
  isDuplicate: boolean;
  error: string | null;
}

export async function createMap(
  title: string,
  diagram?: DiagramData,
): Promise<CreateMapResult> {
  const content = {
    type: MAP_CANVAS_TYPE,
    data: diagram ?? starterMap(title),
    metadata: { title },
  };
  const { data, isDuplicate, error } = await canvasItemsService.save({
    content,
    title,
  });
  return {
    id: data?.id ?? null,
    isDuplicate,
    error: error ? (error.message ?? String(error)) : null,
  };
}

export async function getMap(
  id: string,
): Promise<{ row: MapListRow | null; diagram: DiagramData | null; error: string | null }> {
  const { data, error } = await canvasItemsService.getById(id);
  if (error || !data) {
    return {
      row: null,
      diagram: null,
      error: error ? (error.message ?? String(error)) : "Map not found.",
    };
  }
  const title = data.title ?? "Untitled map";
  return {
    row: toRow({
      id: data.id,
      title: data.title,
      description: data.description,
      content: data.content,
      tags: data.tags,
      is_favorited: data.is_favorited,
      is_archived: data.is_archived,
      is_public: data.is_public,
      share_token: data.share_token,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }),
    diagram: diagramFromCanvasContent(data.content, title),
    error: null,
  };
}

export async function saveMap(
  id: string,
  diagram: DiagramData,
): Promise<{ error: string | null }> {
  const { error } = await canvasItemsService.update(id, {
    title: diagram.title,
    content: {
      type: MAP_CANVAS_TYPE,
      data: diagram,
      metadata: { title: diagram.title },
    },
  });
  return { error: error ? (error.message ?? String(error)) : null };
}

/**
 * Persist an inline edit from the list table.
 *
 * The name is stored TWICE by design — `canvas_items.title` (what the library
 * lists) and `DiagramData.title` (what the map itself displays). Renaming from
 * the list has to move both or the list and the canvas disagree about what the
 * thing is called.
 */
export async function saveMapRowEdit(
  row: MapListRow,
  edit: Partial<MapListRow>,
): Promise<void> {
  if (edit.title === undefined && edit.description === undefined) return;

  if (edit.title !== undefined) {
    const { diagram } = await getMap(row.id);
    if (diagram) {
      const { error } = await canvasItemsService.update(row.id, {
        title: edit.title,
        description: edit.description ?? undefined,
        content: {
          type: MAP_CANVAS_TYPE,
          data: { ...diagram, title: edit.title },
          metadata: { title: edit.title },
        },
      });
      if (error) throw new Error(error.message ?? String(error));
      return;
    }
  }

  const { error } = await canvasItemsService.update(row.id, {
    title: edit.title,
    description: edit.description ?? undefined,
  });
  if (error) throw new Error(error.message ?? String(error));
}

export async function deleteMap(id: string): Promise<{ error: string | null }> {
  const { error } = await canvasItemsService.delete(id);
  return { error: error ? (error.message ?? String(error)) : null };
}

export async function duplicateMap(
  id: string,
): Promise<CreateMapResult> {
  const { diagram, row, error } = await getMap(id);
  if (error || !diagram || !row) {
    return { id: null, isDuplicate: false, error: error ?? "Could not copy that map." };
  }
  const title = `${row.title} (copy)`;
  return createMap(title, { ...diagram, title });
}
