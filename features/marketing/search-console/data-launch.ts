/**
 * New Pages tracker data access — direct `web.page` reads/writes on the
 * `launch_tracking` jsonb column (team-visible, under existing page RLS)
 * plus the `seo.gsc_perf_page_first_dates` milestone read. Page CREATION
 * reuses the canonical `createManualPage` in `features/marketing/data/
 * service.ts` — never a second insert path.
 */

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import {
  authenticatedWebDb,
  requireAuthenticatedSupabaseSession,
} from "@/utils/supabase/webDb";
import type {
  GscPageFirstDatesRow,
} from "@/features/marketing/search-console/types";
import {
  buildLaunchTracking,
  parseLaunchTracking,
  type LaunchTracking,
} from "@/features/marketing/search-console/lib/launch-tracking";

export interface TrackedPageRow {
  id: string;
  url: string;
  path: string | null;
  tracking: LaunchTracking;
}

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data");
  return data;
}

/** Every tracked (launch_tracking not null) live page of the site. */
export async function listTrackedPages(
  siteId: string,
  signal?: AbortSignal,
): Promise<TrackedPageRow[]> {
  const response = await (await authenticatedWebDb(supabase))
    .from("page")
    .select("id, url, path, launch_tracking")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .not("launch_tracking", "is", null)
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  const out: TrackedPageRow[] = [];
  for (const row of rows) {
    const tracking = parseLaunchTracking(row.launch_tracking);
    // A non-null but unreadable blob would mean a foreign writer — surface
    // loudly instead of silently hiding the page from the tracker.
    if (!tracking) {
      throw new Error(
        `Page ${row.url} has an unreadable launch_tracking value — fix the row.`,
      );
    }
    out.push({ id: row.id, url: row.url, path: row.path, tracking });
  }
  return out.sort((a, b) =>
    b.tracking.added_at.localeCompare(a.tracking.added_at),
  );
}

export async function getPageFirstDates(
  siteId: string,
  pageIds: string[],
  signal?: AbortSignal,
): Promise<GscPageFirstDatesRow[]> {
  if (pageIds.length === 0) return [];
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .rpc("gsc_perf_page_first_dates", {
      p_site_id: siteId,
      p_page_ids: pageIds.slice(0, 200),
    })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

async function writeTracking(
  pageId: string,
  tracking: LaunchTracking | null,
): Promise<void> {
  const response = await (await authenticatedWebDb(supabase))
    .from("page")
    .update({ launch_tracking: tracking })
    .eq("id", pageId)
    .is("deleted_at", null)
    .select("id");
  const rows = assertData(response.data, response.error);
  if (rows.length === 0) {
    throw new Error("Page not found or not editable (RLS).");
  }
}

/**
 * Start tracking a page (step 1 of the launch workflow). REFUSES a page
 * that is already tracked — a fresh blob would reset `added_at`, wipe the
 * indexing-requested stamp, and delete notes (the context-menu path has no
 * "already tracked" affordance, so the guard lives here, once).
 */
export async function trackPage(
  pageId: string,
  options: { indexingRequested: boolean; notes?: string | null },
): Promise<void> {
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const current = await (await authenticatedWebDb(supabase))
    .from("page")
    .select("launch_tracking")
    .eq("id", pageId)
    .is("deleted_at", null)
    .single();
  const existing = assertData(current.data, current.error);
  if (parseLaunchTracking(existing.launch_tracking) !== null) {
    throw new Error("This page is already on the New Pages tracker.");
  }
  await writeTracking(
    pageId,
    buildLaunchTracking({
      addedBy: session.user.id,
      indexingRequested: options.indexingRequested,
      notes: options.notes ?? null,
    }),
  );
}

/** Stamp "indexing requested in GSC" on an already-tracked page. */
export async function markIndexingRequested(
  page: TrackedPageRow,
): Promise<void> {
  await writeTracking(page.id, {
    ...page.tracking,
    indexing_requested_at: new Date().toISOString(),
  });
}

export async function setLaunchNotes(
  page: TrackedPageRow,
  notes: string,
): Promise<void> {
  await writeTracking(page.id, {
    ...page.tracking,
    notes: notes.trim() === "" ? null : notes.trim(),
  });
}

/** Remove from the tracker (the page itself is untouched). */
export async function untrackPage(pageId: string): Promise<void> {
  await writeTracking(pageId, null);
}

/**
 * URL search over the site's existing canonical pages — the Add dialog's
 * lookup before falling back to `createManualPage`.
 */
export async function searchSitePages(
  siteId: string,
  search: string,
  signal?: AbortSignal,
): Promise<{ id: string; url: string; launch_tracking: Json | null }[]> {
  const cleaned = search.trim().replaceAll("%", "\\%").replaceAll("_", "\\_");
  const response = await (await authenticatedWebDb(supabase))
    .from("page")
    .select("id, url, launch_tracking")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .ilike("url", `%${cleaned}%`)
    .order("url", { ascending: true })
    .limit(20)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}
