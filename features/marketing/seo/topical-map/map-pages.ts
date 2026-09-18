// features/marketing/seo/topical-map/map-pages.ts
//
// PUTTING A SITE'S PAGES ON ITS MAP — the client half of the ONE server entry,
// `POST /seo/sites/{site_id}/map/pages` (aidream
// `aidream/services/seo/page_mapper.py`).
//
// The server enrols every active page of the site in a durable ledger in
// Search Console demand order, then works it in batches: claim, ask
// `seo.page_mapper` where each page sits, write the surviving placements
// through `seo.set_pages_map_topics` with `source='mapper'`, and settle the
// claim against the edges that actually landed. That is many minutes of paid
// model work, so it is a durable SEO command — claimed on the server before
// the first paid call, streamed, and rejoinable after a reload
// (`useMapPagesRun`).
//
// THIS FILE IS THE WIRE, NOT THE SCREEN. It owns the request body, the stage
// vocabulary and the result type; the pages workspace (lane F) owns every word
// a person reads.
//
// 🚨 THE BODY IS `extra=forbid` (`MapPagesRequest.model_config`). A field this
// endpoint does not declare is REFUSED (422), not ignored — so
// `mapPagesBody` sends exactly the four fields it owns and nothing a caller
// happened to carry alongside them.
//
// ⚠️ THE GENERATED CONTRACT DOES NOT YET CARRY THIS PATH. `types/python-generated/`
// was last emitted before `map/pages`, `map/regions` and `map/intents` existed,
// and it could not be regenerated in the container this file was written in
// (aidream's OpenAPI emission boots the app, which needs live database
// credentials). The body below is therefore transcribed field for field from
// `MapPagesRequest`, and `run-clients.test.ts` FAILS until the
// contract is regenerated and agrees with it. When it is:
// replace `MapPagesRequestBody` with
// `components["schemas"]["MapPagesRequest"]` and `MAP_PAGES_PATH`'s cast with
// a plain `satisfies keyof paths`.

import { isJsonObject } from "@/types/json";

/**
 * The one body `POST /seo/sites/{site_id}/map/pages` takes — every field
 * optional, every default the SERVER's (never repeated here, because a default
 * copied into the client is a second place it can change).
 */
export interface MapPagesRequestBody {
  /** Re-measure demand and enrol newly crawled pages before working. Server default: true. */
  refresh?: boolean;
  /** Stop after this many PAGES. Omitted = the `mapping_daily_page_ceiling` knob decides. */
  limit?: number | null;
  /** Pages per model call. Omitted = the `mapping_batch_size` knob. */
  batch_size?: number | null;
  /** Answer what WOULD be written and write nothing. Still costs a model call per batch. */
  dry_run?: boolean;
}

/** What the caller chose, before it becomes a body. */
export interface MapPagesInput {
  refresh?: boolean;
  /** Pages this press may spend on. `null`/omitted hands the decision to the knob. */
  limit?: number | null;
  batchSize?: number | null;
  dryRun?: boolean;
}

/**
 * The typed client: the caller's choices in, the exact `extra=forbid` body out.
 *
 * A field foreign to this endpoint cannot survive the trip: the body is built
 * key by key from the four `MapPagesInput` fields, never spread from the input,
 * so a screen that reuses one options object across the three map commands
 * cannot smuggle `topic_slugs` (the intent proposer's) or `bind_pages` (the
 * region pass's) into this call and get a 422 back with a pydantic path in it.
 */
export function mapPagesBody(input: MapPagesInput = {}): MapPagesRequestBody {
  const body: MapPagesRequestBody = {};
  if (input.refresh !== undefined) body.refresh = input.refresh;
  if (input.limit !== undefined && input.limit !== null) {
    if (!Number.isInteger(input.limit) || input.limit < 1) {
      throw new Error(
        `A page-mapping limit is a whole number of pages, at least 1 — got ${String(input.limit)}. ` +
          "Omit it to let the daily ceiling knob decide.",
      );
    }
    body.limit = input.limit;
  }
  if (input.batchSize !== undefined && input.batchSize !== null) {
    if (!Number.isInteger(input.batchSize) || input.batchSize < 1) {
      throw new Error(
        `A batch size is a whole number of pages per model call, at least 1 — got ` +
          `${String(input.batchSize)}. Omit it to use the mapping_batch_size knob.`,
      );
    }
    body.batch_size = input.batchSize;
  }
  if (input.dryRun !== undefined) body.dry_run = input.dryRun;
  return body;
}

/**
 * The terminal `seo.map_pages_complete` result — `MapPagesResult` in
 * `page_mapper.py`, field for field.
 *
 * 🚨 EVERY "dropped" AND "kept" NUMBER IS AN ANSWER, NOT A FAILURE.
 * `kept_existing` means the map already held that page+topic from a person or a
 * higher-ranked source and the pass correctly left it alone; a screen that
 * lumps it into failures punishes the behaviour we want. `dropped_geography_topic`
 * above zero means this map still HAS a geography branch — say so and offer
 * the region pass, which is exactly what `notes` already explains.
 */
export interface MapPagesResult {
  result_kind: "seo.map_pages";
  site_id: string;
  map_id: string;
  dry_run: boolean;
  scanned: number;
  refreshed: boolean;
  skipped_planned: number;
  skipped_missing: number;
  batches: number;
  claimed: number;
  mapped: number;
  edges_written: number;
  no_topic: number;
  kept_existing: number;
  dropped_low_confidence: number;
  dropped_unknown_slug: number;
  dropped_geography_topic: number;
  reasons_normalized_uncrawled: number;
  returned_to_queue: number;
  quarantined: number;
  failed_batches: number;
  queue_pending: number;
  queue_done: number;
  queue_no_topic: number;
  queue_failed: number;
  placed_by_human: number;
  pending_clicks: number;
  ceiling_reached: boolean;
  daily_ceiling: number;
  mapped_today: number;
  /** The pass gave up after `mapping_consecutive_failure_stop` failures. The queue is intact. */
  stopped_on_repeated_failure: boolean;
  consecutive_failures: number;
  /** What the mapper says the map is missing, biggest traffic first. */
  wanted_topics: Record<string, unknown>[];
  examples: Record<string, unknown>[];
  notes: string[];
  error: string | null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function readRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isJsonObject) : [];
}

/**
 * Narrow the streamed/persisted result onto {@link MapPagesResult}.
 *
 * Built field by field — no assertion — and returns null rather than half-type
 * a payload this build cannot read, so a malformed run is REPORTED instead of
 * rendered as a run that mapped zero pages. `site_id` and `map_id` are the
 * identity of the answer: a document without both is not this result, whatever
 * else it carries.
 */
export function parseMapPagesResult(raw: unknown): MapPagesResult | null {
  if (!isJsonObject(raw)) return null;
  const resultKind = readString(raw.result_kind);
  if (resultKind !== null && resultKind !== "seo.map_pages") return null;
  const siteId = readString(raw.site_id);
  const mapId = readString(raw.map_id);
  if (siteId === null || mapId === null) return null;
  return {
    result_kind: "seo.map_pages",
    site_id: siteId,
    map_id: mapId,
    dry_run: raw.dry_run === true,
    scanned: readNumber(raw.scanned),
    refreshed: raw.refreshed === true,
    skipped_planned: readNumber(raw.skipped_planned),
    skipped_missing: readNumber(raw.skipped_missing),
    batches: readNumber(raw.batches),
    claimed: readNumber(raw.claimed),
    mapped: readNumber(raw.mapped),
    edges_written: readNumber(raw.edges_written),
    no_topic: readNumber(raw.no_topic),
    kept_existing: readNumber(raw.kept_existing),
    dropped_low_confidence: readNumber(raw.dropped_low_confidence),
    dropped_unknown_slug: readNumber(raw.dropped_unknown_slug),
    dropped_geography_topic: readNumber(raw.dropped_geography_topic),
    reasons_normalized_uncrawled: readNumber(raw.reasons_normalized_uncrawled),
    returned_to_queue: readNumber(raw.returned_to_queue),
    quarantined: readNumber(raw.quarantined),
    failed_batches: readNumber(raw.failed_batches),
    queue_pending: readNumber(raw.queue_pending),
    queue_done: readNumber(raw.queue_done),
    queue_no_topic: readNumber(raw.queue_no_topic),
    queue_failed: readNumber(raw.queue_failed),
    placed_by_human: readNumber(raw.placed_by_human),
    pending_clicks: readNumber(raw.pending_clicks),
    ceiling_reached: raw.ceiling_reached === true,
    daily_ceiling: readNumber(raw.daily_ceiling),
    mapped_today: readNumber(raw.mapped_today),
    stopped_on_repeated_failure: raw.stopped_on_repeated_failure === true,
    consecutive_failures: readNumber(raw.consecutive_failures),
    wanted_topics: readRecords(raw.wanted_topics),
    examples: readRecords(raw.examples),
    notes: readStrings(raw.notes),
    error: readString(raw.error),
  };
}

// ── The wire vocabulary ────────────────────────────────────────────────────

/** The command's streaming endpoint. `{site_id}` is filled per launch. */
export const MAP_PAGES_PATH = "/seo/sites/{site_id}/map/pages" as const;

/** The event kind carrying the finished {@link MapPagesResult}. */
export const MAP_PAGES_FINAL_KIND = "seo.map_pages_complete";

/**
 * The server's OWN milestones, in the reader's words — one per `_emit` call in
 * `page_mapper.py` (`run_streamed_command` prefixes every one with `seo.`),
 * never an invented stage. The four envelope events belong to every durable
 * SEO command.
 */
export const MAP_PAGES_STAGES: Record<string, string> = {
  "seo.map_pages_started": "Reading this site's map and its pages…",
  "seo.map_pages_refreshed": "Re-measuring search demand and enrolling new pages…",
  "seo.map_pages_claimed": "Claiming the next batch of pages…",
  "seo.map_pages_batch_done": "Placed a batch of pages on the map",
  "seo.map_pages_finished": "Finishing up — settling the ledger",
  "seo.command_run": "Durable run saved",
  "seo.run_in_progress": "Rejoining the run already in progress",
  "seo.run_snapshot": "Catching up on this run",
  "seo.command_failed": "The page-mapping run stopped",
};
