/**
 * SAVED VIEWS — the shared keyword-table layer's save/restore capability
 * (KI-021, moved 2026-08-24 from `keyword-workbench/data.ts`).
 *
 * A saved view IS a `KeywordTableState` snapshot (columns, filters, sort,
 * page size), stored verbatim via `state.ts`'s `viewStateFor` /
 * `stateFromViewState` — this module is only the CRUD around that snapshot.
 * It is a keyword-table-level capability: any surface that renders
 * `<KeywordTable>` can list/save/delete its own views by passing its own
 * `surface` id, one row per (site, surface, name). The Keyword Workbench is
 * the only surface with a tabs UI today (`keyword-workbench/components/
 * SavedViewTabs.tsx`) — a second surface adopting views mounts its own UI
 * over these same three functions rather than a second data layer.
 *
 * SoR: `seo.keyword_saved_view` (`gsc_saved_views` / `gsc_save_view` /
 * `gsc_delete_saved_view`, all site-editor guarded). The RPCs already accept
 * `p_surface` — `'keyword_workbench'` is only the column DEFAULT, kept for
 * the rows written before this module existed.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage, makeAssertData } from "@/utils/errors";
import type { Json } from "@/types/database.types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your keyword workbench");

/**
 * The assignment RPCs answer refusals in plain sentences written for the
 * person reading them. Strip the machine code, keep the sentence.
 */
const GOVERNED = /^(seo_[a-z_]+|gsc_[a-z_]+):\s*/;

function assertGoverned<T>(data: T | null, error: unknown, action: string): T {
  if (error) {
    const message = extractErrorMessage(error).split(" · ")[0];
    const governed = message.match(GOVERNED);
    if (governed) {
      throw new Error(message.slice(governed[0].length), { cause: error });
    }
  }
  return assertData(data, error, action) as T;
}

/** The keyword-table surface that stores saved views before this module existed. */
export const KEYWORD_WORKBENCH_VIEW_SURFACE = "keyword_workbench";

export interface SavedView {
  id: string;
  name: string;
  surface: string;
  state: Json;
  position: number | null;
  shared: boolean;
  createdBy: string | null;
  updatedAt: string;
}

type SavedViewRow = {
  id: string;
  name: string;
  surface: string;
  state: Json;
  sort_position: number | null;
  shared: boolean;
  created_by: string | null;
  updated_at: string;
};

function toSavedView(row: SavedViewRow): SavedView {
  return {
    id: row.id,
    name: row.name,
    surface: row.surface,
    state: row.state,
    position: row.sort_position,
    shared: row.shared,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

export async function listSavedViews(
  siteId: string,
  surface: string = KEYWORD_WORKBENCH_VIEW_SURFACE,
  signal?: AbortSignal,
): Promise<SavedView[]> {
  const response = await (await seoDb())
    .rpc("gsc_saved_views", { p_site_id: siteId, p_surface: surface })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error, "load your saved views");
  return (rows as SavedViewRow[]).map(toSavedView);
}

export async function saveView(input: {
  siteId: string;
  name: string;
  /** The KeywordTable state snapshot, stored verbatim (`viewStateFor`). */
  state: Record<string, string>;
  surface?: string;
  id?: string | null;
  position?: number | null;
  shared?: boolean;
}): Promise<SavedView> {
  const response = await (await seoDb()).rpc("gsc_save_view", {
    p_site_id: input.siteId,
    p_name: input.name,
    p_state: input.state,
    p_surface: input.surface ?? KEYWORD_WORKBENCH_VIEW_SURFACE,
    ...(input.id ? { p_id: input.id } : {}),
    ...(input.position != null ? { p_position: input.position } : {}),
    ...(input.shared != null ? { p_shared: input.shared } : {}),
  });
  const rows = assertGoverned(response.data, response.error, "save that view");
  const row = (rows as SavedViewRow[])[0];
  if (!row) throw new Error("The view saved but came back empty — reload the page.");
  return toSavedView(row);
}

export async function deleteSavedView(
  siteId: string,
  id: string,
): Promise<void> {
  const response = await (await seoDb()).rpc("gsc_delete_saved_view", {
    p_site_id: siteId,
    p_id: id,
  });
  assertGoverned(response.data, response.error, "delete that view");
}
