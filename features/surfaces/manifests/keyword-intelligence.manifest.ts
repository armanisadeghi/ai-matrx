/**
 * Surface manifest — Keyword Intelligence (`matrx-user/keyword-intelligence`).
 *
 * The floating Keyword Intelligence window (`keywordWindow` overlay) — the
 * canonical per-keyword dossier: universal market metrics + classification,
 * relationship edges, and (when opened from a site) that site's stored search
 * performance. Values emit while the window is mounted; the emitter lives in
 * `features/marketing/seo/keyword/KeywordIntelPanel.tsx`.
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
  { key: "keyword_identity", label: "Keyword identity", sortOrder: 100 },
  { key: "keyword_market", label: "Market metrics", sortOrder: 200 },
  { key: "keyword_classification", label: "Classification", sortOrder: 300 },
  { key: "keyword_relationships", label: "Relationships", sortOrder: 400 },
  { key: "keyword_site_evidence", label: "Site evidence", sortOrder: 500 },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Identity ───────────────────────────────────────────────────────────
  {
    name: "phrase",
    label: "Keyword phrase",
    description:
      "The keyword the window is focused on, exactly as typed. Empty string when the window is open with no keyword entered yet.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "keyword_identity",
    sortOrder: 300,
  },
  {
    name: "keyword_known",
    label: "In keyword library",
    description:
      "True when the phrase resolved to a `seo.keyword` library row; false for unknown phrases (no market data exists yet).",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "keyword_identity",
    sortOrder: 310,
  },
  {
    name: "keyword_id",
    label: "Keyword id",
    description:
      "UUID of the `seo.keyword` row. Empty when the phrase is not in the library.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "keyword_identity",
    sortOrder: 320,
  },
  {
    name: "keyword_language",
    label: "Keyword language",
    description:
      "Language code of the library keyword (e.g. \"en\"). Empty when the phrase is not in the library.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    autoContext: false,
    group: "keyword_identity",
    sortOrder: 330,
  },
  // ── Market ─────────────────────────────────────────────────────────────
  {
    name: "keyword_brief",
    label: "Keyword brief",
    description:
      "THE condensed keyword dossier (buildKeywordBrief): search volume, CPC, competition, trend, classification, and site performance when scoped. The single value an agent should read first. Empty when no phrase is entered.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    group: "keyword_market",
    sortOrder: 400,
  },
  {
    name: "keyword_market",
    label: "Market rows",
    description:
      "The raw `seo.keyword_market` rows (per location): volume, CPC, competition, monthly searches, bids, freshness, provider. Empty when the keyword has no fetched market data.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    group: "keyword_market",
    sortOrder: 410,
  },
  // ── Classification ─────────────────────────────────────────────────────
  {
    name: "keyword_classification",
    label: "Intent classification",
    description:
      "The 13 intrinsic classification columns of the library keyword (intent_class, funnel_stage, specificity, query_form, local_intent, urgency, audience_type, brand_presence, comparison_intent, price_sensitivity, transaction_direction, fulfillment_mode, compliance_framing), non-null values only. Empty when unclassified.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "keyword_classification",
    sortOrder: 500,
  },
  // ── Relationships ──────────────────────────────────────────────────────
  {
    name: "keyword_relationships",
    label: "Relationship edges",
    description:
      "All `seo.keyword_edge` rows touching this keyword, annotated with partner phrase, direction, type, status, origin, and confidence. Empty array when the keyword has no recorded relationships; absent when the phrase is not in the library.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    group: "keyword_relationships",
    sortOrder: 600,
  },
  // ── Site evidence (present only when opened from a site) ──────────────
  {
    name: "site_id",
    label: "Bound site id",
    description:
      "UUID of the `web.site` the window was opened from. Empty when the window was opened without a site binding (e.g. from the tools grid).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "keyword_site_evidence",
    sortOrder: 700,
  },
  {
    name: "page_id",
    label: "Bound page id",
    description:
      "UUID of the `web.page` the window was opened from, when launched from a page workspace. Empty otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "keyword_site_evidence",
    sortOrder: 710,
  },
  {
    name: "brand_id",
    label: "Bound brand id",
    description:
      "UUID of the `web.brand` the window was opened from. Empty when unscoped.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "keyword_site_evidence",
    sortOrder: 720,
  },
  {
    name: "site_keyword_performance",
    label: "Site search performance",
    description:
      "This site's stored organic performance for the keyword (`seo.v_site_keyword_performance` rows — clicks, impressions, CTR, position, strongest page, workflow status). Present only with a site binding AND a library keyword that has appeared in synced query evidence.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    group: "keyword_site_evidence",
    sortOrder: 730,
  },
];

/**
 * What may be written INTO this window. Declared here, serviced by the tab
 * that owns the state (`KeywordResearchTab` via `useSurfaceWriteHandlers`),
 * reached by any rendered block or agent result through
 * `applySurfaceWrite("keyword_selection", …)`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "keyword_selection",
    label: "Keyword selection",
    description:
      "Select or deselect one researched keyword as a supporting keyword candidate for the bound page. Value is { phrase: string, selected: boolean }. Ephemeral: it moves the window's selection only — the user still presses Add as supporting to persist. Rejected when the window has no page binding, or for the primary keyword itself.",
    valueType: "object",
    mode: "ui",
    // A strategist agent proposing which keywords to support is genuinely
    // useful, and it changes what the user is about to attach to their page —
    // so it asks. Nothing here is persisted by the write itself; the user still
    // presses Add as supporting.
    applyPolicy: "ask",
    group: "keyword_relationships",
    sortOrder: 610,
  },
];

export const keywordIntelligenceManifest: SurfaceManifest = {
  surfaceName: "matrx-user/keyword-intelligence",
  label: "Keyword Intelligence",
  overlayId: "keywordWindow",
  readiness: "partial",
  readinessNote:
    "Rank targets and the stored SERP landscape load tab-locally (aidream reads) and are not yet emitted as surface values; declare + lift when the rank data layer gets a shareable cache.",
  intro: `<surface_intro>
The Keyword Intelligence window is the platform's canonical dossier for ONE
keyword. The user researches, evaluates, and acts on a single phrase here:
market demand (volume, CPC, competition, trend), intent classification,
relationships to other keywords, and — when opened from a site — that site's
real search performance for it. Read keyword_brief first; it is the condensed
truth. keyword_known=false means the phrase has no library data yet: useful
work is proposing whether it deserves research, not inventing metrics.
Numbers here are provider evidence — never fabricate or extrapolate them.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
  writeTargets,
  agentRoles: [
    {
      name: "keyword_strategist",
      label: "Keyword strategist",
      description:
        "Judges the keyword's value for the bound site: targeting verdict, funnel fit, cannibalization risk, and what content should own it.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "content_brief_writer",
      label: "Content brief writer",
      description:
        "Turns the keyword dossier into an actionable content brief: angle, structure, entities to cover, and metadata candidates.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "serp_analyst",
      label: "SERP analyst",
      description:
        "Reads the stored SERP landscape and rank evidence to explain who wins this query and why, and what it takes to compete.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createKeywordIntelligenceScope(values: {
  phrase: string;
  keyword_known: boolean;
  keyword_id?: string;
  keyword_language?: string;
  keyword_brief?: Record<string, unknown>;
  keyword_market?: Array<Record<string, unknown>>;
  keyword_classification?: Record<string, unknown>;
  keyword_relationships?: Array<Record<string, unknown>>;
  site_id?: string;
  page_id?: string;
  brand_id?: string;
  site_keyword_performance?: Array<Record<string, unknown>>;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
