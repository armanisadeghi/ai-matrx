// features/marketing/seo/topical-map/map-intents.ts
//
// PROPOSING WHERE EVERY MAPPED PAGE IS GOING — the client half of the ONE
// server entry, `POST /seo/sites/{site_id}/map/intents` (aidream
// `aidream/services/seo/page_intent_proposer.py`).
//
// The server enrols every active page that already sits on a topic in a durable
// ledger keyed by that topic, then works it TOPIC BY TOPIC so siblings are
// judged together: claim one topic's pages, hand `seo.page_intent_proposer` the
// traffic-ranked roster, its keywords and its planned pages, and write the
// surviving proposals through `seo.set_page_intents` with `source='agent'` and
// `state='proposed'`. Minutes of paid model work, so it is a durable SEO
// command — claimed before the first paid call, streamed, rejoinable after a
// reload (`useProposeIntentsRun`).
//
// 🚨 NOTHING HERE ACTS. Every intent is a PROPOSAL a person reviews through the
// `intent_review_mode` knob; no page is redirected, merged or deleted by this
// call. A page whose destination a person already decided — or any intent
// already accepted or done — is never proposed over, and comes back counted as
// `kept_existing`, which is a success, not a failure.
//
// THIS FILE IS THE WIRE, NOT THE SCREEN. It owns the request body, the stage
// vocabulary and the result type; the pages workspace (lane F) owns every word
// a person reads.
//
// 🚨 THE BODY IS `extra=forbid` (`ProposeIntentsRequest.model_config`) — a
// field belonging to another map command is REFUSED (422), not ignored.
//
// The generated contract owns the terminal result and route identity. The
// request body remains deliberately narrower: organization and initiation
// context belong to the transport layer, while this builder owns only its
// command choices.

import {
  isJsonObject,
  toJsonRecord,
  type JsonValue,
} from "@/types/json";
import type { components, paths } from "@/types/python-generated/api-types";

/** The one body `POST /seo/sites/{site_id}/map/intents` takes. */
export interface ProposeIntentsRequestBody {
  /** Re-measure demand and enrol newly mapped pages before working. Server default: true. */
  refresh?: boolean;
  /** Stop after this many PAGES. Omitted = the `intent_daily_page_ceiling` knob decides. */
  limit?: number | null;
  /** Pages per model call. Omitted = the `intent_batch_size` knob. */
  batch_size?: number | null;
  /**
   * Restrict the pass to these topic slugs. This is the same door a topic-level
   * "propose destinations for this topic" button calls.
   */
  topic_slugs?: string[] | null;
  /** Answer what WOULD be written and write nothing. Still costs a model call per batch. */
  dry_run?: boolean;
}

/** What the caller chose, before it becomes a body. */
export interface ProposeIntentsInput {
  refresh?: boolean;
  limit?: number | null;
  batchSize?: number | null;
  /** Slugs of THIS map's live topics. An empty array is not a restriction — it is omitted. */
  topicSlugs?: string[] | null;
  dryRun?: boolean;
}

/**
 * The typed client: the caller's choices in, the exact `extra=forbid` body out.
 *
 * Built key by key, never spread from the input, so a screen that shares one
 * options object across the three map commands cannot smuggle `bind_pages` or
 * `retire_geography_topics` (the region pass's) into this call and get a 422
 * back with a pydantic path in it.
 */
export function proposeIntentsBody(
  input: ProposeIntentsInput = {},
): ProposeIntentsRequestBody {
  const body: ProposeIntentsRequestBody = {};
  if (input.refresh !== undefined) body.refresh = input.refresh;
  if (input.limit !== undefined && input.limit !== null) {
    if (!Number.isInteger(input.limit) || input.limit < 1) {
      throw new Error(
        `An intent-proposal limit is a whole number of pages, at least 1 — got ` +
          `${String(input.limit)}. Omit it to let the daily ceiling knob decide.`,
      );
    }
    body.limit = input.limit;
  }
  if (input.batchSize !== undefined && input.batchSize !== null) {
    if (!Number.isInteger(input.batchSize) || input.batchSize < 1) {
      throw new Error(
        `A batch size is a whole number of pages per model call, at least 1 — got ` +
          `${String(input.batchSize)}. Omit it to use the intent_batch_size knob.`,
      );
    }
    body.batch_size = input.batchSize;
  }
  // An EMPTY array would read on the server as "restrict this pass to no
  // topics", which is a pass that spends a claim and proposes nothing. A
  // caller that has not chosen any topic means "every topic", so it is omitted.
  if (input.topicSlugs && input.topicSlugs.length > 0) {
    body.topic_slugs = [...input.topicSlugs];
  }
  if (input.dryRun !== undefined) body.dry_run = input.dryRun;
  return body;
}

/**
 * The terminal `seo.propose_intents_complete` result — `ProposeIntentsResult`
 * in `page_intent_proposer.py`, field for field.
 *
 * 🚨 THE `downgraded_*` NUMBERS ARE THE PROMPT'S REPORT CARD. Each one counts a
 * code-side correction of the agent's answer; a rise in any of them is a prompt
 * defect, not noise, and a screen that hides them hides the only signal that
 * says whether the agent is being trusted or policed.
 */
export type ProposeIntentsResult = components["schemas"]["ProposeIntentsResult"];

/** A validated terminal result with the server's defaults made explicit for the UI. */
export type ProposeIntentsRunResult = Required<ProposeIntentsResult>;

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function readRecords(value: unknown): Record<string, JsonValue>[] {
  return Array.isArray(value)
    ? value.filter(isJsonObject).map(toJsonRecord)
    : [];
}

function readCounts(value: unknown): Record<string, number> {
  if (!isJsonObject(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number" && Number.isFinite(entry)) out[key] = entry;
  }
  return out;
}

/**
 * Narrow the streamed/persisted result onto {@link ProposeIntentsResult}.
 *
 * Returns null rather than half-type a payload this build cannot read. A pass
 * that proposed nothing is a REAL answer (every page already settled), so the
 * emptiness of `by_disposition` never rejects the document — only a missing
 * `site_id`/`map_id` identity, or a `result_kind` naming a different command,
 * does.
 */
export function parseProposeIntentsResult(raw: unknown): ProposeIntentsRunResult | null {
  if (!isJsonObject(raw)) return null;
  const resultKind = readString(raw.result_kind);
  if (resultKind !== null && resultKind !== "map.intents") return null;
  const siteId = readString(raw.site_id);
  const mapId = readString(raw.map_id);
  if (siteId === null || mapId === null) return null;
  return {
    result_kind: "map.intents",
    site_id: siteId,
    map_id: mapId,
    dry_run: raw.dry_run === true,
    scanned: readNumber(raw.scanned),
    refreshed: raw.refreshed === true,
    skipped_no_topic: readNumber(raw.skipped_no_topic),
    batches: readNumber(raw.batches),
    topics_touched: readNumber(raw.topics_touched),
    claimed: readNumber(raw.claimed),
    proposed: readNumber(raw.proposed),
    returned_to_queue: readNumber(raw.returned_to_queue),
    held_by_human: readNumber(raw.held_by_human),
    quarantined: readNumber(raw.quarantined),
    failed_batches: readNumber(raw.failed_batches),
    downgraded_low_confidence: readNumber(raw.downgraded_low_confidence),
    downgraded_traffic_or_links: readNumber(raw.downgraded_traffic_or_links),
    downgraded_unknown_destination: readNumber(raw.downgraded_unknown_destination),
    downgraded_self_destination: readNumber(raw.downgraded_self_destination),
    rendition_retargeted: readNumber(raw.rendition_retargeted),
    dropped_unknown_slug: readNumber(raw.dropped_unknown_slug),
    dropped_locked: readNumber(raw.dropped_locked),
    kept_existing: readNumber(raw.kept_existing),
    by_disposition: readCounts(raw.by_disposition),
    queue_pending: readNumber(raw.queue_pending),
    queue_done: readNumber(raw.queue_done),
    queue_held: readNumber(raw.queue_held),
    queue_failed: readNumber(raw.queue_failed),
    topics_pending: readNumber(raw.topics_pending),
    pending_clicks: readNumber(raw.pending_clicks),
    ceiling_reached: raw.ceiling_reached === true,
    daily_ceiling: readNumber(raw.daily_ceiling),
    proposed_today: readNumber(raw.proposed_today),
    stopped_on_repeated_failure: raw.stopped_on_repeated_failure === true,
    consecutive_failures: readNumber(raw.consecutive_failures),
    examples: readRecords(raw.examples),
    notes: readStrings(raw.notes),
    error: readString(raw.error),
  };
}

// ── The wire vocabulary ────────────────────────────────────────────────────

/** The command's streaming endpoint. `{site_id}` is filled per launch. */
export const PROPOSE_INTENTS_PATH = "/seo/sites/{site_id}/map/intents" satisfies keyof paths;

/** The event kind carrying the finished {@link ProposeIntentsResult}. */
export const PROPOSE_INTENTS_FINAL_KIND = "seo.propose_intents_complete";

/**
 * The server's OWN milestones, in the reader's words — one per `_emit` call in
 * `page_intent_proposer.py` (`run_streamed_command` prefixes every one with
 * `seo.`), never an invented stage.
 */
export const PROPOSE_INTENTS_STAGES: Record<string, string> = {
  "seo.propose_intents_started": "Reading the pages already on this map…",
  "seo.propose_intents_refreshed": "Re-measuring search demand and enrolling newly mapped pages…",
  "seo.propose_intents_claimed": "Claiming the next topic's pages…",
  "seo.propose_intents_topic_read": "Reading one topic's pages, keywords and plans…",
  "seo.propose_intents_batch_done": "Proposed destinations for a batch of pages",
  "seo.propose_intents_finished": "Finishing up — settling the ledger",
  "seo.command_run": "Durable run saved",
  "seo.run_in_progress": "Rejoining the run already in progress",
  "seo.run_snapshot": "Catching up on this run",
  "seo.command_failed": "The destinations run stopped",
};
