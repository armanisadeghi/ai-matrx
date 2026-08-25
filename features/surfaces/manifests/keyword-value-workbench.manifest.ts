/**
 * Surface manifest — Keyword Value Workbench
 * (`matrx-user/keyword-value-workbench`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/value` — `ValueWorkbench`,
 * the flagship worth screen: every GSC-active keyword for ONE site with the
 * level it lands on, the score behind it, who decided it (a rule, a matcher, an
 * AI suggestion, or the expert), and the receipt for each. It is where a person
 * forms an opinion about what a keyword is WORTH and pins it.
 *
 * Why it exists as its own surface (2026-08-24): the page wired the v3 context
 * menu with no `surfaceName`, so every agent launched from a keyword row here
 * got no bound agents and no value mappings — the exact structural hole
 * ADOPTION-SWEEP.md gap 8 recorded. Different agents act here than on the site
 * cockpit ("what is this keyword worth, and why" vs "how is this site doing"),
 * and they need this page's own vocabulary: the LEVELS in play, the review
 * window, the filters, and the rows on screen.
 *
 * Scope only covers the `/value` LEAF. The family beside it (`/value/offerings`,
 * `/value/rules`, `/value/dimensions`, `/value/packs`) defines the machinery
 * rather than listing keywords; those routes stay on `matrx-user/marketing-site`
 * until each earns its own surface.
 *
 * Runtime scope assembly: `features/marketing/lib/scopes/keyword-value-scope.ts`
 * (emitter in `value-system/workbench/ValueWorkbench.tsx`).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const KEYWORD_VALUE_WORKBENCH_SURFACE_NAME =
  "matrx-user/keyword-value-workbench" as const;

const groups: SurfaceValueGroup[] = [
  {
    key: "value_review",
    label: "Value review",
    sortOrder: 100,
    description:
      "The keyword rows on screen, with the level, score and decider each one currently carries.",
  },
  {
    key: "level_vocabulary",
    label: "Level vocabulary",
    sortOrder: 200,
    description:
      "The levels this site actually uses — the words a ruling must be expressed in.",
  },
  {
    key: "site_worth",
    label: "Site worth",
    sortOrder: 300,
    description:
      "What the window says about the site as a whole: valued vs unvalued clicks, the verdict sentence, what meaning is still missing, and how much the expert has ruled.",
  },
  {
    key: "table_view",
    label: "Table view",
    sortOrder: 400,
    description:
      "How the person has narrowed the review: search, level/decider filters, sort, page, and the window under review.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Value review ───────────────────────────────────────────────────────
  {
    name: "visible_value_rows",
    label: "Visible keyword rows",
    description:
      "The `seo.gsc_keyword_value_review` rows on the current table page: keyword_id, keyword, value_band (the level slug), value_score, value_source (how it was decided), traffic_class, clicks and impressions. A bounded page under the active filters — never the site's whole keyword set. Empty while loading or when nothing matches.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    group: "value_review",
    sortOrder: 300,
  },
  {
    name: "matching_keywords_total",
    label: "Matching keywords",
    description:
      "Exact count of keywords matching the current filters and window (the table's true total, not the visible page). Absent while the first page is still loading.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    group: "value_review",
    sortOrder: 310,
  },
  {
    name: "selected_keyword_ids",
    label: "Selected keywords",
    description:
      "`seo.keyword` ids the person has ticked for a batch ruling. Absent when nothing is selected, which is the normal state — never an empty list.",
    valueType: "array",
    // `false` even though the emitter could write it on every build: the
    // platform judges presence with `hasValue()` in `SurfaceContextWindow.tsx`,
    // where an EMPTY ARRAY counts as ABSENT — so `true` made "nothing
    // selected" (the normal state) report "1 required missing" and the surface
    // look broken. Same call, same reasoning, as `admin-users.manifest.ts` and
    // `crm-chasebox.manifest.ts`. Scalars are unaffected.
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "value_review",
    sortOrder: 320,
  },

  // ── Level vocabulary ───────────────────────────────────────────────────
  {
    name: "level_vocabulary",
    label: "Levels in play",
    description:
      "The site's `value_band` vocabulary as currently defined: each level's slug, label, worth and ordering. THE words a ruling on this page must be expressed in — never invent a level that is not in this list. Absent while the vocabulary is still loading.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    group: "level_vocabulary",
    sortOrder: 400,
  },
  {
    name: "levels_are_template",
    label: "Levels are still the template",
    description:
      "True when this site has not customised its levels yet and is still reading the platform template. False once the site owns its own vocabulary. Absent while the vocabulary is loading.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "level_vocabulary",
    sortOrder: 410,
  },

  // ── Site worth ─────────────────────────────────────────────────────────
  {
    name: "value_kpis",
    label: "Value KPIs",
    description:
      "The window's headline counts: { clicks, valuedClicks, valuedShare, unvaluedQueries, unvaluedClicks, totalQueries, coverage } plus period-over-period deltas. Absent until the summary read returns.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "site_worth",
    sortOrder: 500,
  },
  {
    name: "site_verdict",
    label: "Site verdict",
    description:
      "The one-sentence verdict the page renders above the table — { headline, detail, contrastBand } — derived from the level summary. Absent when the window has no clicks at all, which is itself the honest answer.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "site_worth",
    sortOrder: 510,
  },
  {
    name: "meaning_health",
    label: "Missing meaning",
    description:
      "What is unfinished about this site's meaning, as `seo.gsc_site_meaning_health` returns it: the metadata counts behind 'these keywords have no level / no class / no service yet'. Absent while loading. The sentences come from the database — never paraphrase them into new claims.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    group: "site_worth",
    sortOrder: 520,
  },
  {
    name: "expert_ruling_count",
    label: "Rulings by the expert",
    description:
      "How many keywords a person has personally pinned a level on for this site, all time (not just this window). Zero is common on a new site. Absent while loading.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "site_worth",
    sortOrder: 530,
  },

  // ── Table view ─────────────────────────────────────────────────────────
  {
    name: "table_query",
    label: "Table query state",
    description:
      "The person's current narrowing of the review: { search, sort (column + direction), columnFilters (value_band, value_source), page, pageSize }. Always present — it carries the defaults (sorted by clicks, 50 per page) even when untouched.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 300,
    group: "table_view",
    sortOrder: 600,
  },
  {
    name: "active_level_filter",
    label: "Active level filter",
    description:
      "The level slug the table is currently filtered to (the `value_band` column filter), e.g. after clicking a level tile. Absent when the person is looking at every level.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "table_view",
    sortOrder: 610,
  },
  {
    name: "active_source_filter",
    label: "Active decider filter",
    description:
      "The `value_source` the table is currently filtered to — how the level was decided (e.g. an expert override vs a computed rule). Absent when every decider is shown.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "table_view",
    sortOrder: 620,
  },
  {
    name: "review_window",
    label: "Window under review",
    description:
      "The date range the clicks and impressions on this page cover, plus the comparison range behind the deltas: { start, end, compareStart, compareEnd } as ISO dates. Always present — the page opens on a fixed rolling window.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 120,
    group: "table_view",
    sortOrder: 630,
  },
];

export const keywordValueWorkbenchManifest: SurfaceManifest = {
  surfaceName: KEYWORD_VALUE_WORKBENCH_SURFACE_NAME,
  label: "Keyword Value Workbench",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/value",
  inheritsFrom: "matrx-user/marketing-site",
  readiness: "verified",
  readinessNote:
    "Manifest + registry + route mapping + DB rows + runtime emitter all live; the page's context menu passes surfaceName and the emitter's values, and an agent launched from a keyword row was verified to receive them (2026-08-24).",
  intro: `<surface_intro>
Read brand_context and site_context first — they say whose site this is and what it sells.
You are on the Keyword Value Workbench: the screen where a person decides what each of this site's search keywords is actually WORTH to the business, and pins that decision.
A keyword lands on a LEVEL. level_vocabulary is the complete set of levels this site uses — every statement about worth must use those words, and a level outside that list does not exist here. value_source on a row says how the level was decided; a level a person pinned themselves outranks every computed signal and must never be argued away as a mistake.
visible_value_rows is only the current table page under table_query — a sample, narrowed by active_level_filter / active_source_filter. matching_keywords_total is the true filtered count, and review_window is the date range every click and impression here covers.
"Unvalued" is an honest state, not a gap to paper over: value_kpis.unvaluedQueries and meaning_health say what has no meaning yet, and the most useful work is almost always naming those, with a reason a human would recognise.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "value_advisor",
      label: "Value advisor",
      description:
        "Reads the rows on screen against this site's levels and says which keywords look mis-levelled, and why — in the site's own level vocabulary, never a new scale.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "unvalued_triager",
      label: "Unvalued triager",
      description:
        "Works the unvalued queue: takes the keywords carrying clicks with no level yet and proposes the level each one belongs on, with the reason a person would give.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the inherited
 * `brand_id` + `site_id` from the marketing-brand → marketing-site chain.
 */
export function createKeywordValueWorkbenchScope(values: {
  // alwaysAvailable: true → required (inherited)
  brand_id: string;
  site_id: string;
  // alwaysAvailable: true → required (own)
  table_query: Record<string, unknown>;
  review_window: Record<string, unknown>;
  // Inherited optionals (marketing-brand + marketing-site)
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_description?: string;
  site_context?: string;
  gsc_synced_at?: string;
  // alwaysAvailable: false → optional
  selected_keyword_ids?: string[];
  visible_value_rows?: Array<Record<string, unknown>>;
  matching_keywords_total?: number;
  level_vocabulary?: Array<Record<string, unknown>>;
  levels_are_template?: boolean;
  value_kpis?: Record<string, unknown>;
  site_verdict?: Record<string, unknown>;
  meaning_health?: Array<Record<string, unknown>>;
  expert_ruling_count?: number;
  active_level_filter?: string;
  active_source_filter?: string;
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
