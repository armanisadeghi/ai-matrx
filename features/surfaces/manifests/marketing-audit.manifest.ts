/**
 * Surface manifest — Marketing site audit (`matrx-user/marketing-audit`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/audit` — the
 * deterministic site-wide audit dashboard (`features/marketing`,
 * `AuditWorkspace`). It renders the pure rollup from `lib/audit-rollup.ts`
 * (`buildSiteAuditRollup`) over every canonical page's STORED metrics
 * (`web.snapshot.seo_metrics` + `audit_metrics`, stamped per capture; URL
 * quality computed by the shared evaluator): indexability verdict counts,
 * per-section pass rates (SERP / social / headings / indexability / URL),
 * top issues with sample pages, and worst pages. Inherits the brand + site
 * context backbone from `matrx-user/marketing-site`.
 *
 * Runtime emitter: features/marketing/lib/scopes/marketing-audit-scope.ts —
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
    name: "audit_rollup",
    label: "Site audit rollup",
    description:
      "The full deterministic audit rollup (SiteAuditRollup): total/audited/uncomputed page counts, the count of known non-HTML resources excluded from page findings, indexability verdict counts, per-section pass counts (serp/social/headings/url), top issues with sample pages, and worst pages. Pure aggregation of stored per-snapshot metrics. Empty during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    sortOrder: 400,
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "pages_audited",
    label: "Pages audited",
    description:
      "Number of canonical pages whose latest snapshot carries stored deterministic metrics. Zero when the site has never been crawled since metric stamping began; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 600,
  },
];

export const marketingAuditManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-audit",
  readiness: "partial",
  readinessNote: "Values emitted; no groups",
  label: "Marketing Site Audit",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/audit",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the site audit dashboard of a managed website: a site-wide rollup of every canonical page's stored audit results — indexability verdicts, pass rates for SERP metadata, social cards, headings, and URL quality, the most common issues, and the worst pages. Read the inherited brand_context and site_context first for the client and site framing.
Every metric here is DETERMINISTIC and STORED: the scraper (and its byte-identical client twin) stamps seo_metrics and audit_metrics on each snapshot at capture time, and this view only aggregates those stored values — it never recomputes them. You must do the same: trust the provided counts, verdicts, and pass rates exactly as given, and never re-derive a metric (no re-counting characters, re-judging indexability, or re-scoring a page yourself).
The user comes here to decide what to fix first across the whole site. Your job is prioritization and remediation planning from the evidence — turning top issues and worst pages into an ordered work plan — not re-auditing.
Uncomputed pages are pages with no stored metrics yet (never crawled or pre-stamping); treat them as unknown, never as passing or failing.
Known non-HTML resources are retained as crawl evidence and reported in nonHtmlResources, but are not pages eligible for HTML-only findings. An unusual URL that returned HTML remains a normal audited page.
</surface_intro>`,
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
  // surface-specific optional
  audit_rollup?: Record<string, unknown>;
  pages_audited?: number;
  // baseline
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
