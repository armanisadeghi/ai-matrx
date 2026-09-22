// features/marketing/seo/topical-map/run-clients.test.ts
//
// FORCING FUNCTIONS for the three map run clients (CONTRACTS §8):
// `map-pages.ts`, `map-regions.ts`, `map-intents.ts`.
//
// Two classes of defect are measured, and nothing else — the hooks' transport
// belongs to `useSeoCommandRun`, which has its own tests.
//
// 1. THE BODY IS `extra=forbid`. All three endpoints refuse (422) a field they
//    do not declare, so a screen that reuses one options object across the
//    three commands must not be able to smuggle a sibling's field into a call.
//    Each builder is therefore handed a KITCHEN SINK — every field of all three
//    inputs at once — and its body must carry only its own endpoint's keys.
//    Building key by key is what makes that true; a body spread from the input
//    would fail every one of these.
//
// 2. A MALFORMED RESULT IS REPORTED, NEVER RENDERED. Each `parse…Result`
//    returns null rather than half-typing a document this build cannot read,
//    because a half-read result renders as a run that did nothing — the answer
//    a person would act on. The tests below also pin the states that are REAL
//    and must NOT be rejected: a pass that mapped nothing, proposed nothing, or
//    found no place is an answer.
//
// The payloads are the server's own result models, field for field (aidream
// `aidream/services/seo/{page_mapper,region_facet,page_intent_proposer}.py`).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  mapPagesBody,
  parseMapPagesResult,
  MAP_PAGES_PATH,
  MAP_PAGES_FINAL_KIND,
  type MapPagesInput,
} from "./map-pages";
import {
  mapRegionsBody,
  parseMapRegionsResult,
  MAP_REGIONS_PATH,
  MAP_REGIONS_FINAL_KIND,
  type MapRegionsInput,
} from "./map-regions";
import {
  proposeIntentsBody,
  parseProposeIntentsResult,
  PROPOSE_INTENTS_PATH,
  PROPOSE_INTENTS_FINAL_KIND,
  type ProposeIntentsInput,
} from "./map-intents";

/**
 * Every field of all three inputs at once — what a screen ends up holding when
 * one options object drives three buttons.
 */
const KITCHEN_SINK = {
  refresh: true,
  limit: 300,
  batchSize: 25,
  dryRun: true,
  topicSlugs: ["hard-drive-shredding"],
  deriveValues: true,
  bindPages: true,
  retireGeographyTopics: true,
  geographyTopicSlugs: ["california"],
};

describe("the body carries its OWN endpoint's fields and nothing else", () => {
  it("map/pages declares exactly refresh, limit, batch_size, dry_run", () => {
    const body = mapPagesBody(KITCHEN_SINK as MapPagesInput);
    expect(Object.keys(body).sort()).toEqual(
      ["batch_size", "dry_run", "limit", "refresh"].sort(),
    );
    // The region pass's and the proposer's fields are absent, not renamed.
    expect(body).not.toHaveProperty("topic_slugs");
    expect(body).not.toHaveProperty("bind_pages");
    expect(body).not.toHaveProperty("retire_geography_topics");
  });

  it("map/regions declares its own six and never a batch size or topic slugs", () => {
    const body = mapRegionsBody(KITCHEN_SINK as MapRegionsInput);
    expect(Object.keys(body).sort()).toEqual(
      [
        "bind_pages",
        "derive_values",
        "dry_run",
        "geography_topic_slugs",
        "limit",
        "retire_geography_topics",
      ].sort(),
    );
    expect(body).not.toHaveProperty("batch_size");
    expect(body).not.toHaveProperty("topic_slugs");
    expect(body).not.toHaveProperty("refresh");
  });

  it("map/intents declares exactly refresh, limit, batch_size, topic_slugs, dry_run", () => {
    const body = proposeIntentsBody(KITCHEN_SINK as ProposeIntentsInput);
    expect(Object.keys(body).sort()).toEqual(
      ["batch_size", "dry_run", "limit", "refresh", "topic_slugs"].sort(),
    );
    expect(body).not.toHaveProperty("bind_pages");
    expect(body).not.toHaveProperty("derive_values");
    expect(body).not.toHaveProperty("retire_geography_topics");
  });

  it("an omitted choice stays omitted — the SERVER's default is never copied here", () => {
    expect(mapPagesBody()).toEqual({});
    expect(mapRegionsBody()).toEqual({});
    expect(proposeIntentsBody()).toEqual({});
    // `null` means "let the knob decide" and must not become `limit: null`.
    expect(mapPagesBody({ limit: null })).toEqual({});
  });
});

describe("a body the server would refuse, or silently ignore, throws HERE", () => {
  it.each([
    ["zero", 0],
    ["negative", -5],
    ["fractional", 2.5],
  ])("map/pages refuses a %s limit", (_label, limit) => {
    expect(() => mapPagesBody({ limit })).toThrow(/whole number of pages/);
  });

  it("map/pages refuses a nonsense batch size", () => {
    expect(() => mapPagesBody({ batchSize: 0 })).toThrow(/whole number of pages per model call/);
  });

  it("map/intents refuses a nonsense limit and batch size", () => {
    expect(() => proposeIntentsBody({ limit: 0 })).toThrow(/whole number of pages/);
    expect(() => proposeIntentsBody({ batchSize: -1 })).toThrow(/per model call/);
  });

  it("map/intents omits an EMPTY topic list instead of restricting to nothing", () => {
    // `topic_slugs: []` reads on the server as "restrict this pass to no
    // topics" — a claim spent proposing nothing.
    expect(proposeIntentsBody({ topicSlugs: [] })).toEqual({});
  });

  it("map/regions refuses geography slugs named without the retirement", () => {
    expect(() =>
      mapRegionsBody({ geographyTopicSlugs: ["california"] }),
    ).toThrow(/retirement was not asked for/);
  });

  it("map/regions refuses a nonsense limit", () => {
    expect(() => mapRegionsBody({ limit: 0 })).toThrow(/whole number of pages/);
  });
});

// ── The result documents ───────────────────────────────────────────────────

const PAGES_RESULT = {
  result_kind: "map.pages",
  site_id: "11111111-1111-1111-1111-111111111111",
  map_id: "22222222-2222-2222-2222-222222222222",
  dry_run: false,
  scanned: 737,
  refreshed: true,
  mapped: 400,
  edges_written: 412,
  kept_existing: 12,
  dropped_geography_topic: 3,
  wanted_topics: [{ suggested_topic_name: "Hard Drive Shredding", pages: 4 }],
  examples: [{ url: "/a" }],
  notes: ["This map still has a geography branch."],
  error: null,
};

const REGIONS_RESULT = {
  result_kind: "map.regions",
  site_id: "11111111-1111-1111-1111-111111111111",
  brand_id: "33333333-3333-3333-3333-333333333333",
  map_id: "22222222-2222-2222-2222-222222222222",
  pages_scanned: 1200,
  pages_with_a_place: 557,
  values_created: ["california"],
  plan: [{ slug: "california", name: "California", pages: 557, evidence: "pages" }],
  geography_branches: [
    { slug: "california", name: "California", reason: "a US state", pages: 557 },
  ],
  notes: [],
  error: null,
};

const INTENTS_RESULT = {
  result_kind: "map.intents",
  site_id: "11111111-1111-1111-1111-111111111111",
  map_id: "22222222-2222-2222-2222-222222222222",
  scanned: 400,
  proposed: 120,
  kept_existing: 8,
  by_disposition: { in_place: 90, leaving: 20, delete: 10, unreadable: "not a number" },
  examples: [{ url: "/a" }],
  notes: [],
  error: null,
};

describe("a malformed result is REPORTED, never half-typed", () => {
  it.each([
    ["not an object", "map.pages"],
    ["null", null],
    ["an array", []],
    ["missing site_id", { ...PAGES_RESULT, site_id: undefined }],
    ["missing map_id", { ...PAGES_RESULT, map_id: undefined }],
    ["a site_id that is not a string", { ...PAGES_RESULT, site_id: 42 }],
    ["another command's result", { ...PAGES_RESULT, result_kind: "map.regions" }],
  ])("map/pages rejects %s", (_label, raw) => {
    expect(parseMapPagesResult(raw)).toBeNull();
  });

  it.each([
    ["missing map_id", { ...REGIONS_RESULT, map_id: undefined }],
    ["missing site_id", { ...REGIONS_RESULT, site_id: null }],
    ["another command's result", { ...REGIONS_RESULT, result_kind: "map.pages" }],
    ["a bare string", "done"],
  ])("map/regions rejects %s", (_label, raw) => {
    expect(parseMapRegionsResult(raw)).toBeNull();
  });

  it.each([
    ["missing map_id", { ...INTENTS_RESULT, map_id: undefined }],
    ["missing site_id", { ...INTENTS_RESULT, site_id: undefined }],
    [
      "another command's result",
      { ...INTENTS_RESULT, result_kind: "map.pages" },
    ],
    ["a number", 7],
  ])("map/intents rejects %s", (_label, raw) => {
    expect(parseProposeIntentsResult(raw)).toBeNull();
  });
});

describe("the states that are ANSWERS are never rejected", () => {
  it("a pass that mapped nothing is a result, not a failure", () => {
    const parsed = parseMapPagesResult({
      result_kind: "map.pages",
      site_id: "s",
      map_id: "m",
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.mapped).toBe(0);
    expect(parsed?.wanted_topics).toEqual([]);
    expect(parsed?.notes).toEqual([]);
  });

  it("a site with no geography is a result, not a failure", () => {
    const parsed = parseMapRegionsResult({
      result_kind: "map.regions",
      site_id: "s",
      map_id: "m",
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.pages_with_a_place).toBe(0);
    expect(parsed?.geography_branches).toEqual([]);
  });

  it("a pass that proposed nothing is a result, not a failure", () => {
    const parsed = parseProposeIntentsResult({
      result_kind: "map.intents",
      site_id: "s",
      map_id: "m",
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.proposed).toBe(0);
    expect(parsed?.by_disposition).toEqual({});
  });

  it("a document carrying no result_kind at all is accepted on its identity", () => {
    // The persisted document and the streamed one do not always agree about
    // the discriminator; the identity (site + map) is what makes it this
    // result. Only a kind naming a DIFFERENT command rejects it.
    const { result_kind: _ignored, ...withoutKind } = PAGES_RESULT;
    expect(parseMapPagesResult(withoutKind)).not.toBeNull();
  });
});

describe("the whole result document is carried across, field for field", () => {
  it("map/pages", () => {
    const parsed = parseMapPagesResult(PAGES_RESULT);
    expect(parsed?.scanned).toBe(737);
    expect(parsed?.kept_existing).toBe(12);
    expect(parsed?.dropped_geography_topic).toBe(3);
    expect(parsed?.wanted_topics).toHaveLength(1);
    expect(parsed?.notes).toEqual(["This map still has a geography branch."]);
  });

  it("map/regions keeps the branch and plan rows it was given", () => {
    const parsed = parseMapRegionsResult(REGIONS_RESULT);
    expect(parsed?.brand_id).toBe("33333333-3333-3333-3333-333333333333");
    expect(parsed?.plan[0]?.slug).toBe("california");
    expect(parsed?.plan[0]?.evidence).toBe("pages");
    expect(parsed?.geography_branches[0]?.pages).toBe(557);
    expect(parsed?.geography_branches[0]?.retired).toBe(false);
  });

  it("map/intents drops a non-numeric disposition rather than stringifying it", () => {
    const parsed = parseProposeIntentsResult(INTENTS_RESULT);
    expect(parsed?.proposed).toBe(120);
    expect(parsed?.by_disposition).toEqual({ in_place: 90, leaving: 20, delete: 10 });
  });
});

describe("the wire vocabulary is the server's own", () => {
  it("names the three paths and their terminal events", () => {
    expect(MAP_PAGES_PATH).toBe("/seo/sites/{site_id}/map/pages");
    expect(MAP_REGIONS_PATH).toBe("/seo/sites/{site_id}/map/regions");
    expect(PROPOSE_INTENTS_PATH).toBe("/seo/sites/{site_id}/map/intents");
    expect(MAP_PAGES_FINAL_KIND).toBe("seo.map_pages_complete");
    expect(MAP_REGIONS_FINAL_KIND).toBe("seo.map_regions_complete");
    // The proposer's result_kind and its final event deliberately differ:
    // `map.intents` names the RESULT, `seo.propose_intents_complete`
    // names the EVENT (aidream `run_streamed_command(final_event=...)`).
    expect(PROPOSE_INTENTS_FINAL_KIND).toBe("seo.propose_intents_complete");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🚨 THE ONE THING THAT IS NOT DONE, AND SAYS SO.
//
// CONTRACTS §8 requires each body to be `components["schemas"][…]` — the
// GENERATED contract — not an interface transcribed by hand. The three bodies
// above are transcribed, because `types/python-generated/` cannot be
// regenerated where this suite was written: `pnpm sync-types` emits the schema
// by BOOTING aidream, and that needs the five `SUPABASE_MATRIX_*` database
// credentials, which this container does not hold.
//
// So this test is RED on purpose. It is the only thing standing between a
// transcription and the contract, and a transcription that drifts from the
// server is exactly the class the generated types exist to end (DD-128).
//
// THE REMEDY, for the next agent that holds the credentials:
//   1. `pnpm sync-types`  (or steps 2/2b of `scripts/sync-types.mjs` by hand)
//   2. in each of `map-pages.ts` / `map-regions.ts` / `map-intents.ts`, replace
//      the transcribed `*RequestBody` with
//      `components["schemas"]["MapPagesRequest" | "MapRegionsRequest" | "ProposeIntentsRequest"]`
//      and drop the `as unknown as keyof paths` cast in the matching hook.
//   3. delete this block.
// ═══════════════════════════════════════════════════════════════════════════

describe("the generated contract carries these three paths", () => {
  const openApiPath = join(
    __dirname,
    "../../../../types/python-generated/openapi.json",
  );

  it.each([MAP_PAGES_PATH, MAP_REGIONS_PATH, PROPOSE_INTENTS_PATH])(
    "%s is in types/python-generated/openapi.json",
    (path) => {
      expect(existsSync(openApiPath)).toBe(true);
      const document = JSON.parse(readFileSync(openApiPath, "utf-8")) as {
        paths?: Record<string, unknown>;
      };
      expect(Object.keys(document.paths ?? {})).toContain(path);
    },
  );
});
