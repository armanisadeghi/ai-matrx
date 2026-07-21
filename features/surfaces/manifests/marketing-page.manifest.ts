/**
 * Surface manifest — Marketing page workspace (`matrx-user/marketing-page`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/pages/[pageId]` — the
 * canonical-page cockpit of the Marketing system (`features/marketing`,
 * `PageWorkspace`). One canonical URL (`web.page`) + its latest observed
 * capture (`web.snapshot`): SERP preview, user-owned intent (target keyword +
 * desired metadata), indexability, headings, content stats, captures.
 *
 * The load-bearing distinction agents must understand here:
 *   - OBSERVED values come from the latest accepted crawl snapshot — they are
 *     immutable evidence of what the live site currently serves.
 *   - DESIRED values are the user's editorial targets stored on the page row —
 *     what the metadata SHOULD become. Agents propose desired values; they
 *     never fabricate observed ones.
 *
 * SEO metrics (pixel widths, char counts, pass flags) are DETERMINISTIC —
 * computed from the shared char-width table (`features/seo/serp/metrics.ts`,
 * mirrored by the scraper's `matrx_scraper.meta_metrics`). The scraper stamps
 * `web.snapshot.seo_metrics` on every capture; the client stamps
 * `web.page.seo_metrics_desired` on every intent save. Agents should trust
 * these numbers rather than re-deriving lengths, and can recompute
 * server-side via the `seo` tool when generating candidates.
 *
 * Runtime scope assembly lives in
 * `features/marketing/lib/marketing-page-scope.ts` — PageWorkspace hands its
 * loaded workspace data to `buildMarketingPageScope` at launch time.
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
    name: "page_id",
    label: "Canonical page ID",
    description:
      "UUID of the `web.page` row the user has open. Always present — the route carries it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "site_id",
    label: "Site ID",
    description:
      "UUID of the owning `web.site`. Always present — the route carries it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 310,
  },
  {
    name: "brand_id",
    label: "Brand ID",
    description:
      "UUID of the owning `web.brand` (the anchor entity for this client/company). Always present — the route carries it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 320,
  },
  {
    name: "page_url",
    label: "Page URL",
    description:
      "Full canonical URL of the page (e.g. https://example.com/services/). Always present once the workspace has loaded — launches only happen from a loaded workspace.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 330,
  },
  {
    name: "target_keyword",
    label: "Target keyword",
    description:
      "The user's primary search intent for this page (`web.page.target_keyword`). Empty when the user hasn't set one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 340,
  },

  // ── Observed metadata — crawl evidence (400-449) ──────────────────────
  {
    name: "observed_title",
    label: "Observed meta title",
    description:
      "The <title> the live site actually served in the latest accepted snapshot. Empty when no crawl has captured this page yet, or the page has no title tag. Evidence — never invented.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 400,
  },
  {
    name: "observed_description",
    label: "Observed meta description",
    description:
      "The meta description the live site actually served in the latest accepted snapshot. Empty when uncrawled or absent on the page. Evidence — never invented.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 410,
  },
  {
    name: "observed_seo_metrics",
    label: "Observed SEO metrics",
    description:
      "Deterministic metrics for the OBSERVED title+description (contract v1: pixel_width, character_count, desktop_ok, mobile_ok, seo_length_ok, ok, issues[] per field + overall_ok). Stamped by the scraper at capture time (`web.snapshot.seo_metrics`). Empty when uncrawled.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 420,
  },
  {
    name: "snapshot_captured_at",
    label: "Snapshot captured at",
    description:
      "ISO timestamp of the latest accepted snapshot — how fresh the observed evidence is. Empty when uncrawled.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 430,
  },
  {
    name: "word_count",
    label: "Word count",
    description:
      "Word count of the latest snapshot's main content. Zero/empty when uncrawled.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 440,
  },

  // ── Desired metadata — the user's editorial intent (500-549) ──────────
  {
    name: "desired_title",
    label: "Desired meta title",
    description:
      "The user's editorial TARGET title (`web.page.meta_title_desired`) — what the title should become, distinct from what the site serves. Empty when no target is set. Agents proposing titles write candidates for THIS field.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 500,
  },
  {
    name: "desired_description",
    label: "Desired meta description",
    description:
      "The user's editorial TARGET description (`web.page.meta_description_desired`). Empty when no target is set. Agents proposing descriptions write candidates for THIS field.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 510,
  },
  {
    name: "desired_seo_metrics",
    label: "Desired SEO metrics",
    description:
      "Deterministic metrics for the DESIRED title+description (same contract v1 shape as observed_seo_metrics). Stamped by the client on every intent save (`web.page.seo_metrics_desired`). Empty when no targets are set.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 520,
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "open_findings",
    label: "Open findings count",
    description:
      "Number of open, non-suppressed analysis findings against this page. Zero when the analysis pipeline has found nothing (or hasn't run).",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 600,
  },
  {
    name: "http_status",
    label: "Last HTTP status",
    description:
      "HTTP status the page last returned to the crawler (e.g. 200, 301, 404). Empty when uncrawled.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 610,
  },
];

export const marketingPageManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-page",
  label: "Marketing Page Workspace",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/pages/[pageId]",
  intro: `<surface_intro>
You are on the Marketing page workspace: one canonical URL of a managed website, with the evidence of what it currently serves and the user's editorial intent for what it should become.
Two kinds of values live here and must never be confused: OBSERVED values (observed_title, observed_description, observed_seo_metrics) are immutable crawl evidence of the live site; DESIRED values (desired_title, desired_description, desired_seo_metrics) are the user's editorial targets stored on the page. When asked to improve metadata, you propose DESIRED values — you never alter or invent observed evidence.
SEO metrics are deterministic (shared pixel-width table between browser and scraper): trust the provided pixel_width / ok flags instead of estimating lengths, and validate any candidate you generate with the seo tool before presenting it.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  // The AI layer for this surface is deliberately staged: these roles are the
  // declared slots the marketing agent fleet (metadata writers, SERP analysts,
  // content auditors, keyword strategists, …) will bind into. Declaring them
  // now means the binding UI and runtime are ready the day the agents are.
  agentRoles: [
    {
      name: "metadata_optimizer",
      label: "Metadata optimizer",
      description:
        "Proposes desired meta title/description candidates for this page, validated against the deterministic SERP limits.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "serp_analyst",
      label: "SERP analyst",
      description:
        "Explains how this page appears in search results and what to change, using observed metrics and GSC evidence.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "content_auditor",
      label: "Content auditor",
      description:
        "Audits the captured page content (headings, word count, readability) against the target keyword.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
    {
      name: "keyword_strategist",
      label: "Keyword strategist",
      description:
        "Recommends or refines the target keyword for this page from its content and site context.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 130,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createMarketingPageScope(values: {
  // alwaysAvailable: true → required
  page_id: string;
  site_id: string;
  brand_id: string;
  page_url: string;
  // alwaysAvailable: false → optional
  target_keyword?: string;
  observed_title?: string;
  observed_description?: string;
  observed_seo_metrics?: Record<string, unknown>;
  snapshot_captured_at?: string;
  word_count?: number;
  desired_title?: string;
  desired_description?: string;
  desired_seo_metrics?: Record<string, unknown>;
  open_findings?: number;
  http_status?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
