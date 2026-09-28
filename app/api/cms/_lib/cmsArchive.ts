/**
 * CMS archive gate — a CMS delete ARCHIVES, it never destroys (CMS migration 0041).
 *
 * Migration 0041 (aidream `db/migrations/cms/0041_cms_content_archive_not_delete.sql`)
 * gives client_sites / client_pages / client_components / client_assets /
 * client_redirects / html_pages a `deleted_at` column, plus the cascade functions
 * `cms_archive_site(uuid)` and `cms_archive_page(uuid)`. aidream's CMS services
 * (`aidream/services/cms/archive.py`) follow the same contract.
 *
 * THIS CODE LANDS BEFORE THE MIGRATION, so every decision is taken from the LIVE
 * column, probed once per table:
 *
 * - column present → readers add `deleted_at IS NULL` (`onlyLive`), deletes archive.
 * - column absent  → readers add nothing (nothing is archived yet, and a filter on an
 *   unknown column is a PostgREST 400); deletes REFUSE with `cms_archive_not_live`
 *   and remove nothing. There is no hard-delete fallback.
 *
 * The probe result is cached: "present" forever (a column never goes away),
 * "absent" for one minute, so the moment 0041 lands the next request sees it.
 * Any OTHER probe error is thrown — never guessed.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CmsArchiveTable =
  | "client_sites"
  | "client_pages"
  | "client_components"
  | "client_assets"
  | "client_redirects"
  | "html_pages";

export const ARCHIVE_COLUMN = "deleted_at";
const ABSENT_RECHECK_MS = 60_000;

const present = new Set<CmsArchiveTable>();
const absentUntil = new Map<CmsArchiveTable, number>();

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /deleted_at/.test(error.message ?? "") && /does not exist|could not find/i.test(error.message ?? "");
}

/** True once `table` carries the archive column in the live CMS database. */
export async function archiveLive(db: SupabaseClient, table: CmsArchiveTable): Promise<boolean> {
  if (present.has(table)) return true;
  const until = absentUntil.get(table);
  if (until !== undefined && until > Date.now()) return false;
  const { error } = await db.from(table).select(ARCHIVE_COLUMN).limit(1);
  if (!error) {
    present.add(table);
    absentUntil.delete(table);
    return true;
  }
  if (isMissingColumn(error)) {
    absentUntil.set(table, Date.now() + ABSENT_RECHECK_MS);
    return false;
  }
  throw new Error(`CMS archive probe on ${table} failed: ${error.message}`);
}

/** Add `deleted_at IS NULL` to a query when the column exists; a no-op before 0041. */
export function onlyLive<Q extends { is: (column: string, value: null) => Q }>(query: Q, live: boolean): Q {
  return live ? query.is(ARCHIVE_COLUMN, null) : query;
}

/** A row without the key (pre-0041) is live; a stamped row is archived. */
export function isLive(row: Record<string, unknown> | null | undefined): boolean {
  return !!row && (row[ARCHIVE_COLUMN] === undefined || row[ARCHIVE_COLUMN] === null);
}

/** The loud refusal every delete returns before 0041: nothing was removed. */
export function archiveNotLiveResponse(what: string): NextResponse {
  return NextResponse.json(
    {
      error:
        `Deleting ${what} is paused: CMS deletes now ARCHIVE instead of destroying content, and the ` +
        "archive column arrives with CMS migration 0041, which has not been applied yet. Nothing was " +
        "deleted; try again after the migration window.",
      code: "cms_archive_not_live",
      retryable: true,
    },
    { status: 503 },
  );
}

/** Stamp one row archived (only if it is still live). Requires the column. */
export async function archiveRow(
  db: SupabaseClient,
  table: CmsArchiveTable,
  id: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await db
    .from(table)
    .update({ [ARCHIVE_COLUMN]: new Date().toISOString() })
    .eq("id", id)
    .is(ARCHIVE_COLUMN, null);
  return { error };
}

/** For tests only: forget what the probe learned. */
export function __resetArchiveProbeForTests(): void {
  present.clear();
  absentUntil.clear();
}
