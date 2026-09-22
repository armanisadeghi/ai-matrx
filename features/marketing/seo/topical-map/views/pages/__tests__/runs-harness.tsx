// features/marketing/seo/topical-map/views/pages/__tests__/runs-harness.tsx
//
// The render harness and the fixtures the `runs-*` suites share. NOT a suite
// itself — Jest's `testMatch` is `*.(test|spec).[jt]s?(x)`, so this file is
// imported, never collected.
//
// 🚨 WHY THERE IS A HARNESS HERE AT ALL. `@testing-library/react` is not a
// dependency of this repo and adding one would edit `package.json` +
// `pnpm-lock.yaml` — shared files this lane does not own, on a checkout where
// every other lane runs `pnpm install --frozen-lockfile`. `test-utils/renderHook.tsx`
// already made the same call for hooks and says so in its header ("If a suite
// ever needs queries, events, or component trees, install the real library
// then"). This is that file's component twin: mount, read the text, click a
// button. It is deliberately not a reimplementation of a testing framework, and
// the moment the library lands these suites should move onto it.
//
// WHAT IS MOCKED AND WHY: hook boundaries (the three run hooks, the ledger
// readers, the topic search, the upsert), plus `@ai-matrx/design-system` —
// Radix's Popover renders its content into a portal only after a real pointer
// interaction, which jsdom does not have. Mocking the component library keeps
// the assertions on OUR words and OUR ordering; none of the behaviour under
// test lives inside Radix.

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import type { DurableRunHandle } from "@/lib/durable-run/useDurableRun";
import type { Database } from "@/types/database.types";
import type { TopicalMapKnobs } from "../../../knobs";
import type { MapPagesResult } from "../../../map-pages";
import type { MapRegionsResult } from "../../../map-regions";
import type { ProposeIntentsResult } from "../../../map-intents";
import type { MapPagesRunHandle } from "../../../useMapPagesRun";
import type { MapRegionsRunHandle } from "../../../useMapRegionsRun";
import type { ProposeIntentsRunHandle } from "../../../useProposeIntentsRun";
import type { PagesWorkspaceContext } from "../seams";

// React refuses to run `act` without this flag and warns on every update.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

export interface Screen {
  container: HTMLElement;
  /** Everything on screen, whitespace collapsed, for sentence assertions. */
  text: () => string;
  /** The first button whose visible text contains `label`, or null. */
  button: (label: string) => HTMLButtonElement | null;
  /** Any element by CSS selector — used for the switches, which carry no text. */
  find: (selector: string) => Element | null;
  click: (element: Element) => Promise<void>;
  act: (fn: () => void | Promise<void>) => Promise<void>;
  rerender: (element: React.ReactElement) => Promise<void>;
  unmount: () => Promise<void>;
}

export async function render(element: React.ReactElement): Promise<Screen> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(element);
  });

  const screen: Screen = {
    container,
    text: () => (container.textContent ?? "").replace(/\s+/g, " ").trim(),
    button: (label) =>
      Array.from(container.querySelectorAll("button")).find((node) =>
        (node.textContent ?? "").replace(/\s+/g, " ").includes(label),
      ) ?? null,
    find: (selector) => container.querySelector(selector),
    click: async (target) => {
      await act(async () => {
        target.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
    },
    act: async (fn) => {
      await act(async () => {
        await fn();
      });
    },
    rerender: async (next) => {
      await act(async () => {
        root.render(next);
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
  return screen;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

/**
 * One row of `seo.page_mapping_status`, shaped as
 * `Database["seo"]["Functions"]["page_mapping_status"]["Returns"][number]` —
 * the generated contract, not a hand-drawn approximation. NOTE what it does NOT
 * carry: `mapped_today` and `daily_ceiling` are absent from this row by design,
 * which is why the consequence sentence never quotes them.
 */
export type PageMappingStatusRow =
  Database["seo"]["Functions"]["page_mapping_status"]["Returns"][number];

export function statusRow(
  overrides: Partial<PageMappingStatusRow> = {},
): PageMappingStatusRow {
  return {
    clicks: 9_400,
    clicks_mapped: 3_100,
    demand_as_of: "2026-09-17T00:00:00Z",
    demand_window_days: 28,
    impressions: 240_000,
    impressions_mapped: 88_000,
    last_error: "",
    last_mapped_at: "2026-09-17T11:02:00Z",
    next_url: "https://example.com/roof-repair",
    pages: 4_120,
    pages_mapped: 1_204,
    pending_clicks: 812,
    placed_by_agent: 0,
    placed_by_human: 44,
    placed_by_mapper: 1_160,
    queue_failed: 3,
    queue_no_topic: 61,
    queue_pending: 2_916,
    queue_refreshed_at: "2026-09-17T11:00:00Z",
    queue_running: 0,
    wanted_topics: 7,
    ...overrides,
  };
}

/** `Database["seo"]["Functions"]["page_mapping_wanted_topics"]["Returns"][number]`. */
export type WantedTopicRow =
  Database["seo"]["Functions"]["page_mapping_wanted_topics"]["Returns"][number];

export function wantedTopicRow(
  overrides: Partial<WantedTopicRow> = {},
): WantedTopicRow {
  return {
    clicks: 310,
    example_reason: "These pages all describe emergency tarping.",
    example_urls: ["https://example.com/emergency-tarping"],
    impressions: 9_800,
    pages: 6,
    suggested_topic_name: "Emergency tarping",
    ...overrides,
  };
}

/** `…["page_mapping_wanted_topics_held_back"]["Returns"][number]`. */
export type HeldBackTopicRow =
  Database["seo"]["Functions"]["page_mapping_wanted_topics_held_back"]["Returns"][number];

export function heldBackTopicRow(
  overrides: Partial<HeldBackTopicRow> = {},
): HeldBackTopicRow {
  return {
    clicks: 4,
    example_reason: "One page mentions gutter guards.",
    example_urls: ["https://example.com/gutter-guards"],
    held_back_because:
      "Only one page asks for this and we have not crawled it yet. Crawl it, or find a second page, and it is promoted.",
    impressions: 40,
    pages: 1,
    suggested_topic_name: "Gutter guards",
    ...overrides,
  };
}

/**
 * Every `seo.topical_map` knob at the value its seeding migration wrote — the
 * same figures `knobs.test.ts` pins. The controls read the knob for every
 * placeholder and chip, so a fixture missing one would not compile.
 */
export const KNOBS: TopicalMapKnobs = {
  table_page_size: 100,
  history_page_size: 200,
  wanted_topic_limit: 20,
  default_view: "outline",
  outline_detail: "labels",
  outline_hover_popover: true,
  outline_intent_dots: true,
  outline_description_max_chars: 300,
  outline_max_chars: 40_000,
  graph_band_card_max: 15,
  graph_band_compact_max: 40,
  graph_band_line_max: 200,
  graph_encoding: {
    size: "pages",
    fill: "status",
    ring: "tier",
    hue: "grouped_facet",
  },
  graph_auto_layout: true,
  table_default_columns: ["topic", "pages", "planned", "keywords", "status"],
  detail_panel: "window",
  topic_agent_change_mode: "apply",
  map_agent_change_mode: "propose",
  description_regeneration_mode: "queued",
  proposal_mode: "auto_apply_initial",
  proposal_review_mode: "one_by_one",
  home_single_map_opens_workspace: true,
  intent_review_mode: "one_by_one",
  bulk_action_confirm: "above_n",
  bulk_action_confirm_threshold: 20,
  intent_colors: {
    in_place: "green",
    leaving: "amber",
    arriving: "blue",
    delete: "red",
    missing: "gray_dashed",
    planned: "purple_dashed",
  },
  performance_window_days: 28,
  pages_low_traffic_clicks_max: 0,
  mapping_batch_size: 50,
  mapping_concurrent_batches: 2,
  mapping_confidence_floor: 60,
  mapping_consecutive_failure_stop: 3,
  mapping_daily_page_ceiling: 2_000,
  mapping_max_attempts: 3,
  mapping_max_topics_per_page: 3,
  mapping_stale_claim_minutes: 20,
  intent_batch_size: 20,
  intent_concurrent_batches: 2,
  intent_confidence_floor: 70,
  intent_consecutive_failure_stop: 3,
  intent_daily_page_ceiling: 1_000,
  intent_max_attempts: 3,
  intent_sibling_roster_max: 25,
  intent_stale_claim_minutes: 20,
  intent_summary_max_words: 60,
  region_binding_batch_size: 250,
  region_daily_page_ceiling: 20_000,
  region_min_pages_per_value: 2,
  region_value_evidence: "confirmed_only",
  geography_branch_policy: "refuse",
  overview_min_nodes: 50,
  overview_max_nodes: 150,
  neighborhood_min_nodes: 25,
  neighborhood_max_nodes: 50,
  topic_description_max_chars: 1_200,
  page_summary_max_words: 50,
};

export function context(
  overrides: Partial<PagesWorkspaceContext> = {},
): PagesWorkspaceContext {
  return {
    mapId: "map-1",
    siteId: "site-1",
    readOnly: false,
    knobs: KNOBS,
    organizationId: "org-1",
    siteIds: ["site-1"],
    ...overrides,
  };
}

/**
 * A TanStack query result as the controls actually read it — `isPending`,
 * `isError`, `isSuccess`, `data`, `error` and nothing else.
 *
 * The ONE cast in these suites lives here, not in a test. `UseQueryResult` is a
 * four-way discriminated union of ~25 fields per variant, none of which any
 * control touches; building all four honestly would be a fixture that measures
 * TanStack rather than this screen. Keeping the cast in one named helper means
 * no suite can quietly widen it into something that hides a real type error.
 */
export function query<T, E = Error>(
  state: "pending" | "error" | "success",
  data?: T,
  error?: E,
): UseQueryResult<T, E> {
  return {
    isPending: state === "pending",
    isError: state === "error",
    isSuccess: state === "success",
    data,
    error,
  } as unknown as UseQueryResult<T, E>;
}

/** Same deal for a mutation: the controls call `mutateAsync` and nothing else. */
export function mutation<TData, TVariables>(
  mutateAsync: (variables: TVariables) => Promise<TData>,
): UseMutationResult<TData, Error, TVariables> {
  return { mutateAsync, isPending: false } as unknown as UseMutationResult<
    TData,
    Error,
    TVariables
  >;
}

/** The idle `DurableRunHandle` every run stub starts from. */
function baseHandle<T>(): DurableRunHandle<T> {
  return {
    status: "idle",
    stage: null,
    stages: [],
    result: null,
    error: null,
    stoppedMessage: null,
    runId: null,
    rejoinedTarget: null,
    interruption: null,
    requestId: null,
    memo: null,
    running: false,
    restoring: false,
    launch: jest.fn(async () => undefined),
    reset: jest.fn(),
    fail: jest.fn(),
    cancel: null,
    cancelling: false,
    retry: null,
    elapsedMs: 0,
    startedAt: null,
    expectedMs: 60_000,
    overdue: false,
    waitMessage: null,
    surfacing: false,
    dismiss: jest.fn(),
  };
}

export function pagesHandle(
  overrides: Partial<MapPagesRunHandle> = {},
): MapPagesRunHandle {
  return {
    ...baseHandle<MapPagesResult>(),
    run: jest.fn(async () => undefined),
    ...overrides,
  };
}

export function regionsHandle(
  overrides: Partial<MapRegionsRunHandle> = {},
): MapRegionsRunHandle {
  return {
    ...baseHandle<MapRegionsResult>(),
    run: jest.fn(async () => undefined),
    ...overrides,
  };
}

export function intentsHandle(
  overrides: Partial<ProposeIntentsRunHandle> = {},
): ProposeIntentsRunHandle {
  return {
    ...baseHandle<ProposeIntentsResult>(),
    run: jest.fn(async () => undefined),
    ...overrides,
  };
}

export function mapPagesResult(
  overrides: Partial<MapPagesResult> = {},
): MapPagesResult {
  return {
    result_kind: "seo.map_pages",
    site_id: "site-1",
    map_id: "map-1",
    dry_run: false,
    scanned: 600,
    refreshed: true,
    skipped_planned: 0,
    skipped_missing: 0,
    batches: 12,
    claimed: 600,
    mapped: 540,
    edges_written: 703,
    no_topic: 41,
    kept_existing: 19,
    dropped_low_confidence: 4,
    dropped_unknown_slug: 1,
    dropped_geography_topic: 0,
    reasons_normalized_uncrawled: 0,
    returned_to_queue: 0,
    quarantined: 0,
    failed_batches: 0,
    queue_pending: 2_316,
    queue_done: 1_744,
    queue_no_topic: 61,
    queue_failed: 3,
    placed_by_human: 44,
    pending_clicks: 640,
    ceiling_reached: false,
    daily_ceiling: 2_000,
    mapped_today: 540,
    stopped_on_repeated_failure: false,
    consecutive_failures: 0,
    wanted_topics: [],
    examples: [],
    notes: [],
    error: null,
    ...overrides,
  };
}

export function mapRegionsResult(
  overrides: Partial<MapRegionsResult> = {},
): MapRegionsResult {
  return {
    result_kind: "seo.map_regions",
    site_id: "site-1",
    brand_id: "brand-1",
    map_id: "map-1",
    dry_run: true,
    pages_scanned: 900,
    pages_with_a_place: 557,
    values_before: 0,
    values_created: [],
    values_existing: [],
    values_held_back: [],
    plan: [],
    pages_with_region_before: 0,
    pages_bound: 0,
    pages_kept_existing: 0,
    pages_already_correct: 0,
    pages_without_a_place: 343,
    pages_with_region_after: 0,
    geography_branches: [],
    pages_recovered_from_geography: 0,
    pages_left_without_topic: 0,
    examples_left_without_topic: [],
    ceiling_reached: false,
    daily_ceiling: 20_000,
    bound_today: 0,
    examples: [],
    notes: [],
    error: null,
    ...overrides,
  };
}

export function proposeIntentsResult(
  overrides: Partial<ProposeIntentsResult> = {},
): ProposeIntentsResult {
  return {
    result_kind: "seo.propose_page_intents",
    site_id: "site-1",
    map_id: "map-1",
    dry_run: false,
    scanned: 400,
    refreshed: true,
    skipped_no_topic: 0,
    batches: 20,
    topics_touched: 11,
    claimed: 400,
    proposed: 362,
    returned_to_queue: 0,
    held_by_human: 5,
    quarantined: 0,
    failed_batches: 0,
    downgraded_low_confidence: 0,
    downgraded_traffic_or_links: 0,
    downgraded_unknown_destination: 0,
    downgraded_self_destination: 0,
    rendition_retargeted: 0,
    dropped_unknown_slug: 0,
    dropped_locked: 0,
    kept_existing: 12,
    by_disposition: { keep: 300, redirect: 41, merge: 21 },
    queue_pending: 0,
    queue_done: 400,
    queue_held: 5,
    queue_failed: 0,
    topics_pending: 0,
    pending_clicks: 0,
    ceiling_reached: false,
    daily_ceiling: 1_000,
    proposed_today: 362,
    stopped_on_repeated_failure: false,
    consecutive_failures: 0,
    examples: [],
    notes: [],
    error: null,
    ...overrides,
  };
}
