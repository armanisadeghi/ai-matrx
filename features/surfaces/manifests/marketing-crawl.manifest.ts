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
 * Runtime emitter: `CrawlSurfaceProvider`
 * (`features/marketing/lib/scopes/crawl-surface.tsx`) — every workspace under
 * `/crawls/[crawlId]/**` mounts it with the route-carried crawl_id, the loaded
 * session row, and which sub-view it is (`crawl_view` + `view_summary`).
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
    key: "session_identity",
    label: "Session identity",
    sortOrder: 100,
    description: "Which crawl session this is, and when it ran.",
  },
  {
    key: "session_run",
    label: "Run outcome",
    sortOrder: 200,
    description:
      "What the run was allowed to do, what it did, and how it ended.",
  },
  {
    key: "session_record",
    label: "Session record",
    sortOrder: 300,
    description: "The raw durable row and its recorded metadata.",
  },
  {
    key: "open_view",
    label: "Open view",
    sortOrder: 400,
    description:
      "Which child workspace of this session the user is looking at right now.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Session identity ──────────────────────────────────────────────────
  {
    name: "crawl_id",
    label: "Crawl session ID",
    description:
      "UUID of the `web.crawl_session` the user has open. Always present — the route carries it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 320,
    group: "session_identity",
  },
  {
    name: "crawl_trigger",
    label: "Trigger",
    description:
      "How this session was started (manual / scheduled). Empty during initial load, before the session row resolves.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 330,
    group: "session_identity",
  },
  {
    name: "crawl_created_at",
    label: "Created at",
    description:
      "ISO timestamp of when the session row was created (queued). Empty during initial load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 340,
    group: "session_identity",
  },
  {
    name: "crawl_started_at",
    label: "Started at",
    description:
      "ISO timestamp of when the run actually began. Empty during initial load, or for a session that was queued but never started.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 350,
    group: "session_identity",
  },
  {
    name: "crawl_finished_at",
    label: "Finished at",
    description:
      "ISO timestamp of when the run reached a terminal state. Empty during initial load and for a run still in flight.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 360,
    group: "session_identity",
  },
  {
    name: "crawl_duration",
    label: "Duration",
    description:
      'Human-readable elapsed time between start and finish, exactly as the workspace displays it (e.g. "4m 12s"). Empty during initial load or when the run has no start/finish pair yet.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 370,
    group: "session_identity",
  },

  // ── Run outcome ───────────────────────────────────────────────────────
  {
    name: "crawl_status",
    label: "Crawl status",
    description:
      "Lifecycle status of the session (queued / running / complete / partial / failed). Populated once the workspace has loaded; empty during initial load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 400,
    group: "session_run",
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
    group: "session_run",
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
    group: "session_run",
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
    group: "session_run",
  },

  // ── Session record ────────────────────────────────────────────────────
  {
    name: "crawl_metadata",
    label: "Session metadata",
    description:
      "The metadata jsonb recorded on this crawl session (scraper version, run annotations, and whatever the operator stamped). Empty object when nothing was recorded; empty during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 500,
    group: "session_record",
  },
  {
    name: "crawl_session",
    label: "Crawl session record",
    description:
      "The whole loaded `web.crawl_session` row as one composite object (id, site_id, status, trigger, created/started/finished timestamps, scope, stats, metadata, error, version). Mirrors the individual session values as one bag (completeness law). Empty during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 510,
    group: "session_record",
  },

  // ── Open view ─────────────────────────────────────────────────────────
  {
    name: "crawl_view",
    label: "Open view",
    description:
      "Which child workspace of this session is open: summary | urls | logs | snapshots | links | reports | report. Always present — every workspace under /crawls/[crawlId] declares itself.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 600,
    group: "open_view",
  },
  {
    name: "view_summary",
    label: "Open view summary",
    description:
      "Aggregate of the rows loaded by the open child view: its loaded row count and the server total matching the current search/filters (URL ledger, event log, snapshots, or link edges). Empty on the summary and reports-index views, and before the view's query has resolved.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 610,
    group: "open_view",
  },
  {
    name: "report_key",
    label: "Open report key",
    description:
      'Stable key of the technical crawl report the user has open (e.g. "response-codes", "page-titles", "canonicals" — see lib/crawl-reports.ts). Empty outside the /reports/* child routes.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 18,
    sortOrder: 620,
    group: "open_view",
  },
  {
    name: "report_summary",
    label: "Open report summary",
    description:
      "Aggregate of the currently open technical report (its key, label, source, loaded row count, and total matching rows). Empty outside /reports/* or before the report has loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    autoContext: false,
    sortOrder: 630,
    group: "open_view",
  },
];

export const marketingCrawlManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-crawl",
  readiness: "verified",
  label: "Marketing Crawl Session",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/crawls/[crawlId]",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are inside one frozen crawl session of a managed website: its timing, frozen scope, run stats, error state, URL ledger, event log, and the ten technical SEO reports built from the run's URL outcomes and immutable snapshots. Read the inherited brand_context and site_context first for the client and site framing; crawl_stats and crawl_scope tell you what this run did and what it was allowed to do.
The user comes here to understand one crawl event: did it complete, what did it find, and what do the technical reports (response codes, titles, descriptions, headings, canonicals, directives, images, content, structured data, performance) reveal about the site as captured in this run.
Everything here is immutable observed evidence of one moment in time — a session, its URL outcomes, and its snapshots are never edited and never re-run in place. Never invent a status, count, or report figure; if a value is empty, the data has not loaded or the run did not produce it.
crawl_view tells you which child workspace the user is on (summary, urls, logs, snapshots, links, reports, report) and view_summary how many rows that view has loaded out of how many match — use them to answer about what is on screen rather than assuming the summary page.
When report_key is set, the user is focused on that one technical report — interpret its rows against the frozen scope (a "missing" URL may simply have been out of scope) rather than treating every gap as a site defect.
</surface_intro>`,
  groups,
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
  crawl_view: string;
  // inherited optional context
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  gsc_synced_at?: string;
  // surface-specific optional
  crawl_trigger?: string;
  crawl_created_at?: string;
  crawl_started_at?: string;
  crawl_finished_at?: string;
  crawl_duration?: string;
  crawl_status?: string;
  crawl_stats?: Record<string, unknown>;
  crawl_scope?: Record<string, unknown>;
  crawl_error?: string;
  crawl_metadata?: Record<string, unknown>;
  crawl_session?: Record<string, unknown>;
  view_summary?: Record<string, unknown>;
  report_key?: string;
  report_summary?: Record<string, unknown>;
  // baseline
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
