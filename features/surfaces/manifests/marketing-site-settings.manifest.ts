/**
 * Surface manifest — Marketing site settings (`matrx-user/marketing-site-settings`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/settings` — the control
 * room of one managed website: identity + lifecycle, the DEFAULT CRAWL POLICY
 * every crawl inherits, and the health of every data source feeding the site.
 *
 * WHY IT IS AGENT-WRITABLE. Crawl policy is exactly the kind of expert reflex
 * our user does not have: "exclude the tag and author archives", "this site is
 * 30k pages, cap it and raise concurrency", "render with a browser, the nav is
 * client-side". Those are one sentence to an agent and a research project to a
 * non-technical expert. Every write target here stages a DRAFT into the same
 * form state the user's own typing edits — the user still presses Save, and
 * can undo by walking away.
 *
 * Deliberately NOT writable: visibility (an access decision), delete (never an
 * agent), and provider credentials (they are not on this surface at all).
 *
 * Runtime emitter: `SiteSettingsWorkspace` mounts a nested
 * SurfaceRuntimeProvider and spreads
 * `useMarketingSiteSurfaceBase().getBaseValues()` into
 * `createMarketingSiteSettingsScope`.
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
    key: "identity",
    label: "Site identity",
    sortOrder: 100,
    description: "What this site is called and how it is being managed.",
  },
  {
    key: "crawl_policy",
    label: "Default crawl policy",
    sortOrder: 200,
    description:
      "The crawl settings every new crawl of this site inherits unless a run overrides them.",
  },
  {
    key: "data_sources",
    label: "Data sources",
    sortOrder: 300,
    description:
      "Every collection provider bound to this site, its derived health, and how fresh its data is.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "site_status",
    label: "Lifecycle",
    description:
      "This site's lifecycle standing: active | paused | error. Paused sites are not crawled or collected automatically. Reflects the on-screen form, which may differ from what is saved (see unsaved_changes).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "identity",
  },
  {
    name: "site_visibility",
    label: "Visibility",
    description:
      "Who can see this site: personal | internal | link | public. Read-only for agents — changing who can see a record is a human decision.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 110,
    group: "identity",
  },
  {
    name: "crawl_policy",
    label: "Default crawl policy",
    description:
      "The full default crawl configuration on screen: respect_robots, seed_from_sitemap, follow_subdomains, capture_screenshots (booleans); max_pages, concurrency, host_rps (numbers); max_depth (number or null for unlimited); render_mode (http_only | http_first | browser_always | browser_with_screenshot); include_patterns and exclude_patterns (arrays of regex strings matched against the URL PATH, e.g. ^/blog/). This is the draft, not necessarily what is saved.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 500,
    sortOrder: 200,
    group: "crawl_policy",
  },
  {
    name: "crawl_policy_issues",
    label: "Invalid URL patterns",
    description:
      "Include/exclude patterns that are not valid regular expressions, as field + pattern + error. Empty array when the policy is valid — a non-empty array blocks saving.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 210,
    group: "crawl_policy",
  },
  {
    name: "unsaved_changes",
    label: "Unsaved changes",
    description:
      "True when the on-screen settings draft differs from what is stored on the site row. When true, site_status and crawl_policy describe a pending edit the user has not saved.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 220,
    group: "crawl_policy",
  },
  {
    name: "data_sources",
    label: "Data sources",
    description:
      "Per-provider collection status for this site, derived from live evidence — provider key, label, health (connected | not_connected | never_run | failing), last run, last success, rows collected, and how it refreshes. When health is 'failing' the row carries the recorded cause of the last failure. Empty while the status panel is loading.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 300,
    group: "data_sources",
  },
  {
    name: "data_sources_needing_attention",
    label: "Sources needing attention",
    description:
      "How many data sources are failing or not connected right now. Zero means every bound source is collecting.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 310,
    group: "data_sources",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "crawl_scope_patterns",
    label: "Crawl include/exclude patterns",
    description:
      "Set the URL patterns that bound every crawl of this site. Value: { include_patterns?: string[], exclude_patterns?: string[] } — each entry is a REGULAR EXPRESSION matched against the URL PATH only (e.g. ^/blog/, /tag/, \\.pdf$), never the full URL. Each provided array REPLACES that whole list, so include every pattern that should survive (read crawl_policy for the current lists). An empty include list means crawl everything in scope; excluded URLs are never fetched. Stages into the settings form — the user still presses Save.",
    valueType: "object",
    updatesValue: "crawl_policy",
    mode: "draft",
    applyPolicy: "ask",
    group: "crawl_policy",
    sortOrder: 100,
  },
  {
    name: "crawl_budget",
    label: "Crawl budget and speed",
    description:
      "Set how much of the site a crawl covers and how fast. Value: { max_pages?: number (1-50000), max_depth?: number|null (null or 0 = unlimited link depth), concurrency?: number (1-32), host_rps?: number (1-50 requests per second against this host) }. Omitted fields keep their current value. Raise host_rps only for sites the user owns. Stages into the settings form — the user still presses Save.",
    valueType: "object",
    updatesValue: "crawl_policy",
    mode: "draft",
    applyPolicy: "ask",
    group: "crawl_policy",
    sortOrder: 110,
  },
  {
    name: "crawl_behavior",
    label: "Crawl behavior",
    description:
      "Set how pages are fetched and what the crawler collects. Value: { render_mode?: 'http_only' | 'http_first' | 'browser_always' | 'browser_with_screenshot', respect_robots?: boolean, seed_from_sitemap?: boolean, follow_subdomains?: boolean, capture_screenshots?: boolean }. Omitted fields keep their current value. Browser rendering is slower and costlier — choose it when content only appears after JavaScript runs. Stages into the settings form — the user still presses Save.",
    valueType: "object",
    updatesValue: "crawl_policy",
    mode: "draft",
    applyPolicy: "ask",
    group: "crawl_policy",
    sortOrder: 120,
  },
  {
    name: "site_lifecycle",
    label: "Site lifecycle",
    description:
      "Set this site's lifecycle standing. Value: { status: 'active' | 'paused' | 'error' }. Pausing stops automatic crawling and collection without deleting anything. Stages into the settings form — the user still presses Save.",
    valueType: "object",
    updatesValue: "site_status",
    mode: "draft",
    applyPolicy: "ask",
    group: "identity",
    sortOrder: 130,
  },
];

export const marketingSiteSettingsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-site-settings",
  readiness: "verified",
  label: "Marketing Site Settings",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/settings",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the settings page of a managed website: its identity and lifecycle, the default crawl policy every crawl inherits, and the health of every data source feeding it. Read brand_context and site_context first for the client and site framing.
This page is an EDITOR. Read unsaved_changes before reasoning about state: when it is true, site_status and crawl_policy describe a draft the user has not saved, and crawl_policy_issues lists the invalid patterns blocking a save.
You can change the crawl policy and lifecycle through apply_surface_write; each change is staged into the form for the user to save, never applied behind their back. Include/exclude patterns are regular expressions matched against the URL PATH, and each write REPLACES the whole list — read crawl_policy first and carry forward what should survive. Never propose a host rate limit for a site the user does not own.
data_sources is derived evidence, not configuration: 'not_connected' means nothing is being collected, 'failing' carries the recorded cause of the last failure, and 'never_run' means connected but nothing has arrived yet. You cannot connect a provider from here — say plainly which one needs attention and that the fix lives on the integrations page (or the rank portfolio, for rank tracking). Never ask for, echo, or reconstruct any credential.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "crawl_policy_advisor",
      label: "Crawl policy advisor",
      description:
        "Tunes this site's default crawl policy — scope patterns, budget, and render mode — from what the site actually is, and explains each choice in plain language.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "data_source_diagnostician",
      label: "Data source diagnostician",
      description:
        "Reads the data-source health table and tells the user which sources are broken or missing, what the recorded failure means, and exactly where to go to fix each one.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/** Type-safe payload helper — the "a UI cannot lie" enforcement. */
export function createMarketingSiteSettingsScope(values: {
  // alwaysAvailable: true → required (inherited)
  brand_id: string;
  site_id: string;
  // Inherited optionals (marketing-brand + marketing-site)
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_description?: string;
  site_context?: string;
  gsc_synced_at?: string;
  // Own alwaysAvailable: true → required
  site_status: string;
  site_visibility: string;
  crawl_policy: Record<string, unknown>;
  crawl_policy_issues: ReadonlyArray<Record<string, unknown>>;
  unsaved_changes: boolean;
  // alwaysAvailable: false → optional
  data_sources?: ReadonlyArray<Record<string, unknown>>;
  data_sources_needing_attention?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
