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
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
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
      "The crawl command currently configured in the New Crawl workspace: max_pages, concurrency, render_mode (http_first | http_only | browser_always | browser_with_screenshot), respect_robots, seed_from_sitemap, follow_subdomains, capture_screenshots. Seeded from the site's crawl defaults. Empty on the sessions list page.",
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
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
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
