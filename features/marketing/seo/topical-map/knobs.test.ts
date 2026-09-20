// features/marketing/seo/topical-map/knobs.test.ts
//
// FORCING FUNCTIONS for the 53-row knob reader (CONTRACTS §7).
//
// The rows this suite serves are NOT invented: every value below is the
// `default_value` the seeding migration wrote for that row (aidream
// `packages/matrx-seo/matrx_seo/migrations/seo_topical_map_*.sql` and
// `db/migrations/0780*`, `0794*`, `0874*`). The point of each test is a state
// this reader must REFUSE, so every one of them is watched failing against a
// deliberate break before it is believed:
//
//   • a missing row must RAISE — there is no code fallback, by design, because
//     a frozen fallback silently replaces an admin's choice;
//   • `table_default_columns` holding anything but an array of strings must
//     RAISE rather than become a column set that matches nothing;
//   • `bulk_action_confirm: "never"` must turn the SETTING's confirmation off
//     and nothing else.
//
// The knob VALUES are served through a fake `platform.feature_knob` table, not
// through a stubbed `knobBool`/`knobInts`: stubbing the readers would test the
// test. The one thing mocked is the Supabase client, because a unit suite has
// no database.

import { invalidateFeatureKnobs } from "@/lib/knobs/featureKnobs";

import {
  bulkActionNeedsConfirmation,
  readTopicalMapKnobs,
  TOPICAL_MAP_KNOB_KEYS,
  type TopicalMapKnobs,
} from "./knobs";

// ── The fake `platform.feature_knob` window ────────────────────────────────

let ROWS: { feature: string; key: string; value: unknown }[] = [];

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => {
        // `featureKnobs.loadAll()` pages the catalogue through `readAllRows`
        // (`{ count: "exact" }` + `.order().range()`, so the 1001st knob is not
        // silently dropped); `readJsonObjectKnobs()` narrows with
        // `.eq(...).in(...)` first. One thenable builder answers both without
        // pretending to be PostgREST. The fixture always fits a single page —
        // paging itself is pinned in `lib/knobs/featureKnobs.paging.test.ts`.
        const builder = {
          rows: ROWS,
          select() {
            return builder;
          },
          order() {
            return builder;
          },
          range() {
            return builder;
          },
          eq(_column: string, value: string) {
            builder.rows = builder.rows.filter((r) => r.feature === value);
            return builder;
          },
          in(_column: string, values: string[]) {
            builder.rows = builder.rows.filter((r) => values.includes(r.key));
            return builder;
          },
          then(
            resolve: (r: {
              data: unknown;
              error: null;
              count: number;
            }) => unknown,
          ) {
            return Promise.resolve(
              resolve({
                data: builder.rows,
                error: null,
                count: builder.rows.length,
              }),
            );
          },
        };
        return builder;
      },
    }),
  }),
}));

// Capture must never break the caller, and this suite never asserts on it.
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  // A PARTIAL MOCK OF A REAL MODULE DIES ON THE NEXT EXPORT (DD-239): spread
  // the real store so a new export can never take this suite down at import.
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

/**
 * Every `seo.topical_map` row, at the value its own seeding migration wrote.
 * Explicit rather than generated: a fixture built from the key list would have
 * to guess each key's TYPE, which is exactly what these tests measure.
 */
const SEEDED: Record<string, unknown> = {
  bulk_action_confirm: "above_n",
  bulk_action_confirm_threshold: 20,
  default_view: "outline",
  description_regeneration_mode: "queued",
  detail_panel: "window",
  geography_branch_policy: "refuse",
  graph_auto_layout: true,
  graph_band_card_max: 15,
  graph_band_compact_max: 40,
  graph_band_line_max: 200,
  graph_encoding: { size: "pages", fill: "status", ring: "tier", hue: "grouped_facet" },
  home_single_map_opens_workspace: true,
  intent_batch_size: 20,
  intent_colors: {
    in_place: "green",
    leaving: "amber",
    arriving: "blue",
    delete: "red",
    missing: "gray_dashed",
    planned: "purple_dashed",
  },
  intent_concurrent_batches: 2,
  intent_confidence_floor: 70,
  intent_consecutive_failure_stop: 3,
  intent_daily_page_ceiling: 1000,
  intent_max_attempts: 3,
  intent_review_mode: "one_by_one",
  intent_sibling_roster_max: 25,
  intent_stale_claim_minutes: 20,
  intent_summary_max_words: 60,
  map_agent_change_mode: "propose",
  mapping_batch_size: 50,
  mapping_concurrent_batches: 2,
  mapping_confidence_floor: 60,
  mapping_consecutive_failure_stop: 3,
  mapping_daily_page_ceiling: 2000,
  mapping_max_attempts: 3,
  mapping_max_topics_per_page: 3,
  mapping_stale_claim_minutes: 20,
  neighborhood_max_nodes: 50,
  neighborhood_min_nodes: 25,
  outline_description_max_chars: 300,
  outline_detail: "labels",
  outline_hover_popover: true,
  outline_intent_dots: true,
  outline_max_chars: 40000,
  overview_max_nodes: 150,
  overview_min_nodes: 50,
  page_summary_max_words: 50,
  pages_low_traffic_clicks_max: 0,
  performance_window_days: 28,
  proposal_mode: "auto_apply_initial",
  proposal_review_mode: "one_by_one",
  region_binding_batch_size: 250,
  region_daily_page_ceiling: 20000,
  region_min_pages_per_value: 2,
  region_value_evidence: "confirmed_only",
  table_default_columns: [
    "topic",
    "pages",
    "planned",
    "keywords",
    "status",
    "leaving",
    "arriving",
  ],
  topic_agent_change_mode: "apply",
  topic_description_max_chars: 1200,
};

function serve(overrides: Record<string, unknown> = {}, drop: string[] = []): void {
  ROWS = Object.entries({ ...SEEDED, ...overrides })
    .filter(([key]) => !drop.includes(key))
    .map(([key, value]) => ({ feature: "seo.topical_map", key, value }));
  // Another feature's rows share the window — a reader that ignored `feature`
  // would collide with them, so they are always present.
  ROWS.push({ feature: "tables.density", key: "mode", value: "normal" });
  invalidateFeatureKnobs();
}

beforeEach(() => serve());

describe("the key set IS the row set", () => {
  it("declares exactly the 53 keys the database holds, with no duplicates", () => {
    expect(TOPICAL_MAP_KNOB_KEYS).toHaveLength(53);
    expect(new Set(TOPICAL_MAP_KNOB_KEYS).size).toBe(53);
  });

  it("names the same 53 keys this suite serves", () => {
    // If a key is added to the reader without a seeded value here, the suite
    // stops measuring that key rather than quietly passing.
    expect([...TOPICAL_MAP_KNOB_KEYS].sort()).toEqual(Object.keys(SEEDED).sort());
  });

  it("reads every one of them", async () => {
    const knobs = await readTopicalMapKnobs();
    for (const key of TOPICAL_MAP_KNOB_KEYS) {
      expect(knobs[key]).toBeDefined();
    }
    expect(knobs.table_default_columns).toEqual(SEEDED.table_default_columns);
    expect(knobs.geography_branch_policy).toBe("refuse");
    expect(knobs.region_value_evidence).toBe("confirmed_only");
    expect(knobs.pages_low_traffic_clicks_max).toBe(0);
    expect(knobs.graph_auto_layout).toBe(true);
    expect(knobs.home_single_map_opens_workspace).toBe(true);
    expect(knobs.outline_intent_dots).toBe(true);
  });
});

describe("a missing row RAISES — there is no code fallback", () => {
  it.each([
    "pages_low_traffic_clicks_max",
    "graph_auto_layout",
    "default_view",
    "table_default_columns",
    "graph_encoding",
  ])("%s", async (key) => {
    serve({}, [key]);
    await expect(readTopicalMapKnobs()).rejects.toThrow(
      new RegExp(`(Missing feature knob "seo\\.topical_map\\.${key}"|${key})`),
    );
  });
});

describe("table_default_columns is an ORDERED LIST, and anything else RAISES", () => {
  it.each([
    ["a JSON object", { topic: true, pages: true }],
    ["a comma-separated string", "topic,pages,planned"],
    ["a number", 7],
    ["null", null],
  ])("%s is refused, never coerced into a column set", async (_label, value) => {
    serve({ table_default_columns: value });
    await expect(readTopicalMapKnobs()).rejects.toThrow(/is not a JSON array/);
  });

  it("an array carrying a non-string member is refused too", async () => {
    serve({ table_default_columns: ["topic", null, "pages"] });
    await expect(readTopicalMapKnobs()).rejects.toThrow(/entry 1 is not a string/);
  });
});

describe("a malformed json legend RAISES rather than half-drawing", () => {
  it("graph_encoding missing a field", async () => {
    serve({ graph_encoding: { size: "pages", fill: "status", ring: "tier" } });
    await expect(readTopicalMapKnobs()).rejects.toThrow(/is missing "hue"/);
  });

  it("intent_colors that is an array, not an object", async () => {
    serve({ intent_colors: ["green", "amber"] });
    await expect(readTopicalMapKnobs()).rejects.toThrow(/is not a JSON object/);
  });
});

describe("bulk_action_confirm honours every value of its own row", () => {
  const base = { bulk_action_confirm_threshold: 20 } as TopicalMapKnobs;

  it("always — every batch stops, even one item", () => {
    const knobs = { ...base, bulk_action_confirm: "always" } as TopicalMapKnobs;
    expect(bulkActionNeedsConfirmation(knobs, 1)).toBe(true);
    expect(bulkActionNeedsConfirmation(knobs, 500)).toBe(true);
  });

  it("above_n — the threshold decides, and equals it is NOT above it", () => {
    const knobs = { ...base, bulk_action_confirm: "above_n" } as TopicalMapKnobs;
    expect(bulkActionNeedsConfirmation(knobs, 19)).toBe(false);
    expect(bulkActionNeedsConfirmation(knobs, 20)).toBe(false);
    expect(bulkActionNeedsConfirmation(knobs, 21)).toBe(true);
  });

  it("never — the SETTING's confirmation is off, at every size", () => {
    // The value the reader did not know until 2026-09-17. It turns off this
    // setting and nothing else: a destructive or expensive click still states
    // its consequence, which is a law, not a preference.
    const knobs = { ...base, bulk_action_confirm: "never" } as TopicalMapKnobs;
    expect(bulkActionNeedsConfirmation(knobs, 1)).toBe(false);
    expect(bulkActionNeedsConfirmation(knobs, 10_000)).toBe(false);
  });

  it("reads `never` end to end, out of the row", async () => {
    serve({ bulk_action_confirm: "never" });
    const knobs = await readTopicalMapKnobs();
    expect(knobs.bulk_action_confirm).toBe("never");
    expect(bulkActionNeedsConfirmation(knobs, 10_000)).toBe(false);
  });
});

describe("an enum value this build does not implement degrades, it does not blank the screen", () => {
  it("falls back to the ROW's own default and keeps every other knob", async () => {
    serve({ default_view: "a_view_this_build_has_never_heard_of" });
    const knobs = await readTopicalMapKnobs();
    expect(knobs.default_view).toBe("outline");
    expect(knobs.outline_max_chars).toBe(40000);
  });
});
