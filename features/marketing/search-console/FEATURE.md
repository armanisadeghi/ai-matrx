# Search Console Dashboard — `/marketing/search-console`

The GSC data dashboard: the full Search Console search-performance dataset
(queries, pages, countries, devices, search appearance) with GSC-parity
drill-downs, period comparison, floating drill-down panels, and Copy /
Copy-as-JSON / Copy-for-AI on every element. Data parity with GSC itself;
UI deliberately beyond it. Status: **live core** (2026-07-30).

## Data spine (cross-repo)

- **Fact table:** `seo.search_performance_daily` (`provider='gsc'`), fed by
  aidream's canonical ingestion (`aidream/services/seo/gsc_schedule.py`
  nightly + `POST /seo/sites/{site_id}/gsc/search-performance/sync`
  on-demand — see aidream `services/seo/FEATURE.md`). Six dimension
  profiles per site per day; ~16-month backfill; append-only.
- **Read layer:** four RPCs applied live and recorded in
  [`migrations/seo_gsc_perf_rpcs.sql`](../../../migrations/seo_gsc_perf_rpcs.sql):
  `seo.gsc_perf_summary` / `gsc_perf_timeseries` / `gsc_perf_breakdown` /
  `gsc_perf_freshness`. **ALL top-level `seo.gsc_perf_*` read RPCs are
  `SECURITY DEFINER` with `seo.gsc_assert_site_access(p_site_id)` as their
  FIRST statement** ([`migrations/seo_gsc_rpc_security_definer.sql`](../../../migrations/seo_gsc_rpc_security_definer.sql),
  2026-08-07): as INVOKER, the row policy ran `iam.has_org_access()` per
  fact row (~500k calls, 12.8s measured vs 0.3s) and PostgREST's statement
  timeout turned whole tabs into 500s that rendered as "No data". Any NEW
  site-scoped GSC read RPC MUST follow this pattern — DEFINER + the assert
  guard — never bare INVOKER, and never DEFINER without the guard. **THE ACCURACY CONTRACT lives in that migration's
  header — read it before touching any of this feature's numbers**:
  narrowest-profile resolution (property = truth for totals; bare
  query/page profiles avoid `query_page` sampling loss), CTR =
  Σclicks/Σimpressions, position weighted only over rows WITH a position,
  wildcard-escaped ILIKE filters, and WINNING-RUN dedup (dedup_key is
  RUN-scoped and Google restates days — per (profile, date) only the newest
  run's rows aggregate, chosen before user filters apply).
- Reads go browser → Supabase directly (`data.ts`); the ONE compute call is
  the sync trigger (`sync.ts` → aidream, streamed, health-gated by the
  site's GSC binding). The portfolio's existing `web.v_site_kpis` contract now
  delegates every GSC field to `seo.gsc_perf_site_portfolio`, which uses this
  same canonical fact table and `gsc_perf_summary` accuracy path
  ([`migrations/seo_gsc_site_portfolio_canonical_source.sql`](../../../migrations/seo_gsc_site_portfolio_canonical_source.sql)).
  The remaining legacy `web.gsc_page_stat` page-level readers are tracked in
  `docs/handoffs/gsc-page-stat-retirement.md`.

## Surface map

- `app/(core)/marketing/search-console/page.tsx` → `SearchConsoleGate`
  (the route's ONE `next/dynamic({ssr:false})` edge; recharts and all
  sub-components import statically inside — Fragmentation Law).
- `components/SearchConsoleWorkspace.tsx` — composition root. No `?site` →
  `SearchConsolePortfolio` (cross-site KPI cards over `listSites`; freshness,
  not click count, determines whether data exists; every stale/no-data card
  offers the correct one-click `Sync now` or `Connect` action);
  `?site=` → per-site dashboard. **ALL view state is URL state**
  (`lib/url-state.ts`): `?site&tab&range&compare&q&qc&qn&pg&pgc&country&device&appearance`
  (+ `from`/`to` for custom ranges) — every drill-down is a shareable link.
  View STYLE only would go to `useListViewPrefs`; query state never persists.
  Ranges run **1d / 7d / 14d / 28d / 3m / 6m / 12m / 16m / custom**; the
  default is the NAMED `GSC_DEFAULT_RANGE` (`types.ts`) — parse fallback,
  URL omission, and the `resolvePeriods` fallback all read that ONE
  constant (a positional `GSC_RANGE_PRESETS[1]` silently retargets the
  moment a preset is added at the front, which adding the short windows
  did). Preset windows CLAMP to the site's freshest data day
  (`gsc_perf_freshness`) so a lagging sync never fakes a traffic collapse
  — the RESOLVED window always renders beside "data through" (in the header
  when there is room, directly below it on compact widths), because otherwise
  a clamped range change looks like nothing happened. **Dig Here and Insights additionally render `GscPeriodStrip`
  (`components/PeriodStrip.tsx`) at the top of the tab** — "Evaluating
  <current> vs <compare>" in plain dates, flagging an auto-derived compare,
  and embedding the SAME `RangeCompareControl` the header uses (both write
  URL state, so they can never disagree; never fork a second period label
  inside a view — the strip is the ONE place). **GSC days format ONLY via
  `lib/format.ts`** (`formatGscDate` / `formatGscWindow` /
  `describeGscWindow`, UTC parts) — `formatCompactDate` is a local-tz
  DATETIME formatter that rendered `2026-07-09` as "Jul 8, 5:00 PM".
  **Every empty state names the window it found nothing in**
  (`describeGscWindow`) — an undated "nothing matches" reads as broken. The KPI band takes `isFetching` (not just `isLoading`): with
  `keepPreviousData`, `isLoading` is false forever after the first load,
  so without it the tiles sit frozen on stale numbers during every
  refetch; `yoy` compare shifts
  exactly 364 days (weekday-aligned, Feb-29-safe); tab switches and shared
  URLs prune filters the target tab's dimension cannot serve
  (`pruneFiltersForTab` — the RPC's combination guard is unreachable from
  the UI); tables remount per (site, filters, period) slice so page/search/
  sort never leak across scopes.
- `KpiBand` — the four GSC metric tiles; each tile toggles its chart series
  (GSC parity), compare deltas underneath (position delta colors invert —
  lower is better).
- `PerformanceChart` — recharts ComposedChart; toggled series, dashed
  compare overlay aligned by day index, inverted hidden axis for position,
  gap-preserving day walk (missing days never draw connected lines).
- `GscDimensionTable` — THE generic table: one MatrxDataTable
  (**controlled** mode; search/sort/pagination push down to
  `gsc_perf_breakdown`) parameterized by dimension; serves every tab, both
  overview top-10 tables, AND every floating panel. Full `copy` config
  (row + view Copy/JSON/Copy-for-AI + CSV export). Δ columns appear when a
  compare period is active.
- `FilterBar` — GSC-style removable chips. Filter groups may not cross
  dimension profiles ((query/page) | (country/device) | (appearance)); the
  add-menu only offers compatible keys so the RPC's
  `gsc_filter_combination_unsupported` guard can never fire from the UI.
- Drills: row click on Queries ↔ Pages cross-filters and jumps tabs
  (`SearchConsoleWorkspace.drillFor`); right-click on any row (via the
  table's `data-row-id` stamps + `NonEditableContextMenu` with
  `resolveContextOnOpen`) opens floating panels; panel row clicks re-drill
  into further panels (`lib/drills.ts::panelDrillFor` is the ONE panel
  drill vocabulary).
- `windows/GscDrilldownWindow.tsx` + overlay id `gscDrilldownWindow`
  (multi-instance; opener `features/overlays/openers/gscDrilldownWindow.tsx`
  derives a deterministic instanceId per slice, so identical drills focus
  the existing panel while distinct slices float side by side).

## The four method tabs (v2, 2026-08-04; Insights 2026-08-07)

- **Dig Here** (`components/dig/`) — the low-hanging-fruit rules engine,
  CLASS-AWARE since 2026-08-08: a rule may pin one traffic class
  (`gsc_dig_rule.traffic_class` → `gsc_perf_dig.p_traffic_class`;
  [`migrations/seo_gsc_dig_class.sql`](../../../migrations/seo_gsc_dig_class.sql)).
  Query digs always output each row's class; a class-PINNED page dig
  evaluates over the `query_page` profile (class travels with the query —
  totals sit below the bare `page` profile from Google's anonymized-query
  loss, inherent to class attribution); an unpinned page dig keeps `page`
  and reports class NULL. Class templates: Money keywords losing ground /
  Mismatch traffic rising / Educational risers (UUIDs `…0006-0008`).
  Rules live in `seo.gsc_dig_rule` (system templates: fixed UUIDs
  `a1d16001-…`, ownerless, world-readable, re-seeded by the migration;
  user rules: owner-write, org-read; adoption = copy-insert). Evaluation
  is the stateless `seo.gsc_perf_dig` RPC — the FE always sends rule
  CONTENTS, never an id, so the editor's Preview runs unsaved drafts
  through the identical path. The condition vocabulary
  (`types.ts::GSC_DIG_METRICS`, 14 metrics × gt/gte/lt/lte) mirrors the
  server whitelist in `gsc_dig_metric_value` EXACTLY — extend both
  together. A compare-requiring rule under `compare=none` auto-runs vs
  the previous period (`withPrevCompare`) and says so. `?rule=<id>` is
  URL state (digs tab only).
- **Insights** (`components/insights/InsightsTab.tsx` + `ClassInsights.tsx`)
  — the ALGORITHM layer beyond threshold dig rules. **THE TRAFFIC-CLASS
  DOCTRINE (Arman, 2026-08-07): not all traffic is created equal — raw
  totals lie, and CTR is near-meaningless for SEO (good SEO often LOWERS
  it). Every serious read decomposes by class first.** The ONE class
  resolver is `seo.gsc_keyword_class_map`
  ([`migrations/seo_gsc_class_rpcs.sql`](../../../migrations/seo_gsc_class_rpcs.sql)):
  user site valuation (`seo.site_keyword_value` — explicit
  `traffic_class` ruling verbatim when set (2026-08-08, written ONLY by
  `seo.gsc_set_keyword_class`; it exists because no semantic column can
  express a human "brand" ruling); otherwise suppression /
  not_offered / actively_avoided / negative_value → `mismatch`;
  content_role → `money`/`educational`) beats **BRAND MATCH**
  (`class_source='brand_match'`, 2026-08-07: deterministic zero-AI token
  matching of the query against the site's identity — domain minus TLD +
  `web.site.name` + `web.brand.name` + every entry of
  **`web.brand.profile->'brand_aliases'`** (jsonb text array: key people,
  legal names, DBAs, misspellings — the ONE place user/agent-supplied
  brand identity goes; "angie sadeghi" makes IOPBM's doctor queries
  brand), never a hand-written per-site list in code;
  branded traffic "is not real SEO" and is pulled out even when intent
  says transactional, so brand sits ABOVE intent_class and BELOW the
  user's explicit valuation — the rescue hatch when a brand name collides
  with a service term. A **genericity guard** demotes an alias whose
  spaced/token form matches >250 corpus keywords to strong-only matching
  (word-boundary unspaced form, or exact name + a legal entity token) —
  datadestruction.com's "data destruction" IS its money vocabulary, so
  only "datadestruction.com" / "data destruction inc"-shaped queries are
  brand there (Arman's ruling); the threshold + match rules live ONLY in
  the migration's header) beats universal
  `seo.keyword.intent_class` (transactional + commercial_investigation →
  `money`, informational → `educational`, navigational → `brand`) beats
  `unclassified` — which is a FIRST-CLASS bucket and the classifier work
  queue, never hidden. Never fork a second class mapping; extend the
  resolver. Class views (default = **Traffic quality**): `quality` =
  `gsc_perf_class_summary` (the "site +25% but money −3%" decomposition) +
  `gsc_perf_class_movers` (gaining/losing queries/pages within a class;
  page rows carry a per-class `class_mix`); `shifts` = `gsc_perf_shifts`
  (queries whose page mix moved ≥15% of impression share; verdict
  deliberately NOT computed server-side — good-vs-bad shift is the user's
  call); `juice` = `gsc_perf_juice` (pages with ≥3 of the last 6 months of
  sustained educational clicks beside their money return — months of
  strength with zero money clicks = giving content away for free). Class
  views need compare bounds; with `compare=none` they auto-run vs the
  previous period and say so. Algorithm views over
  [`migrations/seo_gsc_insight_rpcs.sql`](../../../migrations/seo_gsc_insight_rpcs.sql):
  **CTR gaps** = `seo.gsc_perf_ctr_gap` (the site's OWN CTR-by-position
  curve — buckets need ≥5 keys — vs each query/page's actual CTR;
  `missed_clicks` = gap × impressions; site-relative on purpose, a global
  CTR table lies for branded profiles). **Cannibalization** =
  `seo.gsc_perf_cannibalization` (query_page profile; a page competes at
  ≥20% impression share; `pages` jsonb carries the top 5 for the detail
  panel; row click drills to Pages filtered to the query — which IS the
  competing-pages view). **Declining/Rising** = `seo.gsc_perf_trend`
  (equal-halves Δclicks primary + zero-filled full-ISO-week regression
  slope secondary; raises under 28 days — the tab gates client-side with a
  notice instead). All three compose the accuracy contract server-side —
  **never re-implement a score over client rows**. Tables are local-mode
  over the RPC's bounded top-200, rows carry the watch column, `?insight=`
  is URL state (insights tab only).
- **Watchlist** (`components/watch/`) — watch state is the canonical
  per-user primitive `platform.user_entity_state.is_favorite` via
  `favoritesService` (tokens `web_page` / `seo_keyword`), chokepointed in
  `lib/watch.ts`; a keyword-less GSC query bridges through
  `seo.fn_upsert_keyword` on first watch (`useRowWatch` remembers the
  bridge so the row paints watched immediately). Rows come from
  `seo.gsc_perf_watch`, ANCHORED on the watched id arrays — zero-data
  items return real zero rows ("still nothing" is the signal), and query
  matching is by keyword_id OR normalized phrase (facts predate links).
  Every query/page table (tabs, overview, drill panels) carries the eye
  column + right-click Watch via `GscDimensionTable`'s `watch` prop.
- **New Pages** (`components/new-pages/`) — the MANUAL launch tracker for
  Arman's workflow: add the page (step 1 = request indexing in GSC), wait
  for the FIRST impression (the milestone victory), then track early
  numbers top-N lists bury. State = `web.page.launch_tracking` jsonb
  (team-visible, written directly under page RLS; shape + the ONE
  lifecycle derivation in `lib/launch-tracking.ts`); the milestone =
  `seo.gsc_perf_page_first_dates` (all-history winning-run MIN date —
  `web.page.first_seen` is discovery-observed and must NOT be used for
  this). Page creation reuses `createManualPage`; "Track as new page"
  lives in the page context menu.

## Assists — insight findings become one-click chips (2026-08-08)

The Assists primitive (`features/assists/FEATURE.md`) consumes this feature's
algorithm layer: `insights-assists-producer.ts` sweeps three findings per site
— **money-page decay** (`gsc_perf_class_movers` page/money/loss), **CTR gap**
(`gsc_perf_ctr_gap`, page dimension), **unclassified backlog**
(`gsc_perf_class_summary`) — and emits capped, deduped assists with REAL
actions: the page findings launch the **`seo.page_analyzer` agent slot**
pre-filled with the code-compressed finding (window, class, clicks/Δ, actual
vs expected CTR — pre-fill only, the user sends); the classification finding
navigates to the classification workbench (`?view=classification`, filtered
to unclassified) or, above 70% unclassified share, the intake wizard.

- **The sweep window is FIXED**: 28 days ending at the site's freshest data
  day vs the previous 28 (`resolvePeriods` with `range:"28d"`, `compare:"prev"`)
  — never the user's URL range, so findings and dedupe keys don't churn with
  view state. One sweep per site per browser session.
- Producer rules: `filterUndecidedKeys` first (dismissal is durable), one
  assist per finding kind per site, 14-day expiry, conservative thresholds
  (constants at the top of the producer). Dedupe key =
  `seo.gsc_insight.<finding>:<siteId>:<page_id|key>`; site scope rides the
  key (`isGscInsightAssist`).
- `components/GscAssistStrip.tsx` renders THIS site's chips inline under the
  health banner via `selectAssistsForSurface` + the canonical `AssistChip` —
  never a forked chip. The same rows appear in the global dock; deciding in
  either place clears both. `surface_name` is `matrx-user/marketing` (what
  the route resolves to in route-to-surface) — move the `GSC_ASSIST_SURFACE`
  constant when a dedicated GSC surface manifest lands.

## Classification UI — the manual truth-editing surface (2026-08-08)

Classification is important enough for a DEDICATED UI (Arman, 2026-08-08).
It lives on the per-site keywords route —
`/marketing/brands/[brandId]/sites/[siteId]/keywords?view=classification`
(`components/classification/KeywordClassificationWorkspace.tsx`, rendered by
the keyword-research feature's `SiteKeywordsView` toggle) — NOT a new
top-level route. Entry points: the Traffic-quality summary rows link every
class into it (`Classify →` / `Review →`,
`?view=classification&f_traffic_class=select:<class>`; the legacy
`/marketing/sites/[siteId]/...` shim keeps such links brand-free).

- **Read:** `seo.gsc_keyword_class_review`
  ([`migrations/seo_keyword_classification_ui.sql`](../../../migrations/seo_keyword_classification_ui.sql))
  — every GSC-active keyword for a 28-day window with class, class_source,
  clicks/impressions (volume is what makes review meaningful), AI intent,
  and the valuation row's override/notes. Winning-run dedup per THE
  ACCURACY CONTRACT; server-paged/sorted/filtered (class + source accept
  arrays because the table's select filters are multi-choice — a filter the
  server can't serve must not render).
- **Write:** `seo.gsc_set_keyword_class` is THE one human write path
  (single + bulk share it; bulk carries ONE shared notes field). It writes
  the explicit `traffic_class` column AND the semantic columns exactly as
  the resolver reads them (money→content_role='money_page';
  educational→'supporting_content'; mismatch→service_match='not_offered';
  brand→traffic_class only), clears contradicting mismatch triggers on
  positive rulings (resetting workflow_status 'suppressed'→'candidate' —
  the table CHECK forbids suppressed-without-reason), and `clear` reverts
  to machine classification. **Mismatch REQUIRES notes** — a ruling must
  carry its case (server-enforced: `gsc_mismatch_needs_notes`). It returns
  the RESOLVED (class, class_source) rows so the UI confirms the flip to
  `site_value` from server truth. Gate: `seo.gsc_assert_site_editor` —
  the SAME editor predicate as the table's RLS, once per call (direct
  table writes are not granted to `authenticated`).
- **Provenance always visible** — `ClassSourceChip` (vocabulary
  `types.ts::GSC_CLASS_SOURCES`) beside every class; any `site_value` row
  offers "Clear ruling", including legacy semantic-column rulings. The
  class chip itself IS the control (`ClassCell` — a dropdown fed by
  `GSC_TRAFFIC_CLASSES`, so a new class needs zero cell changes; Arman's
  ruling 2026-08-08: never a fixed button row).
- **Workbench v2 (2026-08-08)** — the full spec landed the same day:
  - **Live scoreboard** (`ClassStatsBand` over `gsc_perf_class_summary`):
    per-class keywords/clicks/impressions + the Unclassified countdown,
    moving on every ruling (the `["marketing","gsc"]` invalidation IS the
    gamification loop). Tiles filter the table; an unconfirmed chip filters
    to auto-applied rulings awaiting human eyes.
  - **Pattern rules** (`seo.keyword_class_rule`, architecture mirrors
    `gsc_dig_rule`: ownerless world-readable templates with fixed UUIDs
    `a1d18001-…` re-seeded by `migrations/seo_keyword_class_rules.sql`,
    owned user rules, copy-insert adoption). Match kinds
    contains/word/exact/starts_with/ends_with — matching is SERVER-side
    (`gsc_keyword_class_review` p_pattern/p_match); preview pipes a rule's
    live matches into the main table preselected, the user prunes, then
    applies (origin='rule', confirmed=true). Per-rule `auto_apply` opt-in
    runs once per site per session over NEW unclassified matches with
    confirmed=false (flagged amber until confirmed via
    `gsc_confirm_keyword_class`); the editor suppresses offering
    auto-apply while the current preview is pruned. Provenance rides
    `site_keyword_value.metadata.classification`
    ({origin, rule_id, confirmed, applied_at}).
  - **CSV / workbook round trip** (`ImportExportMenu`): full filtered
    export, import template, CSV import via papaparse, "Send to workbook"
    (`pushTableToWorkbook`, features/data-tables) and "Import from
    workbook" (`getLatestSnapshot` → the NEW
    `features/data-tables/univer-snapshot-rows.ts` reader). EVERY import
    path lands in `seo.gsc_class_import` — server dry-run diff (change /
    cleared / unchanged / unknown_keyword / invalid_class / missing_notes)
    shown before anything applies; apply routes through
    `gsc_set_keyword_class` server-side (one mapping, one home).
  - **Classify with AI** — the EXISTING universal classifier
    (`seo.keyword_classifier` slot via aidream
    `POST /seo/keywords/classify`, 200-id chunks, admin-gated
    server-side): selection or filtered-unclassified batch; results land
    as `intent_class` = "AI intent" provenance, overridable like any
    machine signal. The Site Intake Wizard (`intake/`) stays the
    whole-site AI interview; this is the surgical batch complement.
  - **Floating panel** (`windows/KeywordClassificationWindow.tsx`, overlay
    `keywordClassificationWindow`, opener
    `features/overlays/openers/keywordClassificationWindow.tsx`,
    ephemeral, viewport-clamped rect): the SAME workspace with
    `urlState={false}` (local table state — the page underneath owns the
    URL). Entry: "Classify in panel" atop Traffic quality; the workspace
    component is props-based (siteId/siteDomain/organizationId) so any
    surface can mount or open it.
  - Next round (documented, not built): sub-class / second-layer
    classification — comparison-style clues ("vs", "before and after")
    don't fit the four classes and await a sub-class vocabulary ruling.
- The AI interview/wizard is a SEPARATE program (aidream
  `docs/handoffs/content-ir-agent-slots.md`); this surface is the manual
  truth layer beside it. Never fork a second write path for classes —
  extend `gsc_set_keyword_class`.

## Brand identity — the system and what remains

Deterministic matching covers the derivable identity; everything else
enters through **`web.brand.profile->'brand_aliases'`** — extend that
array, never the resolver's alias derivation, for per-site knowledge
(people, legal names, DBAs, misspellings). Server primitives (ONE
derivation, in `seo_gsc_class_rpcs.sql`): `gsc_brand_aliases` (derive) →
`gsc_brand_hits` (corpus scan) → consumed by BOTH `gsc_keyword_class_map`
and `gsc_brand_identity` (the UI narrator: alias, origin, match counts,
genericity demotion). Writers: `gsc_set_brand_aliases` (the
classification workspace's Brand panel —
`components/classification/BrandIdentityPanel.tsx`) and the intake
wizard's accepted proposals (server-side apply) — same array, no other
write path. Live aliases: All Green + Titanium → "arman sadeghi"; IOPBM
→ "angie sadeghi", "angizeh sadeghi"; datadestruction → "arman
sadeghi", "datastruction". Open items:

- **Misspelling matching** — alias entries cover known ones ("armani
  sadeghi", "army sadeghi" exist in the corpus, unmatched); a trigram
  rung waits for evidence the alias list under-catches.
- **Web-access alias enrichment** — intake proposes aliases from GSC
  data; a web-access agent could add officers/DBAs/former names the
  data never shows.
- **Competitor brand class** — "absolute data destruction",
  "guardiandatadestruction.com" are somebody else's brand traffic and
  currently land in unclassified/educational. Could derive from per-site
  competitor lists (same `profile` mechanism) or
  `seo.keyword.brand_presence` once classifier coverage exists;
  product-semantics call is Arman's.

## The ambassador — classes leave this route (2026-08-08)

Rung 6 of the canvas doctrine: once a feature is rich, its best data belongs on
every surface that benefits. Class decomposition used to live ONLY here, so the
sites list, site overview, brands, and PageWorkspace all showed undecomposed
clicks — the doctrine's named failure ("raw totals lie").

`components/ambassador/` is the embed layer. Hosts pass a `siteId`; the layer
owns the period/compare machinery so no host has to learn it.

| Export | Use |
|---|---|
| `useGscClassRollup(siteId, range)` | One site. Clamps the window to that site's freshest day, forces the prev-period compare `gsc_perf_class_summary` requires, zero-fills to canonical class order. |
| `shapeGscClassRollup(rows, periods)` | Pure core of the above — unit-tested arithmetic. |
| `GscClassBar` | The embeddable strip (`bar` \| `tiles`). Segments drill into `GscDrilldownWindow`; header links back here. |
| `useGscPortfolioRollup(siteIds, range)` | Many sites, via `seo.gsc_perf_class_summary_multi`. |
| `GscPortfolioClassBar` | Brand/portfolio strip; states how many sites contributed. |

Mounted on: `SiteOverview` (under the KPI grid), `SiteKpiPeeks` (inside the
lazy hovercard, so a 22-row table costs nothing until hovered), and
`BrandWorkspace` (above Websites — brands previously carried no search data).

**`gsc_perf_class_summary_multi` delegates** to the per-site function rather
than re-implementing the dedup + class-resolver join: one accuracy contract,
and each site keeps its own access assert. Denied sites are skipped, not
raised, so one inaccessible site cannot blank a portfolio. It deliberately
returns NO distinct query count — summing per-site DISTINCTs double-counts a
phrase ranking on two sites, and a subtly wrong number is worse than none.

**Both strips clamp to the freshest QUERY-profile day** — single-site via
`gsc_perf_freshness`, portfolio via `gsc_perf_freshness_multi` — so a brand and
its site report the identical window and total. Two bugs adversarial review
caught here, both fixed before anyone saw them: an unclamped portfolio window
included empty trailing days against a settled compare period (every class read
as a decline), and `resolveGscDataThrough` took the max across ALL profiles, so
a fresher `page` import pushed a query-only window past the last day of query
data. `resolveGscDataThrough` now takes the profiles the caller actually reads.

**Segments open the Quality insight, they do NOT open a filtered drilldown.**
`GscFilters` has no traffic-class key, so a per-class drilldown would list every
query under a class-specific heading — and `instanceIdFor` ignores the title, so
all five segments would collapse into one mislabeled window. Claiming a filter
we do not have is worse than one more click.

## Doctrine

- Never bypass the `gsc_perf_*` RPCs with raw table aggregates in the FE —
  the accuracy contract (profile resolution + latest-fact dedup + weighted
  position) lives server-side ONCE. Dig Here composes the same contract:
  `seo.gsc_perf_dig` IS breakdown + a whitelist-validated conditions pass
  (NO dynamic SQL — `gsc_dig_metric_value`/`gsc_dig_condition_passes`);
  with `[]` conditions it must equal `gsc_perf_breakdown` for the same
  slice (verified live; re-verify after touching either).
- Dig evaluation is server-side only — never re-implement a condition
  check over client rows. The FE validates for UX (`lib/dig-rules.ts`
  mirrors the whitelist); the RPC RAISE is the enforcement.
- Two deliberate dig semantics (adversarial-review outcomes, not bugs):
  conditions/sorts evaluate on the ROUNDED values the table displays; a
  from-zero riser (compare = 0, current > 0) counts as +Infinity percent
  growth for matching/sorting — "Δ clicks % > 50" catches brand-new
  queries taking off — while the OUTPUT pct columns stay NULL (JSON).
  Details in the migration's helper-section comment.
- Watch = `user_entity_state.is_favorite` through `favoritesService` via
  `lib/watch.ts` — never a new watch table, never the `PinButton` sidebar
  path. Launch tracking = `web.page.launch_tracking` — never `metadata`
  (pipeline writers replace it wholesale), never user_entity_state (launch
  state is team-visible).
- The shared metric column set lives ONCE in `lib/columns.tsx` — every GSC
  table (breakdown, dig, watch) builds from it; a per-table copy is the
  defect it exists to kill.
- One dimension table, one drill vocabulary, one panel — extend
  `GscDimensionTable` / `panelDrillFor` / `GscDrilldownWindow`; never fork a
  per-tab table or a second panel body.
- `types/database.types.ts` (seo Functions) and
  `types/python-generated/api-types.ts` (the gsc sync path) were
  hand-patched to match the live DB / next-deploy OpenAPI because this
  environment lacks the generator tokens — the next `pnpm db-types` /
  API-type sync must produce identical entries (if it diffs, the generated
  output wins and consumers get fixed).

## No read may fail silently (2026-08-04)

Ingestion died for five days while the dashboard served one stale day as
truth. Two rules came out of that, and both are load-bearing:

- **An empty state must require a SUCCESSFUL empty read.** `hasAnyData` off a
  failed query rendered "No Search Console data for this site yet" over a site
  with 16 months of history — and, via a false `gscBound`, removed the Sync
  button and told the user to bind a property that was already bound. Gate
  every "there is nothing here" on `isSuccess`, never on `!isLoading`. Unknown
  is not the same as absent, and it must never be rendered as absent.
- **Every query that can fail renders its failure.** `InlineQueryError`
  (`components/shared/MarketingUi.tsx`) is the one-line form for a failed read
  that sits above still-usable chrome; `QueryError` replaces a whole panel.
  A `—`, an empty table, or a flat chart that a fetch error can produce is a
  lie the user cannot detect.

**A signal you cannot distinguish from silence is not a signal.** GSC returns
no row for a zero-traffic day, so "distinct dates < calendar days" can never
tell a data gap from a quiet Sunday. `missing_days` is REPORTED (useful once a
human is already diagnosing) but never produces a problem — the same reason
`partial_coverage` was deleted server-side. Re-adding a cry-wolf one file over
is worse than never deleting it, because the second one looks reviewed.

`IngestionHealthBanner` + `seo.gsc_ingestion_health` are the surfacing layer.
The RPC diagnoses from the **nightly scheduler's own run history**, not only
`seo.collection_run` — the outage that motivated it never created a run row
at all, so v1 reported `completed / 0 consecutive failures` beside 15-day-old
data. Its `severity` (`info` / `warning` / `critical`) decides the banner's
tone in ONE place: a never-synced site is not an alarm. Staleness also shows
on the portfolio landing, because that is the first screen anyone sees.

## Sync goes FORWARD. History goes BACKWARD. (2026-08-04)

Two buttons because they are two directions, and neither can do the other's
job. **Sync** walks the incremental watermark forward toward today. **History**
(`mode: "backfill"`) walks backward from the oldest covered window toward
Google's ~16-month horizon, one 30-day window at a time, and reports the
OLDEST day reached as `coveredThrough` with `daysBehind` counting history
still missing.

Pressing Sync on an up-to-date site correctly returns nothing new — and until
this shipped, that was the ONLY answer available to someone holding two weeks
of data and wanting sixteen months, because backfill was nightly-only (60
days/night) and had never once succeeded. **Never let "no new rows" imply a
broken connection**: `created === 0` with `existing > 0` means we already had
every row Google returned, and the toast says so and points at History. Only
`created === 0 && existing === 0` is a real "Google returned nothing".

## The import narrator (2026-08-08)

**If the system is doing something — or NOT doing something the user
expects — the UI says so, persistently, from SERVER state.** Client state
dies on refresh; whether a history import is running is a server fact.
`seo.gsc_backfill_status`
([`migrations/seo_gsc_backfill_status.sql`](../../../migrations/seo_gsc_backfill_status.sql),
SECURITY DEFINER over `collection_run`, 30-min activity window so a dead
run can't read as forever-in-progress) feeds a three-state banner in
`SearchConsoleWorkspace`: (1) import RUNNING (any trigger, any tab) →
narrate the window being retrieved + where stored history begins + "one-time
import, kept after Google deletes its copy", polling freshness so the date
moves live; (2) visible range predates stored history and nothing runs →
say exactly how many days were never imported + one-click "Import history
now"; (3) otherwise nothing. Sync (`syncing`) and History (`historyRunning`)
have SEPARATE spinner state — one shared flag once put three spinners on
screen at once. The custom-range editor is INLINE conditional rendering,
deliberately not a Popover (opening one from a closing Radix Select loses
its dismiss-layer race — the input "flashed and disappeared").

## Change Log

- 2026-08-11 — Portfolio truth + actions: `web.v_site_kpis` now reads the
  canonical `seo.search_performance_daily` spine through
  `seo.gsc_perf_site_portfolio`, eliminating the false stale July 26 cards
  while per-site dashboards were current through August 9. Zero-click sites
  are no longer misclassified as empty; stale/empty cards now offer targeted
  Sync or Connect actions, and site names use the canonical entity door.
- 2026-08-09 — Brand + Rules panels de-modalized: both workspace side
  sheets moved off the blocking `Sheet` onto the canonical
  `SidePanelSurface` (non-blocking, drag-resizable, table stays live;
  mutually exclusive toggles). Brand alias input is now a live typeahead —
  debounced server-side `pattern/contains` corpus probe (the same matcher
  as rule preview) shows the broad-match count + top matches with the hit
  highlighted, click-to-complete; every alias row's match count is a door
  that filters the keyword table behind (`onInspectAlias` → table search).
- 2026-08-08 — Assists wired (§ Assists): insight findings (money decay /
  CTR gap / unclassified backlog) emit deduped one-click assists — page
  findings launch the `seo.page_analyzer` slot pre-filled with the finding,
  classification navigates to the workbench/intake. Inline `GscAssistStrip`
  under the health banner. Live-verified on datadestruction (CTR gap →
  agent window pre-filled), vasaro (thresholds correctly withhold classify
  at 28% share), IOPBM (classify chip → workbench filtered to unclassified).
- 2026-08-08 — Ambassador layer: traffic classes now render on site
  overview, the sites-list hovercard, and brand pages via
  `components/ambassador/` + the new `gsc_perf_class_summary_multi` RPC.
  Consolidated the freshest-day reduction into `resolveGscDataThrough`
  (workspace + drilldown + rollup each had their own copy).
- 2026-08-08 — Brand identity integration round: shared server
  primitives (gsc_brand_aliases/gsc_brand_hits, threshold fn), the
  gsc_brand_identity narrator + gsc_set_brand_aliases writer RPCs, and
  the Brand panel in the classification workspace (view derived +
  custom aliases, genericity explained, add/remove). Fixed a refactor
  bug where dedup-by-joined killed the token-subset rule (dedup is by
  token set). Resolver preserved the verbatim traffic_class rung.
- 2026-08-08 — **Classification workbench v2** (§ Classification UI):
  class-chip dropdown cell, live class scoreboard, pattern rules
  (`seo.keyword_class_rule` + 11 clue templates, preview-prune-apply,
  opt-in auto-apply with unconfirmed flagging), CSV + Univer-workbook
  round-trip import with server diff (`gsc_class_import`), Classify-with-AI
  batch over the universal classifier slot, floating window panel
  (`keywordClassificationWindow`) + props-based workspace. Live-verified on
  datadestruction.com incl. a real 2-keyword AI run moving the scoreboard.
- 2026-08-08 — **Classification UI shipped** (§ Classification UI):
  `?view=classification` on the site keywords route; explicit
  `seo.site_keyword_value.traffic_class` + `notes` columns; resolver reads
  the explicit ruling at the top of the site-value rung;
  `gsc_keyword_class_review` (review read) + `gsc_set_keyword_class` (one
  write path, mismatch-requires-notes) + `gsc_assert_site_editor`;
  Traffic-quality rows link into the queue. Verified live on
  datadestruction.com (4,316 keywords; override → site_value → clear).
- 2026-08-08 — Period strip: `GscPeriodStrip` atop Dig Here + Insights
  (plain-date "Evaluating X vs Y", auto-compare flag, embedded
  RangeCompareControl; absorbed the per-view compareAuto/period labels);
  every dig/insight empty state names its window; new `lib/format.ts`
  UTC-safe date formatting replaces `formatCompactDate` in the header +
  portfolio (was rendering GSC days a day early with a bogus time).
- 2026-08-08 — Brand identity round 2 (Arman's rulings): `brand_aliases`
  profile source (people/legal names — seeded for All Green, Titanium,
  IOPBM), word-boundary strong matching (competitor domains excluded),
  exact-name + legal-suffix strong rule ("data destruction inc" = brand,
  "terminal data destruction ltd" ≠), roadmap section added.
- 2026-08-08 — Brand-match rung in `gsc_keyword_class_map`: zero-cost
  deterministic brand detection from web.site/web.brand identity
  (class_source='brand_match', genericity guard at 250). Verified live:
  allgreenrecycling 6-mo brand bucket = 1,292 clicks / 30 queries
  (previously polluting money/educational/unclassified);
  datadestruction.com money/educational preserved via the guard. Also:
  QualityView totals row + explicit period label (ClassInsights.tsx).
- 2026-08-08 — Class-aware Dig Here: traffic_class pin on rules +
  gsc_perf_dig p_traffic_class/class output (seo_gsc_dig_class.sql), class
  picker in the editor, class chips in results/rule list, three class
  templates seeded. Verified live (money-dig surfaced "hard drive
  destruction" −67% clicks on datadestruction.com).
- 2026-08-08 — Import narrator banner (server-aware via
  seo.gsc_backfill_status, survives refresh), split Sync/History spinner
  state, history-to-horizon loop, inline custom-range editor (popover
  dismiss-race fix), overview tables 25 rows/full height.
- 2026-08-07 — Traffic-class layer: `gsc_keyword_class_map` resolver +
  class_summary / class_movers / shifts / juice RPCs
  (seo_gsc_class_rpcs.sql) + Quality/Shifts/Juice insight views
  (ClassInsights.tsx); Insights default is now Traffic quality. Classifier
  coverage is the known bottleneck (~1.2k of 136k keywords classified) —
  the agent-slot system for AI classification is written up in
  aidream/docs/handoffs/content-ir-agent-slots.md.
- 2026-08-07 — Insights tab: ctr_gap / cannibalization / trend algorithm
  RPCs (seo_gsc_insight_rpcs.sql, applied + ledgered) + InsightsTab with
  four views, watch columns, drills, copy. Throughput: nightly backfill
  raised 2→12 windows/site (aidream sch_agent_task args, migration 0305)
  and manual History raised 12→17 windows/click (full 488-day horizon in
  one click); full 16-month history landed for the bound sites.
- 2026-08-04 — On-demand history: `mode: "backfill"` + a History button;
  the "stored no new rows" toast no longer cries connection-failure when the
  site is simply already up to date.
- 2026-08-04 — Silent-failure sweep after adversarial review: health RPC v2
  (reads scheduler.sch_run, counts failures not non-successes, detects stuck
  runs, adds severity; the nightly dispatcher is pinned by task ID, never by
  title — a rename would silently kill the branch), `InlineQueryError` for the four
  reads that had no error state, empty state now requires a successful read,
  success toast keys on `reachedLatest` alone, invalidation moved to
  `finally`, portfolio marks stale sites.
- 2026-08-07 — GSC RPC timeout class fix + Insights clarity: all top-level
  `seo.gsc_perf_*` RPCs converted SECURITY INVOKER → SECURITY DEFINER with
  one-shot `gsc_assert_site_access` guard (per-row RLS `has_org_access` was
  12.8s/call → statement-timeout 500s → Insights silently showed "No data";
  now ~0.4s, 31x). Traffic quality view now prints the exact resolved
  current-vs-compare dates and a Total row (clicks/Δ/impressions/Δ/queries).
- 2026-08-04 — Short ranges (1d/7d/14d) + the "it never updates" fixes:
  named `GSC_DEFAULT_RANGE` replaces the positional preset fallback,
  header prints the resolved window, KPI band shows a refetch state,
  single-point charts render dots. Root cause of the stale data itself was
  aidream-side (GSC ingestion had never run — see that repo's fix).
- 2026-08-04 — v2: Dig Here rules engine (seo.gsc_dig_rule templates +
  stateless gsc_perf_dig), Watchlist (user_entity_state favorites +
  anchored gsc_perf_watch, watch column everywhere), New Pages manual
  launch tracker (web.page.launch_tracking + gsc_perf_page_first_dates),
  shared column builders extracted to lib/columns.tsx.
- 2026-07-30 — Feature created: portfolio landing + per-site dashboard
  (overview/queries/pages/countries/devices/appearance), compare periods,
  filter chips, cross-drills, multi-instance drill-down panels, copy
  everywhere. Data spine: aidream sync route + nightly scheduler + 16-month
  backfill; `seo.gsc_perf_*` RPCs.
