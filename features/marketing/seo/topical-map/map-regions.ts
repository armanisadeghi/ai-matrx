// features/marketing/seo/topical-map/map-regions.ts
//
// GIVING A MAP ITS GEOGRAPHY — the client half of the ONE server entry,
// `POST /seo/sites/{site_id}/map/regions` (aidream
// `aidream/services/seo/region_facet.py`).
//
// 🚨 GEOGRAPHY IS A FACET, NOT A BRANCH. A topic answers WHAT this company
// does; a region answers WHERE. `region` is a built-in facet of every map, so a
// location page belongs on the SERVICE topic it is about, carrying its place as
// a facet value. Measured live on 2026-09-17, a topic slugged `california` on a
// real client's map had collected 557 location pages, and every crowding,
// duplication and merge judgement downstream then read that company's local
// footprint as duplicates of itself. This pass derives the brand's region
// values from real data and binds each location page through
// `seo.set_page_map_facet` with `source='mapper'` — the LOWEST rank on the
// precedence ladder, so a region a person set is never overwritten.
//
// 🚨 IT MAKES NO MODEL CALLS. There is no paid work anywhere in it: a place is
// read out of a page's own address by subtracting the words this map already
// uses for its subjects. `dryRun` is therefore genuinely free, which is why the
// screen should offer it by default before `retireGeographyTopics`.
//
// THIS FILE IS THE WIRE, NOT THE SCREEN. It owns the request body, the stage
// vocabulary and the result type; the pages workspace (lane F) owns every word
// a person reads.
//
// 🚨 THE BODY IS `extra=forbid` (`MapRegionsRequest.model_config`) — a field
// belonging to another map command is REFUSED (422), not ignored.
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

/** The one body `POST /seo/sites/{site_id}/map/regions` takes. */
export interface MapRegionsRequestBody {
  /** Derive and create the brand's region facet values before binding. Server default: true. */
  derive_values?: boolean;
  /** Bind this site's pages to their region. Server default: true. */
  bind_pages?: boolean;
  /** Stop after binding this many PAGES. Omitted = the `region_daily_page_ceiling` knob decides. */
  limit?: number | null;
  /**
   * Retire the map's geography BRANCHES after moving every page they carry onto
   * the service topics that page already covers. OFF by default on the server:
   * it changes a live company's map.
   */
  retire_geography_topics?: boolean;
  /** Restrict the retirement to these slugs. Ignored unless `retire_geography_topics`. */
  geography_topic_slugs?: string[] | null;
  /** Answer what WOULD happen and write nothing. Genuinely free — no model calls. */
  dry_run?: boolean;
}

/** What the caller chose, before it becomes a body. */
export interface MapRegionsInput {
  deriveValues?: boolean;
  bindPages?: boolean;
  limit?: number | null;
  /**
   * 🚨 A DESTRUCTIVE CHOICE. Turning this on retires topics of a live map. The
   * control that sets it must state the consequence first — how many branches,
   * how many pages move, and how many end on no topic at all — which is exactly
   * what the same call with `dryRun` answers, for free.
   */
  retireGeographyTopics?: boolean;
  geographyTopicSlugs?: string[] | null;
  dryRun?: boolean;
}

/**
 * The typed client: the caller's choices in, the exact `extra=forbid` body out.
 *
 * Built key by key, never spread from the input, so a screen that shares one
 * options object across the three map commands cannot smuggle `batch_size` or
 * `topic_slugs` into this call. It also refuses locally what the server would
 * silently IGNORE: naming geography topic slugs without asking for the
 * retirement is a request the server drops on the floor, and a caller learning
 * that from a result that retired nothing is the screen that lies.
 */
export function mapRegionsBody(input: MapRegionsInput = {}): MapRegionsRequestBody {
  const body: MapRegionsRequestBody = {};
  if (input.deriveValues !== undefined) body.derive_values = input.deriveValues;
  if (input.bindPages !== undefined) body.bind_pages = input.bindPages;
  if (input.limit !== undefined && input.limit !== null) {
    if (!Number.isInteger(input.limit) || input.limit < 1) {
      throw new Error(
        `A region-binding limit is a whole number of pages, at least 1 — got ${String(input.limit)}. ` +
          "Omit it to let the daily ceiling knob decide.",
      );
    }
    body.limit = input.limit;
  }
  if (input.retireGeographyTopics !== undefined) {
    body.retire_geography_topics = input.retireGeographyTopics;
  }
  if (input.geographyTopicSlugs && input.geographyTopicSlugs.length > 0) {
    if (!input.retireGeographyTopics) {
      throw new Error(
        "Geography topic slugs were named, but the retirement was not asked for. The " +
          "server ignores the slugs in that case, so this run would report that it " +
          "retired nothing while looking like it had been told exactly what to retire.",
      );
    }
    body.geography_topic_slugs = [...input.geographyTopicSlugs];
  }
  if (input.dryRun !== undefined) body.dry_run = input.dryRun;
  return body;
}

/** One region facet value this pass would create, or already found. */
export type RegionValuePlan = components["schemas"]["RegionValuePlan"];

/**
 * A topic of this map that is a PLACE — the fault this pass exists to find.
 * `pages_with_no_other_topic` is the number that decides whether retiring it is
 * safe: those pages end on NO topic, still listed and named in the answer.
 */
export type GeographyBranch = components["schemas"]["GeographyBranch"];

/** The terminal `seo.map_regions_complete` result — `MapRegionsResult`, field for field. */
export type MapRegionsResult = components["schemas"]["MapRegionsResult"];

/** A validated terminal result with the server's defaults made explicit for the UI. */
export type MapRegionsRunResult = Omit<
  Required<MapRegionsResult>,
  "plan" | "geography_branches"
> & {
  plan: Required<RegionValuePlan>[];
  geography_branches: Required<GeographyBranch>[];
};

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

function readValuePlan(value: unknown): Required<RegionValuePlan> | null {
  if (!isJsonObject(value)) return null;
  const slug = readString(value.slug);
  const name = readString(value.name);
  if (slug === null || name === null) return null;
  return {
    slug,
    name,
    parent_slug: readString(value.parent_slug),
    pages: readNumber(value.pages),
    evidence: readString(value.evidence) ?? "pages",
    ref_type: readString(value.ref_type),
    ref_id: readString(value.ref_id),
    existed: value.existed === true,
  };
}

function readGeographyBranch(value: unknown): Required<GeographyBranch> | null {
  if (!isJsonObject(value)) return null;
  const slug = readString(value.slug);
  if (slug === null) return null;
  return {
    slug,
    name: readString(value.name) ?? slug,
    reason: readString(value.reason) ?? "",
    pages: readNumber(value.pages),
    pages_with_no_other_topic: readNumber(value.pages_with_no_other_topic),
    retired: value.retired === true,
  };
}

/**
 * Narrow the streamed/persisted result onto {@link MapRegionsResult}.
 *
 * Returns null rather than half-type a payload this build cannot read: a run
 * that found no place is `pages_with_a_place: 0` with a real `map_id`, and a
 * document missing that identity is not this result at all. Rendering the two
 * the same way would report a broken contract as a site with no geography.
 */
export function parseMapRegionsResult(raw: unknown): MapRegionsRunResult | null {
  if (!isJsonObject(raw)) return null;
  const resultKind = readString(raw.result_kind);
  if (resultKind !== null && resultKind !== "map.regions") return null;
  const siteId = readString(raw.site_id);
  const mapId = readString(raw.map_id);
  if (siteId === null || mapId === null) return null;
  return {
    result_kind: "map.regions",
    site_id: siteId,
    brand_id: readString(raw.brand_id) ?? "",
    map_id: mapId,
    dry_run: raw.dry_run === true,
    pages_scanned: readNumber(raw.pages_scanned),
    pages_with_a_place: readNumber(raw.pages_with_a_place),
    values_before: readNumber(raw.values_before),
    values_created: readStrings(raw.values_created),
    values_existing: readStrings(raw.values_existing),
    values_held_back: readRecords(raw.values_held_back),
    plan: Array.isArray(raw.plan)
      ? raw.plan
          .map(readValuePlan)
          .filter((v): v is Required<RegionValuePlan> => v !== null)
      : [],
    pages_with_region_before: readNumber(raw.pages_with_region_before),
    pages_bound: readNumber(raw.pages_bound),
    pages_kept_existing: readNumber(raw.pages_kept_existing),
    pages_already_correct: readNumber(raw.pages_already_correct),
    pages_without_a_place: readNumber(raw.pages_without_a_place),
    pages_with_region_after: readNumber(raw.pages_with_region_after),
    geography_branches: Array.isArray(raw.geography_branches)
      ? raw.geography_branches
          .map(readGeographyBranch)
          .filter((v): v is Required<GeographyBranch> => v !== null)
      : [],
    pages_recovered_from_geography: readNumber(raw.pages_recovered_from_geography),
    pages_left_without_topic: readNumber(raw.pages_left_without_topic),
    examples_left_without_topic: readStrings(raw.examples_left_without_topic),
    ceiling_reached: raw.ceiling_reached === true,
    daily_ceiling: readNumber(raw.daily_ceiling),
    bound_today: readNumber(raw.bound_today),
    examples: readRecords(raw.examples),
    notes: readStrings(raw.notes),
    error: readString(raw.error),
  };
}

// ── The wire vocabulary ────────────────────────────────────────────────────

/** The command's streaming endpoint. `{site_id}` is filled per launch. */
export const MAP_REGIONS_PATH = "/seo/sites/{site_id}/map/regions" satisfies keyof paths;

/** The event kind carrying the finished {@link MapRegionsResult}. */
export const MAP_REGIONS_FINAL_KIND = "seo.map_regions_complete";

/**
 * The server's OWN milestones, in the reader's words — one per `_emit` call in
 * `region_facet.py` (`run_streamed_command` prefixes every one with `seo.`),
 * never an invented stage.
 */
export const MAP_REGIONS_STAGES: Record<string, string> = {
  "seo.map_regions_started": "Reading this site's pages and this brand's places…",
  "seo.map_regions_derived": "Working out which places this site actually serves…",
  "seo.map_regions_values_written": "Writing the region values",
  "seo.map_regions_geography_branches": "Found topics that are places, not subjects",
  "seo.map_regions_branch_pages_moved": "Moving those pages onto the subjects they cover…",
  "seo.map_regions_branch_retired": "Retired a place-named topic",
  "seo.map_regions_bound": "Giving pages their region…",
  "seo.map_regions_finished": "Finishing up",
  "seo.command_run": "Durable run saved",
  "seo.run_in_progress": "Rejoining the run already in progress",
  "seo.run_snapshot": "Catching up on this run",
  "seo.command_failed": "The region run stopped",
};
