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
 * Runtime emitter: features/marketing/lib/scopes/marketing-crawls-scope.ts —
 * being built in parallel.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Observed evidence (400-499) ───────────────────────────────────────
  {
    name: "recent_sessions",
    label: "Recent crawl sessions",
    description:
      "The currently loaded crawl-session rows (id, status, trigger, started/finished timestamps, pages discovered/fetched, error) respecting the table's search, filters, sort, and pagination. Empty during initial load or when the site has never been crawled.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 400,
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "active_crawl_id",
    label: "Active crawl session ID",
    description:
      "UUID of the crawl session currently running (or just finished) in the New Crawl workspace's live feed. Empty on the sessions list and whenever no crawl has been started this visit.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 600,
  },
];

export const marketingCrawlsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-crawls",
  readiness: "partial",
  readinessNote: "Values emitted; no groups",
  label: "Marketing Crawls",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/crawls",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the crawl operations desk of a managed website: the list of frozen crawl sessions (web.crawl_session) and the workspace that configures and starts a new crawl. Read the inherited brand_context and site_context first for who the client is and how the site is set up; recent_sessions carries the loaded session rows when bound.
The user comes here to answer "when did we last capture this site, did it succeed, and should we run again?" — and to launch a crawl with the right scope (page limit, concurrency, robots policy, sitemap seeding, render mode).
Sessions are immutable operational records: their status, stats, and error text are evidence of what actually ran. Never invent a session, a page count, or a completion status — if recent_sessions is empty, say the data has not loaded or no crawl has run.
Crawl commands go directly from the browser to the scraper; you plan and diagnose crawls here, you do not fabricate their results.
</surface_intro>`,
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
  // surface-specific optional
  recent_sessions?: Array<Record<string, unknown>>;
  active_crawl_id?: string;
  // baseline
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
