/**
 * `web.crawl_schedule` CRUD — the human writer for recurring site crawls.
 *
 * Direct to Supabase under the caller's JWT, per the platform rule: the client
 * owns DB reads/writes, the Python server owns work. The server's role here is
 * the DISPATCHER (`web_crawl_schedule_dispatch`, every minute) that claims due
 * rows and starts the crawl — it is never asked to write this row.
 *
 * THE DIVISION OF OWNERSHIP, which the DB grants enforce (migration 0322):
 *
 *   client writes INTENT      — name, enabled, cadence, timezone, preset_id
 *   server writes EXECUTION   — claim_token, claim_expires_at, last_run_at,
 *                               last_session_id, last_outcome, last_error,
 *                               consecutive_failures
 *
 * `authenticated` holds no UPDATE privilege on the execution columns at all, so
 * a browser cannot clear a live `claim_token` mid-lease and hand the same due
 * occurrence to a second worker. Double-run stays structurally impossible.
 *
 * `next_run_at` is the one shared column, and this file only ever writes NULL
 * to it: that is the documented "recompute me" signal the dispatcher's
 * `seed_missing_next_run_at` sweep picks up on its next tick. The client never
 * computes an occurrence — cron-in-a-timezone is the server's arithmetic, and a
 * second implementation of it here would drift.
 */
import type { CrawlCadence } from "@/features/marketing/crawler/crawl-cadence";
import type { CrawlSchedule } from "@/features/marketing/types";
import { assertData } from "@/features/marketing/data/service";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import { guardedUpdate } from "@/utils/supabase/guardedUpdate";

export const CRAWL_SCHEDULE_COLUMNS =
  "id, site_id, organization_id, name, enabled, cadence, timezone, next_run_at, last_run_at, last_session_id, last_outcome, last_error, consecutive_failures, preset_id, version, created_at, updated_at";

/** The default schedule name. One schedule per site is all the UI offers. */
export const DEFAULT_CRAWL_SCHEDULE_NAME = "Recurring crawl";

/**
 * The site's recurring-crawl schedule, or null when it has never had one.
 *
 * The table permits several schedules per site (an admin or agent may create
 * more); this UI owns exactly one and takes the oldest, so re-saving can never
 * silently fork a second row that also fires.
 */
export async function getSiteCrawlSchedule(
  siteId: string,
  signal?: AbortSignal,
): Promise<CrawlSchedule | null> {
  const db = await authenticatedWebDb(supabase);
  let query = db
    .from("crawl_schedule")
    .select(CRAWL_SCHEDULE_COLUMNS)
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (signal) query = query.abortSignal(signal);
  const response = await query.maybeSingle();
  if (response.error) throw response.error;
  return response.data;
}

export interface SaveCrawlScheduleInput {
  siteId: string;
  organizationId: string;
  cadence: CrawlCadence;
  timezone: string;
  enabled: boolean;
  /** The row being edited, when one exists — its `version` guards the write. */
  existing: Pick<CrawlSchedule, "id" | "version"> | null;
}

export type SaveCrawlScheduleResult =
  | { status: "saved"; schedule: CrawlSchedule }
  | { status: "conflict"; current: CrawlSchedule };

/**
 * Create or update the site's schedule.
 *
 * Always clears `next_run_at`. That is not laziness — it is the only correct
 * behaviour for every case that reaches here:
 *   • cadence changed  → the standing occurrence belongs to the OLD cadence
 *     (switching monthly → daily must not leave a month-out occurrence),
 *   • re-enabled       → a `next_run_at` from before the pause is in the past,
 *     and would fire a crawl the instant it is switched back on.
 * The dispatcher reseeds it within a minute, and the UI says so meanwhile.
 */
export async function saveSiteCrawlSchedule(
  input: SaveCrawlScheduleInput,
): Promise<SaveCrawlScheduleResult> {
  const db = await authenticatedWebDb(supabase);
  const intent = {
    enabled: input.enabled,
    cadence: input.cadence,
    timezone: input.timezone,
    next_run_at: null,
  };

  if (!input.existing) {
    const response = await db
      .from("crawl_schedule")
      .insert({
        site_id: input.siteId,
        organization_id: input.organizationId,
        name: DEFAULT_CRAWL_SCHEDULE_NAME,
        ...intent,
      })
      .select(CRAWL_SCHEDULE_COLUMNS)
      .maybeSingle();
    return {
      status: "saved",
      schedule: assertData(response.data, response.error),
    };
  }

  const scheduleId = input.existing.id;
  const result = await guardedUpdate<CrawlSchedule>({
    expectedVersion: input.existing.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("crawl_schedule")
        .update({ ...intent, version: nextVersion })
        .eq("id", scheduleId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(CRAWL_SCHEDULE_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("crawl_schedule")
        .select(CRAWL_SCHEDULE_COLUMNS)
        .eq("id", scheduleId)
        .maybeSingle(),
  });

  switch (result.status) {
    case "saved":
      return { status: "saved", schedule: result.row };
    case "conflict":
      return { status: "conflict", current: result.currentRow };
    case "not_found":
      throw new Error(
        "This crawl schedule was deleted while you were editing it. Reload the page to start a new one.",
      );
  }
}

/**
 * Turn recurring crawls off without discarding the cadence the user chose, so
 * switching back on is one click and not a re-decision.
 */
export async function setSiteCrawlScheduleEnabled(
  schedule: Pick<CrawlSchedule, "id" | "version">,
  enabled: boolean,
): Promise<SaveCrawlScheduleResult> {
  const db = await authenticatedWebDb(supabase);
  const scheduleId = schedule.id;
  const result = await guardedUpdate<CrawlSchedule>({
    expectedVersion: schedule.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("crawl_schedule")
        // `next_run_at: null` on BOTH directions — see saveSiteCrawlSchedule.
        .update({ enabled, next_run_at: null, version: nextVersion })
        .eq("id", scheduleId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(CRAWL_SCHEDULE_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("crawl_schedule")
        .select(CRAWL_SCHEDULE_COLUMNS)
        .eq("id", scheduleId)
        .maybeSingle(),
  });

  switch (result.status) {
    case "saved":
      return { status: "saved", schedule: result.row };
    case "conflict":
      return { status: "conflict", current: result.currentRow };
    case "not_found":
      throw new Error(
        "This crawl schedule no longer exists. Reload the page to start a new one.",
      );
  }
}
