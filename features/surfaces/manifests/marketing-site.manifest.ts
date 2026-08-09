/**
 * Surface manifest — Marketing site workspace (`matrx-user/marketing-site`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]` — the overview cockpit
 * of one managed website (`web.site`) inside the Marketing system
 * (`features/marketing`, `SiteOverview`). The settings, access, and cost
 * routes fold into this surface by route-prefix mapping. It carries the
 * shared SITE context block (`site_id` / `site_name` / `site_root_url` /
 * `site_context`) that every site vertical (pages, crawls, audit, analysis,
 * findings, links, backlinks, coverage, sitemaps, discovery, integrations)
 * inherits, and itself inherits the BRAND context block (`brand_id` /
 * `brand_name` / `brand_context` / `brand_profile`) from
 * `matrx-user/marketing-brand`. The site's health picture — the five
 * connection statuses, initialization state, registry counts, crawl
 * freshness — is observed evidence derived from stored rows, never
 * something an agent invents.
 *
 * Runtime emitter: features/marketing/lib/scopes/site-scope.ts — being
 * built in parallel.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "site_identity",
    label: "Site identity",
    sortOrder: 100,
    description: "Which managed website this is — id, name, root URL.",
  },
  {
    key: "site_context",
    label: "Site context",
    sortOrder: 200,
    description:
      "The compact XML ground-truth snapshot of this website, shared with every site vertical.",
  },
  {
    key: "site_health",
    label: "Site health",
    sortOrder: 300,
    description:
      "Observed health evidence: connections, initialization, registry counts, and data freshness.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Shared site context (200-299) — inherited by every site vertical ──
  {
    name: "site_context",
    label: "Site context (XML)",
    description:
      "Compact XML snapshot of the managed website: identity (name, root URL, domain, status, description), connection statuses (Init/GSC/GA4/PSI/CMS), initialization state, and registry counts (canonical pages, open findings, sitemaps, last crawl). Built by buildSiteContextXml (features/marketing/lib/surface-context.ts). Empty during initial load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 225,
    group: "site_context",
  },

  // ── Identity (300-349) ────────────────────────────────────────────────
  {
    name: "site_id",
    label: "Site ID",
    description:
      "UUID of the `web.site` the user is working on. Always present — the route carries it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "site_identity",
  },
  {
    name: "site_name",
    label: "Site name",
    description:
      "Human name of the managed website (`web.site.name`). Populated once the workspace has loaded; empty during initial load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 312,
    group: "site_identity",
  },
  {
    name: "site_root_url",
    label: "Site root URL",
    description:
      "Root URL of the managed website (e.g. https://example.com). Populated once the workspace has loaded; empty during initial load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 314,
    group: "site_identity",
  },
  {
    name: "site_description",
    label: "Site description",
    description:
      "User-authored description of the managed website (`web.site.description`) — what this business/site is, in a sentence or two, shown on the overview hero. Empty when nobody (human or initialization) has written one yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 316,
    group: "site_identity",
  },

  // ── Observed evidence (400-499) ───────────────────────────────────────
  {
    name: "connection_statuses",
    label: "Connection statuses",
    description:
      "The five big-picture connection chips derived by features/marketing/lib/site-status.ts — initialized, search_console, analytics, pagespeed, cms — each with state (connected | attention | off) and a human detail line (e.g. a configured GSC binding that has never synced is `attention`, not `connected`). Empty during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 405,
    group: "site_health",
  },
  {
    name: "initialization_state",
    label: "Initialization state",
    description:
      "Parsed `web.site.initialization` summary (homepage ok, sitemaps found, screenshots captured, discovered totals, per-step errors) written by the scraper initialize command. Empty for a never-initialized site or during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 415,
    autoContext: false,
    group: "site_health",
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "open_findings_total",
    label: "Open findings total",
    description:
      "Number of open, non-suppressed analysis findings across the whole site. Zero when analysis has found nothing (or has not run); empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 635,
    group: "site_health",
  },
  {
    name: "pages_total",
    label: "Canonical pages total",
    description:
      "Count of canonical pages in the site's registry (`web.page`). Zero for a brand-new site; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 645,
    group: "site_health",
  },
  {
    name: "last_crawl_at",
    label: "Last crawl at",
    description:
      "ISO timestamp of the site's most recent crawl session — how fresh the observed evidence is. Empty when the site has never been crawled or during initial load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 655,
    group: "site_health",
  },
  {
    name: "gsc_synced_at",
    label: "GSC last synced at",
    description:
      "When the site's Google Search Console collection last completed (`web.site.gsc_synced_at`, ISO timestamp). Empty when GSC is not connected or never synced.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 665,
    group: "site_health",
  },
];

/**
 * The WRITE half — the two site-identity fields an agent plausibly authors.
 * Deliberately narrow: logo/favicon/social-image URLs, lifecycle status,
 * visibility, and the brand move are human-mechanical decisions and stay
 * out (the SiteEditorDialog owns them). Both targets persist immediately
 * through the canonical `updateSiteIdentity` service with its version
 * guard, so both default to `ask` — an agent proposing identity copy is
 * welcome, an agent silently rewriting it is not. Handlers:
 * `features/marketing/components/site/MarketingSiteWriteTargets.tsx`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "site_name",
    label: "Site name",
    description:
      "Rename the managed website's human label (`web.site.name`) — the display name only, never the root URL or domain. Value: { name: string } (non-empty plain text; replaces the current name in full — the current one is in site_name). Persists immediately through updateSiteIdentity with the version guard; every other identity field is preserved.",
    valueType: "object",
    updatesValue: "site_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "site_identity",
    sortOrder: 100,
  },
  {
    name: "site_description",
    label: "Site description",
    description:
      "Set the site's description — what this business/website is, in one or two plain-text sentences (no markdown). Value: { description: string } (non-empty; REPLACES the current description in full — the current one is in site_description). Persists immediately through updateSiteIdentity with the version guard; every other identity field is preserved.",
    valueType: "object",
    updatesValue: "site_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "site_identity",
    sortOrder: 110,
  },
];

export const marketingSiteManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-site",
  readiness: "verified",
  label: "Marketing Site Workspace",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]",
  inheritsFrom: "matrx-user/marketing-brand",
  intro: `<surface_intro>
You are on the Marketing site workspace: the overview cockpit for one managed website of a client brand — its identity, the five connection statuses (Init, Google Search Console, GA4, PageSpeed, CMS), initialization results, and registry counts. The user comes here to judge the site's health at a glance and to launch setup or crawl work.
Read brand_context first (the ground truth about the client), then site_context (the ground truth about this website). Everything in connection_statuses, initialization_state, and the registry counts is observed evidence derived from stored rows — report it as-is and never invent, upgrade, or re-derive a status (a GSC binding that has never synced is "attention", never "connected").
Sites belong to a brand; when advising, keep recommendations consistent with the brand profile and confirmed business facts embedded in brand_context. Confirmed brand truth is human-owned — you propose, you never fabricate.
Empty values mean the workspace has not finished loading or the data genuinely does not exist yet (never initialized, never crawled) — say so plainly instead of guessing.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "site_strategist",
      label: "Site strategist",
      description:
        "Reads the whole site picture (connections, registry counts, findings, crawl freshness) and recommends what to work on next for this website.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "technical_seo_auditor",
      label: "Technical SEO auditor",
      description:
        "Assesses the site's technical health from stored evidence (initialization, crawl coverage, findings) and explains issues in plain terms.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "setup_assistant",
      label: "Setup assistant",
      description:
        "Guides the user through completing site setup: initialization, Google Search Console / GA4 / PageSpeed / CMS connections, and first syncs.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the
 * inherited `brand_id` from `matrx-user/marketing-brand`.
 */
export function createMarketingSiteScope(values: {
  // alwaysAvailable: true → required (brand_id inherited from marketing-brand)
  brand_id: string;
  site_id: string;
  // Inherited optionals (marketing-brand)
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  // alwaysAvailable: false → optional
  site_name?: string;
  site_root_url?: string;
  site_description?: string;
  site_context?: string;
  connection_statuses?: Record<string, unknown>;
  initialization_state?: Record<string, unknown>;
  open_findings_total?: number;
  pages_total?: number;
  last_crawl_at?: string;
  gsc_synced_at?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
