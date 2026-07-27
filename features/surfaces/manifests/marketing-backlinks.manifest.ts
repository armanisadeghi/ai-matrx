/**
 * Surface manifest — Marketing backlinks workspace (`matrx-user/marketing-backlinks`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/backlinks` — the
 * persisted DataForSEO backlink intelligence workspace
 * (`BacklinksWorkspace`): current summary KPIs (total backlinks, referring
 * domains, dofollow/nofollow, rank), referring-domain / anchor / target-page
 * / competitor rollups, and a controlled latest-backlink table. Data is
 * server-owned history in the RLS-protected `seo` schema; the client reads
 * it directly and only triggers refresh via the canonical SEO-server
 * command. Inherits brand + site context from `matrx-user/marketing-site`.
 *
 * Runtime emitter: `BacklinksWorkspace.tsx` mounts the nested
 * `<SurfaceRuntimeProvider>` and spreads
 * `useMarketingSiteSurfaceBase().getBaseValues()` into
 * `createMarketingBacklinksScope(...)` at trigger time.
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
    key: "link_profile",
    label: "Link profile",
    sortOrder: 100,
    description:
      "The headline authority picture: the latest stored summary KPIs and the composite off-site profile.",
  },
  {
    key: "referring_sources",
    label: "Referring sources",
    sortOrder: 200,
    description:
      "Who links here and how: referring-domain, anchor-text, linked-page, and competitor rollups.",
  },
  {
    key: "link_trend",
    label: "Link trend",
    sortOrder: 300,
    description: "Gains and losses over the stored provider timeseries.",
  },
  {
    key: "backlink_rows",
    label: "Backlink rows",
    sortOrder: 400,
    description:
      "The individual stored backlinks the user is paging through, and the state of that table.",
  },
  {
    key: "collection",
    label: "Collection & refresh",
    sortOrder: 500,
    description:
      "How and when this evidence is collected: the stored schedule, the selected manual profile, the server target, and the last refresh receipt.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Link profile ──────────────────────────────────────────────────────
  {
    group: "link_profile",
    name: "backlink_summary",
    label: "Backlink summary KPIs",
    description:
      "The latest stored summary snapshot for this site: total backlinks, referring domains, dofollow/nofollow counts, rank score, and when it was collected. Populated once the workspace has loaded; empty when no backlink snapshot has ever been collected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 400,
  },
  {
    group: "link_profile",
    name: "backlink_profile",
    label: "Off-site link profile",
    description:
      "The composite off-site picture as one object: { summary (the KPI snapshot), referring_domain_count, anchor_count, target_page_count, competitor_count, trend_points } — the summary values plus how much rollup evidence backs them. Mirrors the individual link-profile values as one group value. Empty when nothing has ever been collected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 405,
  },
  // ── Referring sources ─────────────────────────────────────────────────
  {
    group: "referring_sources",
    name: "top_referring_domains",
    label: "Top referring domains",
    description:
      "The top stored referring domains pointing at this site, each with its backlink/referring-domain counts. Populated once the workspace has loaded; empty when no dimension snapshot has been collected yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 410,
  },
  {
    group: "referring_sources",
    name: "top_anchors",
    label: "Top anchor texts",
    description:
      "The top stored anchor texts used in links to this site, each with its backlink count. Populated once the workspace has loaded; empty when no dimension snapshot has been collected yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    autoContext: false,
    sortOrder: 420,
  },
  {
    group: "referring_sources",
    name: "top_target_pages",
    label: "Top linked pages",
    description:
      "The top pages on this site that backlinks point at, each with its backlink count. Populated once the workspace has loaded; empty when no dimension snapshot has been collected yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 430,
  },
  {
    group: "referring_sources",
    name: "top_competitors",
    label: "Competitor domains",
    description:
      "Competitor domains the provider reports as sharing this site's link neighborhood, each with overlap counts. Often empty — collection depends on the refresh profile.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 440,
  },
  // ── Link trend ────────────────────────────────────────────────────────
  {
    group: "link_trend",
    name: "backlink_trend",
    label: "New vs. lost trend",
    description:
      "The stored new/lost/net backlink timeseries (one entry per provider-reported period, with running totals when available). Populated once a weekly or bootstrap refresh has stored timeseries rows.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 450,
  },
  // ── Backlink rows ─────────────────────────────────────────────────────
  {
    group: "backlink_rows",
    name: "backlinks_table_state",
    label: "Backlinks table state",
    description:
      "What the user currently sees in the backlink rows table: total recorded rows, loaded row count, page, and active search. The rows themselves are not included — this is the viewing state.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 460,
  },
  {
    group: "backlink_rows",
    name: "backlink_rows",
    label: "Loaded backlink rows",
    description:
      "The individual stored backlinks on the table page the user is currently viewing (server-paged, respecting search and sort): per row the source domain and URL, target URL, anchor text, state (active/new/lost), dofollow flag, domain rank, and last-seen date. Empty array when no detailed rows have been collected or the current filter matches nothing.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 465,
  },
  {
    group: "backlink_rows",
    name: "backlinks_collected_at",
    label: "Rows collected at",
    description:
      "ISO timestamp of the latest detailed-backlink collection snapshot — how fresh the individual rows are, as distinct from the summary KPIs. Empty when detailed rows have never been collected (only the weekly core profile has run).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 470,
  },

  // ── Collection & refresh ──────────────────────────────────────────────
  {
    group: "collection",
    name: "refresh_schedule",
    label: "Automatic refresh schedule",
    description:
      "The site's stored DataForSEO refresh configuration as shown in the schedule editor: { enabled, cadence (weekly|monthly), detail_limit }. Always reflects the saved site row, not unsaved edits. Empty only while the site row is still loading.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 500,
  },
  {
    group: "collection",
    name: "refresh_profile",
    label: "Selected refresh profile",
    description:
      "The manual refresh profile currently selected in the toolbar (weekly | monthly | bootstrap) — what 'Refresh now' would run. Always present once the workspace is interactive; it defaults to bootstrap.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 510,
  },
  {
    group: "collection",
    name: "seo_environment",
    label: "SEO server environment",
    description:
      "The environment name of the SEO server target the shell is pointed at, which manual refreshes are sent to. Empty when no SEO service target is configured for the selected environment — refreshes are impossible in that state.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 520,
  },
  {
    group: "collection",
    name: "refresh_receipt",
    label: "Last refresh receipt",
    description:
      "The raw receipt returned by the last manual refresh run in this browser tab (datasets touched, counts, provider cost). Empty unless the user has run a refresh during this visit — it is not persisted history.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 530,
  },
];

export const marketingBacklinksManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-backlinks",
  readiness: "verified",
  label: "Marketing Backlinks",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/backlinks",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the backlink intelligence workspace of a managed website: third-party evidence (DataForSEO) of who links to this site, stored as server-owned history — summary KPIs, referring-domain and anchor rollups, and individual backlink rows. The brand_context and site_context values give you the client and website framing; read them first.
Backlink data is COLLECTED EVIDENCE from an external provider: it reflects the provider's last collection run (backlink_summary carries the timestamp), it can be stale or empty when collection has never run, and it is read-only here — refreshes happen through the canonical server command, never by fabricating numbers.
The user works here on off-site authority: understanding the link profile, spotting lost or toxic links, and planning outreach for new ones. Reason from the stored rollups; never invent a referring domain, anchor, or metric the data does not contain.
Freshness has two clocks: backlink_summary carries when the KPI snapshot was collected, backlinks_collected_at when the individual rows were. The collection values (refresh_schedule, refresh_profile, seo_environment, refresh_receipt) tell you how this evidence is kept current — when data is stale or missing, the right recommendation names the profile to run, not a fabricated number.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "backlink_analyst",
      label: "Backlink analyst",
      description:
        "Interprets the stored backlink profile: authority distribution, dofollow share, anchor patterns, and gains/losses over snapshots.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "outreach_strategist",
      label: "Outreach strategist",
      description:
        "Plans link-building outreach from the referring-domain and competitor rollups: targets, angles, and anchor strategy.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the
 * inherited brand_id / site_id from marketing-brand / marketing-site.
 */
export function createMarketingBacklinksScope(values: {
  // inherited alwaysAvailable: true → required
  brand_id: string;
  site_id: string;
  // surface-specific optionals
  backlink_summary?: Record<string, unknown>;
  backlink_profile?: Record<string, unknown>;
  top_referring_domains?: Array<Record<string, unknown>>;
  top_anchors?: Array<Record<string, unknown>>;
  top_target_pages?: Array<Record<string, unknown>>;
  top_competitors?: Array<Record<string, unknown>>;
  backlink_trend?: Array<Record<string, unknown>>;
  backlinks_table_state?: Record<string, unknown>;
  backlink_rows?: Array<Record<string, unknown>>;
  backlinks_collected_at?: string;
  refresh_schedule?: Record<string, unknown>;
  refresh_profile?: string;
  seo_environment?: string;
  refresh_receipt?: Record<string, unknown>;
  // inherited optionals
  brand_name?: string;
  gsc_synced_at?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  // baseline optionals
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
