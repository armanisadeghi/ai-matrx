/**
 * Surface manifest — Marketing site audit (`matrx-user/marketing-audit`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/audit` — the
 * deterministic site-wide audit dashboard (`features/marketing`,
 * `AuditWorkspace`). It renders the rollup aggregated in Postgres by
 * `web.site_audit_rollup` over every canonical page's STORED metrics
 * (`web.snapshot.seo_metrics` + `audit_metrics`, stamped per capture; URL
 * quality computed by the shared evaluator): indexability verdict counts,
 * per-section pass rates (SERP / social / headings / indexability / URL),
 * top issues with sample pages, and worst pages. Inherits the brand + site
 * context backbone from `matrx-user/marketing-site`.
 *
 * Runtime emitter: `AuditWorkspace` mounts the nested
 * `SurfaceRuntimeProvider` itself — it renders ONLY after the rollup query has
 * resolved, so every rollup-derived value below is genuinely guaranteed.
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
    key: "audit_coverage",
    label: "Audit coverage",
    sortOrder: 100,
    description:
      "How much of the canonical page registry actually carries stored audit metrics.",
  },
  {
    key: "audit_verdicts",
    label: "Verdicts & pass rates",
    sortOrder: 200,
    description:
      "Indexability verdict distribution and per-section pass counts across the audited pages.",
  },
  {
    key: "audit_findings",
    label: "Findings",
    sortOrder: 300,
    description:
      "The rolled-up issues and the pages carrying the most of them.",
  },
  {
    key: "audit_trend",
    label: "Trend",
    sortOrder: 400,
    description: "Composite audit score over the stored capture days.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Audit coverage ────────────────────────────────────────────────────
  {
    name: "audit_rollup",
    label: "Site audit rollup",
    description:
      "The full deterministic audit rollup (SiteAuditRollup) as one composite object: total/audited/uncomputed page counts, non-HTML resource count, indexability verdict counts, per-section pass counts (serp/social/headings/url), top issues with sample pages, and worst pages. Mirrors every individual audit value as one bag. Always present — the workspace only renders once the rollup has resolved.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 2500,
    sortOrder: 300,
    group: "audit_coverage",
  },
  {
    name: "audit_coverage_statement",
    label: "Coverage statement",
    description:
      "One sentence stating exactly what this audit covered: total pages, how many carry stored metrics, how many await a first crawl, and how many machine resources were excluded. The rollup is aggregated server-side over every page the caller can see — there is no row cap and no sampling, and this sentence says so.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 305,
    group: "audit_coverage",
  },
  {
    name: "pages_total",
    label: "Pages in registry",
    description:
      "Count of canonical URLs eligible for page auditing (HTML, or not fetched yet). Zero when the site has no pages registered.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 310,
    group: "audit_coverage",
  },
  {
    name: "pages_audited",
    label: "Pages audited",
    description:
      "Number of canonical pages whose latest snapshot carries stored deterministic metrics. Zero when the site has never been crawled since metric stamping began.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "audit_coverage",
  },
  {
    name: "pages_uncomputed",
    label: "Pages not yet audited",
    description:
      "Number of pages with no stored metrics yet (never crawled, or captured before metric stamping). Treat these as unknown — never as passing or failing. Zero when every page has metrics.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 330,
    group: "audit_coverage",
  },
  {
    name: "non_html_resources",
    label: "Non-HTML resources",
    description:
      "Number of known non-HTML resources (PDFs, images, feeds…) retained as crawl evidence but excluded from HTML-only page findings. Zero when the registry holds only HTML URLs.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 340,
    group: "audit_coverage",
  },

  // ── Verdicts & pass rates ─────────────────────────────────────────────
  {
    name: "indexability_verdicts",
    label: "Indexability verdicts",
    description:
      "Verdict distribution across audited pages: { indexable, check, blocked } counts. All zeros when nothing has been audited yet.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 70,
    sortOrder: 400,
    group: "audit_verdicts",
  },
  {
    name: "section_passes",
    label: "Section pass counts",
    description:
      "Pass counts per audit section: { serp, social, headings, url }. SERP/social/headings are out of pages_audited; url is out of pages_total (URL quality needs no crawl). All zeros when nothing passes or nothing is audited.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 90,
    sortOrder: 410,
    group: "audit_verdicts",
  },

  // ── Findings ──────────────────────────────────────────────────────────
  {
    name: "top_issues",
    label: "Top issues",
    description:
      "EVERY distinct rolled-up audit issue ranked by severity then page count (complete — the workspace truncates only at render): per issue its section, severity, message, affected page count, and up to 3 sample pages. Empty array when every audited page is clean.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    sortOrder: 500,
    group: "audit_findings",
  },
  {
    name: "worst_pages",
    label: "Pages needing attention",
    description:
      "EVERY page with at least one audit finding, ranked worst by error then warning count (complete — the workspace truncates only at render): per page its id, path, url, error/warning counts, and indexability verdict. Empty array when every audited page is clean.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2500,
    sortOrder: 510,
    group: "audit_findings",
  },

  // ── Trend ─────────────────────────────────────────────────────────────
  {
    name: "audit_score_trend",
    label: "Audit score trend",
    description:
      "One point per stored capture day: { day, overallScore (0-100 average pass rate, null when nothing was audited that day), totalPages, auditedPages }. Empty array while the trend query is still loading or when no captures are stored.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 600,
    group: "audit_trend",
  },
];

export const marketingAuditManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-audit",
  readiness: "verified",
  label: "Marketing Site Audit",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/audit",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the site audit dashboard of a managed website: a site-wide rollup of every canonical page's stored audit results — indexability verdicts, pass rates for SERP metadata, social cards, headings, and URL quality, the most common issues, and the worst pages. Read the inherited brand_context and site_context first for the client and site framing.
Every metric here is DETERMINISTIC and STORED: the scraper (and its byte-identical client twin) stamps seo_metrics and audit_metrics on each snapshot at capture time, and this view only aggregates those stored values — it never recomputes them. You must do the same: trust the provided counts, verdicts, and pass rates exactly as given, and never re-derive a metric (no re-counting characters, re-judging indexability, or re-scoring a page yourself).
The user comes here to decide what to fix first across the whole site. Your job is prioritization and remediation planning from the evidence — turning top issues and worst pages into an ordered work plan — not re-auditing.
Uncomputed pages are pages with no stored metrics yet (never crawled or pre-stamping); treat them as unknown, never as passing or failing.
Known non-HTML resources are retained as crawl evidence and reported in non_html_resources, but are not pages eligible for HTML-only findings. An unusual URL that returned HTML remains a normal audited page.
The coverage statement (audit_coverage_statement) is the honest scope of this rollup — it is aggregated server-side over every page, uncapped and unsampled. Quote it when you summarize; never imply the audit saw more or less than it did.
Read the individual values (pages_total / pages_audited / pages_uncomputed / non_html_resources, indexability_verdicts, section_passes, top_issues, worst_pages, audit_score_trend) rather than re-deriving them from audit_rollup — the composite exists only for callers that want the whole bag at once.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "technical_seo_auditor",
      label: "Technical SEO auditor",
      description:
        "Interprets the stored audit rollup — verdict distribution, section pass rates, issue patterns — and explains what they say about the site's technical health.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "remediation_planner",
      label: "Remediation planner",
      description:
        "Turns top issues and worst pages into a prioritized, actionable fix plan sized by page count and severity.",
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
export function createMarketingAuditScope(values: {
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
  // alwaysAvailable: true (surface-specific) → required. The workspace mounts
  // this provider only after the rollup query has resolved.
  audit_rollup: Record<string, unknown>;
  audit_coverage_statement: string;
  pages_total: number;
  pages_audited: number;
  pages_uncomputed: number;
  non_html_resources: number;
  indexability_verdicts: Record<string, unknown>;
  section_passes: Record<string, unknown>;
  top_issues: Array<Record<string, unknown>>;
  worst_pages: Array<Record<string, unknown>>;
  audit_score_trend: Array<Record<string, unknown>>;
  // baseline
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
