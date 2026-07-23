/**
 * Surface manifest — Marketing crawl session (`matrx-user/marketing-crawl`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/crawls/[crawlId]/**` —
 * one frozen `web.crawl_session` and everything hanging off it: the summary
 * (timing, frozen scope, reconciliation/run stats, metadata — `CrawlSummary`),
 * the URL ledger, durable event log, run-scoped snapshots/links, and the ten
 * technical crawl reports (`CrawlReportWorkspace` over the stable keys in
 * `lib/crawl-reports.ts`: response-codes, page-titles, meta-descriptions,
 * headings, canonicals, directives, images, content, structured-data,
 * performance). Inherits the brand + site context backbone from
 * `matrx-user/marketing-site` directly (deliberately NOT from
 * marketing-crawls — inheritance depth guard).
 *
 * Runtime emitter: features/marketing/lib/scopes/marketing-crawl-scope.ts —
 * being built in parallel.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Identity (300-349) ────────────────────────────────────────────────
  {
    name: "crawl_id",
    label: "Crawl session ID",
    description:
      "UUID of the `web.crawl_session` the user has open. Always present — the route carries it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 320,
  },

  // ── Observed evidence (400-499) ───────────────────────────────────────
  {
    name: "crawl_status",
    label: "Crawl status",
    description:
      "Lifecycle status of the session (queued / running / complete / partial / failed). Populated once the workspace has loaded; empty during initial load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 400,
  },
  {
    name: "crawl_stats",
    label: "Crawl run stats",
    description:
      "The session's stats jsonb: pages discovered/fetched/failed plus registry reconciliation counts (new, missing). Immutable operational evidence of what the run actually did. Empty during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 410,
  },
  {
    name: "crawl_scope",
    label: "Frozen crawl scope",
    description:
      "The scope this session was frozen with (seeds, limits, inclusion rules, render mode). Explains coverage — why a URL was or was not visited. Empty during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    autoContext: false,
    sortOrder: 420,
  },
  {
    name: "crawl_error",
    label: "Crawl error",
    description:
      "Error text recorded on the session when the run failed or ended partially. Empty for clean runs and during initial load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 430,
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "report_key",
    label: "Open report key",
    description:
      'Stable key of the technical crawl report the user has open (e.g. "response-codes", "page-titles", "canonicals" — see lib/crawl-reports.ts). Empty outside the /reports/* child routes.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 18,
    sortOrder: 600,
  },
  {
    name: "report_summary",
    label: "Open report summary",
    description:
      "Aggregate of the currently open technical report (row counts and headline figures for the loaded report table). Empty outside /reports/* or before the report has loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 610,
  },
];

export const marketingCrawlManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-crawl",
  label: "Marketing Crawl Session",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/crawls/[crawlId]",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are inside one frozen crawl session of a managed website: its timing, frozen scope, run stats, error state, URL ledger, event log, and the ten technical SEO reports built from the run's URL outcomes and immutable snapshots. Read the inherited brand_context and site_context first for the client and site framing; crawl_stats and crawl_scope tell you what this run did and what it was allowed to do.
The user comes here to understand one crawl event: did it complete, what did it find, and what do the technical reports (response codes, titles, descriptions, headings, canonicals, directives, images, content, structured data, performance) reveal about the site as captured in this run.
Everything here is immutable observed evidence of one moment in time — a session, its URL outcomes, and its snapshots are never edited and never re-run in place. Never invent a status, count, or report figure; if a value is empty, the data has not loaded or the run did not produce it.
When report_key is set, the user is focused on that one technical report — interpret its rows against the frozen scope (a "missing" URL may simply have been out of scope) rather than treating every gap as a site defect.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "crawl_diagnostician",
      label: "Crawl diagnostician",
      description:
        "Explains what this session did — completion state, failures, reconciliation deltas — from its frozen scope, stats, and error evidence.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "technical_seo_auditor",
      label: "Technical SEO auditor",
      description:
        "Reads the run's technical reports (response codes, metadata, canonicals, directives, content) and surfaces the site problems this crawl evidences.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "report_interpreter",
      label: "Report interpreter",
      description:
        "Explains the currently open technical report — what its columns mean, which rows matter, and what action each pattern calls for.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the ones
 * inherited from marketing-site (site_id) and marketing-brand (brand_id).
 */
export function createMarketingCrawlScope(values: {
  // alwaysAvailable: true → required
  brand_id: string;
  site_id: string;
  crawl_id: string;
  // inherited optional context
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  // surface-specific optional
  crawl_status?: string;
  crawl_stats?: Record<string, unknown>;
  crawl_scope?: Record<string, unknown>;
  crawl_error?: string;
  report_key?: string;
  report_summary?: Record<string, unknown>;
  // baseline
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
