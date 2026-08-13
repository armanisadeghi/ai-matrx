/**
 * Surface manifest — Marketing backlinks workspace (`matrx-user/marketing-backlinks`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/backlinks` — the
 * provider discovery + first-party backlink intelligence workspace
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
 *
 * WRITE half (2026-08-12): exactly ONE target,
 * `backlink_refresh_schedule` — see the block above `writeTargets` for why
 * that count is the honest one and why `refresh_profile` is a documented NO.
 * Everything this page displays about actual links is gated evidence or
 * model judgment and is deliberately unwritable.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  dataForSeoCadences,
  DATAFORSEO_DETAIL_LIMIT_MAX,
  DATAFORSEO_DETAIL_LIMIT_MIN,
} from "@/features/marketing/data/integrations-schema";
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
      "The individual stable backlinks the user is paging through, their source-page judgments, and the state of that table.",
  },
  {
    key: "enrichment",
    label: "Source-page enrichment",
    sortOrder: 450,
    description:
      "Captured referring-page content, first-party judgments, concrete actions, and the known-domain directory.",
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
    group: "enrichment",
    name: "backlink_enrichment_summary",
    label: "Enrichment progress and actions",
    description:
      "Counts across stable backlinks: total, analyzed, awaiting, failed/dead-letter, high-priority actions, and likely-controllable links. This is platform judgment over captured source pages, not a provider metric.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 475,
  },
  {
    group: "enrichment",
    name: "referring_domain_opinions",
    label: "First-party referring-domain opinions",
    description:
      "Known referring sites with our evidence-backed score, verdict, site type, summary, and provider metrics kept separately. Human rulings override interpretation without erasing evidence.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3500,
    autoContext: false,
    sortOrder: 480,
  },
  {
    group: "backlink_rows",
    name: "backlink_rows",
    label: "Loaded backlink rows",
    description:
      "The stable backlinks on the table page the user is currently viewing (server-paged, respecting search and sort): source/target identity, anchor and provider facts, capture state, our relevance/page-type/controllability/risk judgments, and concrete recommended action. Empty array when no detailed rows have been collected or the current filter matches nothing.",
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
      "The site's stored DataForSEO refresh configuration as shown in the schedule editor: { enabled, cadence (weekly|monthly), detail_limit }. Always reflects the saved site row, not unsaved edits — which is why its write twin `backlink_refresh_schedule` persists on apply instead of staging a draft. Empty only while the site row is still loading.",
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
    label: "AI Dream work environment",
    description:
      "The environment name of the AI Dream server target that runs provider refresh and source-page enrichment work. Empty when no AI Dream target is configured for the selected environment — work commands are impossible in that state.",
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

/**
 * The write half. ONE target, and the count is the honest one rather than a
 * padded one: everything else this workspace shows is gated evidence or model
 * output — every backlink row, referring domain, anchor, competitor, score,
 * verdict and summary — and writing any of it would FORGE evidence, which is
 * the one thing the surface intro forbids outright. The schedule card is the
 * single authored control on the page, and its three fields are one decision
 * behind one Save, so one composite beats three micro-targets (the
 * `page_meta_tags` rule).
 *
 * Also ruled NO, so nobody re-scouts it: `refresh_profile`. It is declared,
 * it is real view state, and an agent could set it — but it is a mechanical
 * selector sitting immediately beside the Refresh button the user must press
 * anyway. The agent's actual contribution there is the RECOMMENDATION ("your
 * detail rows are four months stale, run a bootstrap"), which it can already
 * make in prose; pre-moving the dropdown saves one click and costs a confirm
 * dialog. That is the "pure-mechanical toggle nobody would ask an agent to
 * flip" case in the judgment bar, not a planning field.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    group: "collection",
    name: "backlink_refresh_schedule",
    label: "Automatic refresh schedule",
    description:
      `Set how often we automatically check this site for new backlinks, through the same Save the schedule editor uses. Send an object with any of { enabled: boolean, cadence: ${dataForSeoCadences.join(" | ")}, detail_limit: integer ${DATAFORSEO_DETAIL_LIMIT_MIN}-${DATAFORSEO_DETAIL_LIMIT_MAX} } — OMITTED KEYS KEEP THE SAVED VALUE, so "check weekly" need not restate the row limit. detail_limit is how many individual backlink rows each automatic check pulls in. ` +
      `This target is mode "entity": on Apply it PERSISTS to the site immediately (the user still confirms first) rather than staging an unsaved edit. That is deliberate — the schedule card lives behind a collapsed settings toggle and its read twin refresh_schedule reports the SAVED site row, so a staged draft would be invisible both to the user and to you. Apply, then re-read refresh_schedule in a NEW run to confirm what landed. ` +
      `This only schedules collection; it never runs a refresh, and it cannot change any backlink, domain, score or judgment.`,
    valueType: "object",
    updatesValue: "refresh_schedule",
    mode: "entity",
    applyPolicy: "ask",
    sortOrder: 500,
  },
];

export const marketingBacklinksManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-backlinks",
  readiness: "verified",
  label: "Marketing Backlinks",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/backlinks",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the backlink intelligence workspace of a managed website: provider discovery PLUS first-party source-page capture and analysis. The brand_context and site_context values give you the client and website framing; read them first.
Keep evidence layers separate. Provider rank/spam values are third-party signals; backlink_rows and referring_domain_opinions carry our page-content judgments, relevance, controllability, risk, and recommended actions; human rulings are explicit ground truth. Never call a link paid, controlled, toxic, or disavow-worthy from a provider score alone.
The user works here to protect valuable links, reclaim losses, improve controllable listings/placements, and request specific edits. Recommend the stored action and explain its evidence; never invent a relationship, owner, referring domain, anchor, or metric.
Freshness has two clocks: backlink_summary carries when the KPI snapshot was collected, backlinks_collected_at when the individual rows were. The collection values (refresh_schedule, refresh_profile, seo_environment, refresh_receipt) tell you how this evidence is kept current — when data is stale or missing, the right recommendation names the profile to run, not a fabricated number.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "backlink_analyst",
      label: "Backlink analyst",
      description:
        "Interprets provider signals alongside captured referring-page content: relevance, context, editorial nature, controllability, risk, and the first-party domain opinion.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "outreach_strategist",
      label: "Outreach strategist",
      description:
        "Turns stored recommended actions and controllability evidence into precise listing edits, publisher requests, reclamation, protection, and outreach plans.",
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
  backlink_enrichment_summary?: Record<string, unknown>;
  referring_domain_opinions?: Array<Record<string, unknown>>;
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
