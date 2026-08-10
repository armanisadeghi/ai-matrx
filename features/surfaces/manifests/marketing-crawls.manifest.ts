/**
 * Surface manifest — Marketing crawls list (`matrx-user/marketing-crawls`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/crawls` and
 * `.../crawls/new` — the crawl operations desk of the Marketing system
 * (`features/marketing`, `CrawlsTable` + `NewCrawlWorkspace`). The table pages
 * through frozen `web.crawl_session` rows (status, trigger, duration,
 * discovered/captured counts, error); the New Crawl workspace configures a
 * command (max pages, concurrency, robots, sitemap seeding, render mode) and
 * sends it directly to the scraper, rendering the transient NDJSON feed.
 * Inherits the brand + site context backbone from `matrx-user/marketing-site`.
 *
 * Runtime emitters (two pages, one surface — each emits its own half, so every
 * surface-specific value is `alwaysAvailable: false`):
 *   - `CrawlsTable` (sessions list) → sessions group
 *   - `NewCrawlWorkspace` (/crawls/new) → crawl command + live run groups
 *
 * Agent-writable: the New Crawl workspace only, and only the crawl command it
 * stages — see the `writeTargets` docblock below for the split and for what is
 * deliberately left to the human.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  CRAWL_COMMAND_TOGGLES,
  CRAWL_CONCURRENCY_BOUNDS,
  CRAWL_MAX_PAGES_BOUNDS,
  CRAWL_RENDER_MODES,
} from "@/features/marketing/crawler/crawl-options";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "crawl_sessions",
    label: "Crawl sessions",
    sortOrder: 100,
    description:
      "The frozen crawl-session history listed on the sessions table, as currently queried.",
  },
  {
    key: "crawl_command",
    label: "Crawl command",
    sortOrder: 200,
    description:
      "The configuration the New Crawl workspace will send to the scraper.",
  },
  {
    key: "live_run",
    label: "Live run",
    sortOrder: 300,
    description:
      "State of the crawl started (or restored) in the New Crawl workspace this visit.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Crawl sessions (sessions list page) ───────────────────────────────
  {
    name: "recent_sessions",
    label: "Recent crawl sessions",
    description:
      "The currently loaded crawl-session rows (id, status, trigger, started/finished timestamps, pages discovered/fetched, error) respecting the table's search, filters, sort, and pagination — capped at the first 20 loaded rows. Empty during initial load, on the New Crawl page, or when the site has never been crawled.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 400,
    group: "crawl_sessions",
  },
  {
    name: "sessions_total",
    label: "Total crawl sessions",
    description:
      "Total number of crawl sessions matching the table's current search and filters (the server count behind the pager, not the loaded page size). Empty on the New Crawl page and during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 410,
    group: "crawl_sessions",
  },
  {
    name: "sessions_query",
    label: "Sessions table query",
    description:
      "The live query state driving the sessions table: search text, column filters, sort column + direction, page, and page size. Explains WHY recent_sessions holds the rows it holds. Empty on the New Crawl page.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 220,
    autoContext: false,
    sortOrder: 420,
    group: "crawl_sessions",
  },

  // ── Crawl command (New Crawl workspace) ───────────────────────────────
  {
    name: "crawl_options",
    label: "Crawl options",
    description:
      `The crawl command currently configured in the New Crawl workspace: max_pages, concurrency, render_mode (${CRAWL_RENDER_MODES.join(" | ")}), ${CRAWL_COMMAND_TOGGLES.join(", ")}, plus include_patterns and exclude_patterns as the launch form has them parsed right now. Seeded from the site's crawl defaults. Empty on the sessions list page.`,
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 260,
    sortOrder: 500,
    group: "crawl_command",
  },

  // ── Live run (New Crawl workspace) ────────────────────────────────────
  {
    name: "active_crawl_id",
    label: "Active crawl session ID",
    description:
      "UUID of the crawl session currently running (or just finished, or restored from a run still in flight) in the New Crawl workspace's live feed. Empty on the sessions list and whenever no crawl has been started this visit.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 600,
    group: "live_run",
  },
  {
    name: "crawl_run_status",
    label: "Live run status",
    description:
      "Status of the New Crawl workspace's run right now: idle | connecting | running | canceling | complete | partial | failed. This is UI run state, not the durable session status. Empty on the sessions list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 610,
    group: "live_run",
  },
  {
    name: "live_events",
    label: "Live crawl events",
    description:
      "The most recent scraper events shown in the live feed (merged durable web.crawl_event rows + the in-flight NDJSON stream), newest last, capped at 50. Empty on the sessions list page and before a crawl produces events.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 620,
    group: "live_run",
  },
  {
    name: "crawl_run_error",
    label: "Live run error",
    description:
      "The error message currently displayed by the New Crawl workspace (from the run itself or the crawl-activity subscription). Empty on clean runs and on the sessions list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 630,
    group: "live_run",
  },
];

/**
 * Write half — the crawl COMMAND, and only on the New Crawl workspace.
 *
 * Why these earn targets: scoping a crawl is the planning judgement an agent
 * makes better than a hand-typing human. "Only the blog, skip tag pages, cap
 * it at 200 pages" is one sentence of intent that has to become a page limit,
 * a concurrency, a render mode, and two lists of path regexes — derived from
 * the site context and crawl history the agent is already reading here.
 *
 * Why THREE targets and not one, and not nine:
 *   - `crawl_options` is ONE object because the numbers, the render mode, and
 *     the four toggles are a single "how hard do we hit this host" decision,
 *     edited together, held in one `options` state object. Five micro-targets
 *     would make the user confirm one coherent command five times.
 *   - the pattern lists are their OWN targets because they are the crawl's
 *     SCOPE, not its intensity: they are the decision a user most wants to
 *     read and approve on its own rather than buried inside a settings blob,
 *     they are frequently set alone (excludes without includes), they live in
 *     separate raw-textarea state, and their semantics differ — full-list
 *     replacement of validated regexes, versus a partial key patch.
 *
 * Deliberately NOT targets:
 *   - Starting or canceling a crawl. A crawl spends real time and budget and
 *     hammers someone else's server; the human presses Start crawl. Every
 *     target here is `mode: "draft"` for exactly that reason — the agent
 *     stages a command, the user launches it.
 *   - The `CrawlStartOptions` keys this form renders no control for
 *     (max_depth, politeness_delay_ms, host_rps, host_burst, seed_urls,
 *     screenshot_kinds, list_mode). Staging a value the user cannot see or
 *     correct is not a draft; those keep the site's saved crawl defaults.
 *
 * Mount split (deepest-wins resolution means both mounts coexist, and a
 * target is only OFFERED where that mount registered a handler):
 *   - `NewCrawlWorkspace` (/crawls/new) owns the draft state and registers all
 *     three handlers.
 *   - `CrawlsTable` (/crawls) registers NONE, on purpose. It owns only the
 *     table's search/filter/sort/page state over `web.crawl_session` rows that
 *     are immutable operational evidence — pure-mechanical view state nobody
 *     would ask an agent to flip, on records nothing may edit.
 *
 * Vocabulary and bounds are interpolated from
 * `features/marketing/crawler/crawl-options.ts`, the same module the launch
 * form renders from and the handler validates against.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "crawl_options",
    label: "Crawl options",
    description: [
      "Stages crawl-command settings into the New Crawl workspace's launch form — the same controls the user would set by hand.",
      `Object with any of: max_pages (integer ${CRAWL_MAX_PAGES_BOUNDS.min}-${CRAWL_MAX_PAGES_BOUNDS.max}), concurrency (integer ${CRAWL_CONCURRENCY_BOUNDS.min}-${CRAWL_CONCURRENCY_BOUNDS.max}), render_mode (${CRAWL_RENDER_MODES.join(" | ")}), and the booleans ${CRAWL_COMMAND_TOGGLES.join(", ")}.`,
      "Partial patch: only the keys you send change, so omit a key to leave the user's value alone. Read crawl_options first to see what is set.",
      "max_pages is a safety stop, not a target — the crawl ends when the site runs out of pages. concurrency is faster but harder on the site; 8 suits most hosts. respect_robots is off by default for authorized first-party crawls.",
      "No other crawl setting is accepted here — the launch form renders no control for max_depth, politeness_delay_ms, host_rps, host_burst, seed_urls, screenshot_kinds or list_mode, and those keep the site's saved crawl defaults.",
      "Staged only: nothing reaches the scraper until the user presses Start crawl.",
    ].join(" "),
    valueType: "object",
    updatesValue: "crawl_options",
    mode: "draft",
    applyPolicy: "ask",
    group: "crawl_command",
    sortOrder: 500,
  },
  {
    name: "crawl_include_patterns",
    label: "Include URL patterns",
    description: [
      "Stages the crawl's include list — the whitelist that narrows which discovered URLs get fetched.",
      "Array of strings, each a JavaScript regular expression matched against the URL PATH, not a glob: \"^/blog/\" restricts the crawl to the blog. An invalid or blank pattern is rejected, never silently dropped.",
      "REPLACES the full list — include every pattern you want kept, read from crawl_options.include_patterns. An empty array means no restriction: crawl every path discovered.",
      "Staged only: nothing reaches the scraper until the user presses Start crawl.",
    ].join(" "),
    valueType: "array",
    updatesValue: "crawl_options",
    mode: "draft",
    applyPolicy: "ask",
    group: "crawl_command",
    sortOrder: 510,
  },
  {
    name: "crawl_exclude_patterns",
    label: "Exclude URL patterns",
    description: [
      "Stages the crawl's exclude list — the blacklist that drops discovered URLs before they are fetched, and wins over the include list.",
      "Array of strings, each a JavaScript regular expression matched against the URL PATH, not a glob: \"^/tag/\" skips tag pages. An invalid or blank pattern is rejected, never silently dropped.",
      "REPLACES the full list — include every pattern you want kept, read from crawl_options.exclude_patterns. An empty array means no exclusions.",
      "Staged only: nothing reaches the scraper until the user presses Start crawl.",
    ].join(" "),
    valueType: "array",
    updatesValue: "crawl_options",
    mode: "draft",
    applyPolicy: "ask",
    group: "crawl_command",
    sortOrder: 520,
  },
];

export const marketingCrawlsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-crawls",
  readiness: "verified",
  label: "Marketing Crawls",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/crawls",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the crawl operations desk of a managed website: the list of frozen crawl sessions (web.crawl_session) and the workspace that configures and starts a new crawl. Read the inherited brand_context and site_context first for who the client is and how the site is set up; recent_sessions carries the loaded session rows when bound.
The user comes here to answer "when did we last capture this site, did it succeed, and should we run again?" — and to launch a crawl with the right scope (page limit, concurrency, robots policy, sitemap seeding, render mode).
Sessions are immutable operational records: their status, stats, and error text are evidence of what actually ran. Never invent a session, a page count, or a completion status — if recent_sessions is empty, say the data has not loaded or no crawl has run.
Crawl commands go directly from the browser to the scraper; you plan and diagnose crawls here, you do not fabricate their results.
This surface spans two pages and each emits only its own half. On the sessions list you get recent_sessions, sessions_total, and sessions_query (the search/filter/sort/page state that explains which rows loaded). On the New Crawl page you get crawl_options (the command about to be sent), plus the live run: active_crawl_id, crawl_run_status, live_events, crawl_run_error. An empty value from the other half means the user simply is not on that page — never that the data is missing.
crawl_run_status is transient UI state for this visit; the durable session record and its status live on the crawl-session surface.
On the New Crawl page you can also STAGE the command for the user: crawl_options for the limits, render mode, and toggles, and crawl_include_patterns / crawl_exclude_patterns for the scope. Staging only fills the form — the user presses Start crawl, because a crawl spends real time against the client's own server.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "crawl_planner",
      label: "Crawl planner",
      description:
        "Recommends crawl scope and settings (page limits, concurrency, render mode, sitemap seeding) for this site based on its size, history, and goals.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "crawl_diagnostician",
      label: "Crawl diagnostician",
      description:
        "Explains failed, partial, or suspicious crawl sessions from their status, stats, and error evidence, and proposes the fix or re-run strategy.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the ones
 * inherited from marketing-site (site_id) and marketing-brand (brand_id).
 */
export function createMarketingCrawlsScope(values: {
  // alwaysAvailable: true (inherited) → required
  brand_id: string;
  site_id: string;
  // inherited optional context
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  gsc_synced_at?: string;
  // surface-specific optional
  recent_sessions?: Array<Record<string, unknown>>;
  sessions_total?: number;
  sessions_query?: Record<string, unknown>;
  crawl_options?: Record<string, unknown>;
  active_crawl_id?: string;
  crawl_run_status?: string;
  live_events?: Array<Record<string, unknown>>;
  crawl_run_error?: string;
  // baseline
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
