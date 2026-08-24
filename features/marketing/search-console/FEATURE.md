# Search Console Dashboard — `/marketing/search-console`

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/marketing/seo/seo-keywords/keyword-system-decisions.md` — read it before touching this feature in ANY repo.

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
  `gsc_perf_breakdown`; typed search stays immediate but the RPC waits for a
  300 ms pause) parameterized by dimension; serves every tab, both
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
  into further panels. `lib/drills.ts` is the ONE panel drill vocabulary —
  `panelDrillFor` (this row's OTHER dimension: pages for a keyword, queries
  for a page) and `rowScopeDrillFor` (this row alone, same dimension: its
  KPIs, its trend, its table). Extend it; never write a drill inline.
- 🚨 **A drill opens a PANEL; the table underneath never re-filters** (P25,
  keyword-system-decisions.md). Row click keeps its cross-filter behaviour
  because the user asked for that one explicitly; every right-click entry is
  additive. A change that makes a panel drill mutate the host table's
  filters, sort, or scroll is a regression, not a simplification.
- `windows/GscDrilldownWindow.tsx` + overlay id `gscDrilldownWindow`
  (multi-instance; opener `features/overlays/openers/gscDrilldownWindow.tsx`
  derives a deterministic instanceId per slice, so identical drills focus
  the existing panel while distinct slices float side by side). **A panel is
  a COMPLETE view, not a screenshot**: it owns its own period strip, its own
  filter chips (`allowedFilterKeysForDimension` / `pruneFiltersForDimension`),
  and its own `GscDimensionTable` with the same Class · Score · Level
  columns. Narrowing a panel never touches the table it came from.
- `windows/GscWhyScoreWindow.tsx` + overlay id `gscWhyScoreWindow`
  (multi-instance, keyed on site+keyword) — one keyword's value receipt as a
  panel. Body is `WhyScoreBody` from the value system; there is no second
  explanation of a score in this app.
- Both panels are registered `mobilePresentation: "drawer"` + `ephemeral`
  in `windowRegistryMetadata.ts`: on mobile they are bottom sheets you swipe
  away back to the table you were reading, which is the same promise the
  floating panel makes on desktop.

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
  **C5 (2026-08-23) — A DIG RULE CAN SAVE ITS MATCHES AS A STAMP.** A rule is
  also a *condition matcher* on a SITUATIONAL dimension's value: `components/dig/
  DigStampPanel.tsx` ("Saves matches as") attaches it via
  `seo.gsc_dig_rule_stamp_upsert`, and `seo.fn_evaluate_condition_matchers`
  re-derives the stamps by running the rule through the IDENTICAL `gsc_perf_dig`
  path — its own base filters, class pin, level pin, sort and row limit — over
  ONE window (the site's current 28 days by default; THE SCOPE RULE is
  structural, never the corpus). Stamps land `source='matcher'` with an `as_of`;
  a re-evaluation releases what stopped matching and never touches a human pin
  (P20). **P21: the stamp is the SEGMENT, never a status a person closes** — if
  a flow needs "done", that is a task referencing the stamp.
  🚨 **Two things that must stay true, both found by breaking them:**
  (1) *the row limit is not the segment* — a segment holds EVERY keyword that
  matches (`gsc_perf_dig` takes `p_limit = 0` for this one caller); a rule's
  `row_limit` is how many rows its TABLE shows and must never be allowed to
  read as the segment's size again; (2) *compare parity* — a compare window is passed ONLY
  when the rule needs one (any `cmp_*`/`delta_*` condition or sort metric,
  mirroring `withPrevCompare`), because `gsc_perf_dig` FULL OUTER JOINs the
  periods and a stray compare silently widens what the rule MEANS (measured:
  1,563 → 2,952 matches on DDI). **What the results table shows is what gets
  stamped** — never let those two diverge.
  A rule also carries a **LEVEL pin** beside the class pin
  (`gsc_dig_rule.level` → `gsc_perf_dig.p_level`, validated against the site's
  own `value_band` vocabulary plus `unvalued` / `negative`), and the results
  table shows **Class · Score · Level** per row via the shared
  `lib/columns.tsx::buildGscValueColumns` + `seo.gsc_keyword_value_for` for
  EXACTLY the rows on screen. That builder is shared with `GscDimensionTable` —
  a second copy of it is a defect. Re-evaluation is also available per-dimension
  from the Dimensions screen; the nightly pass
  (`seo_situational_stamp_refresh`) is PROPOSED, not enabled, in
  `../../../../common-docs/operations/scheduled-tasks.md`.
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
actions: the page findings launch the **`seo.page_analyzer` mandate**
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

**Keyword VALUE tiers (2026-08-21):** value is orthogonal to class and resolves
server-side in `seo.keyword_value_map` (override > computed-with-reasons >
unvalued) — never re-derive a band client-side. Cross-repo system-of-record:
/Users/armanisadeghi/code/common-docs/systems/marketing/seo/seo-keywords/value-system.md — read it
before touching value tiers in ANY repo. FE home: `features/marketing/seo/value-system/`
+ the bake-off workbench at `/marketing/brands/[brandId]/sites/[siteId]/value` (default
forwards to the ruling winner among `/a…/d`).

🚨 **The resolver resolves ONLY what is about to be read.** `seo.keyword_value_map`
takes the keyword ids its caller is about to render (NULL means whole-site); a reader
that passes nothing matches the site's every rule and geo area against the 196k-row
global corpus, blows the 8s statement timeout, and renders a skeleton that reads as
"loading". Every reader passes its GSC window. THE SCOPE RULE in the SoR has the
measurement.

🚨 **And that is only HALF of it — a keyword's facts are resolved once and joined ONCE.**
`seo.gsc_perf_class_movers` obeyed the scope rule and still took **10 s** on the Insights
page's own read (page dimension, class pinned to money), which is the
`[gsc-assists] class movers read failed` a reader saw as an empty panel. Cause: it joined
TWO map CTEs in sequence, the pin collapsed the first join's row estimate to 25, and
against a 25-row outer the planner priced rescanning a statistics-less CTE below building
a hash — 81 M comparisons. The maps now `FULL JOIN` into ONE `kw_facts` row per keyword,
joined once (page/money 10,008 → 648 ms; page/`unclassified` 45,629 → 780 ms;
`levels=[unvalued]` 43,149 → 829 ms — the class pin was never the special case). Two more
settings ride on that function for measured reasons: `plan_cache_mode=force_custom_plan`
(its plan depends on its arguments, and plpgsql's generic plan cost 11 s from the 6th call
on a pooled connection) and `work_mem=32MB` (the largest site spilled its group-by to a
123 MB external merge). THE JOIN-SHAPE RULE in the SoR has every measurement;
[`migrations/seo_class_movers_one_facts_join.sql`](../../../migrations/seo_class_movers_one_facts_join.sql)
has the plan. If you write a `gsc_perf_*` read that joins a map per keyword, join it ONCE.

**The vocabularies are editable, and that is the point** (Arman, 2026-08-21: "the rules
can't live in the agent's head"). Two planes, two paths:
- **THE SETTINGS LADDER (KI-046, 2026-08-25)** — the score baseline and the
  level thresholds cascade **platform → organization → brand → site**; the
  nearest scope with an answer wins and a scope that says nothing is never
  overwritten from above. ONE editor
  (`features/marketing/seo/value-system/settings/ValueSettingsEditor.tsx`) is
  mounted at all four rungs — `/administration/knowledge/seo-value-settings`,
  `/organizations/[orgId]/settings/keyword-value`,
  `/marketing/brands/[brandId]/settings`, and the site's own
  `…/value/settings` (sub-view `value:settings`). ONE write path
  (`seo.set_value_settings`) carries the permission gate for every scope, and
  `p_clear` hands a setting back up the ladder — never copy a parent's number
  down, which looks identical and freezes the child forever.
  🚨 **This is platform doctrine for EVERY marketing setting, not just this
  one:** `../../../common-docs/policies/settings-ladder.md`. Read it before
  adding any configurable number, threshold or default anywhere in marketing.
- **Site bands** — `features/marketing/seo/value-system/vocabulary/BandVocabularyEditor.tsx`,
  opened from "How value is computed" on the workbench. Adopt-then-edit: the platform
  template is copied in on first save and the site owns its vocabulary after that.
  Renaming a band re-labels every keyword instantly (the screen shows the rename, it does
  not warn about it); moving a threshold shows, server-side, how many real keywords change
  band before you commit (`gsc_value_band_preview`); removing one asks where its rulings
  go. Coherence is enforced by ONE DB predicate (`gsc_assert_vocabulary_coherent`) — the
  client checks in `vocabulary/lib.ts` exist only to keep the preview honest, and the
  database is right when they disagree.
- **Platform places (the gazetteer, I3, 2026-08-22)** — `seo.geo_place`: the 50 states +
  DC, the 1,000 largest US cities by population, and the local-grammar phrases ("near me").
  A geo area now names PLACES (`site_geo_area.place_ids`, picked via `GeoPlacePicker` over
  `seo.geo_place_search`) rather than only words typed from memory; typed `match_tokens`
  stay for whatever the gazetteer lacks. A keyword reaches an area through its DETECTED
  places (`seo.keyword_place`, written by `seo.stamp_keyword_places`), and the derived fact
  `local_intent = explicit_local` is stamped through the existing `seo.keyword_facet_set`
  path — a place is never a facet value, because places are not a closed vocabulary. THE
  AMBIGUITY RULE and the precedence (human > gazetteer > classifier) are in the SoR under
  THE GAZETTEER. **Both halves of a geo match can be inert**: an area with nothing in it,
  and keywords never read for places — the second is what `PlaceDetectionStrip` (reading
  `seo.keyword_place_status`) exists to say out loud, with a bounded pass sized by the
  `seo.keyword_place_detection` knobs.
- **Platform facets** — `/administration/knowledge/seo-facets` (super-admin), over
  `platform.categories` dimensions `seo_facet` / `seo_value_band` / `seo_geo_band`.
  Labels and descriptions only; **adding a facet value requires widening
  `seo.keyword`'s matching CHECK in the same change** and the DB refuses until it lands.

**Governance messages are not PostgREST prose.** These RPCs raise sentences written for
the reader ("3 rulings are set to Bronze — choose where they move before removing it").
`data.ts`'s `assertGoverned` passes a raise carrying one of our governance codes through
verbatim and leaves everything else to `assertData`'s generic sentence. Do not route a new
vocabulary write through bare `assertData` — it swallows the rule.

## Classification UI — RETIRED 2026-08-25 (KI-036)

The dedicated `?view=classification` ("Teach classes") workspace described in
this section from 2026-08-08 through 2026-08-24 — its whole component tree
(`components/classification/`), the floating panel
(`windows/KeywordClassificationWindow.tsx`, overlay
`keywordClassificationWindow`), and every link that offered it — is DELETED.
The Keyword Workbench (`../seo/keyword-workbench/FEATURE.md`) reached parity
on assignment, so the fold completed and the three things the old view
uniquely owned found real homes:

- **Business guidelines editor** → its own door,
  `features/marketing/seo/value-system/guidelines/GuidelinesWorkbench.tsx`
  at `…/value/guidelines`. The editor itself
  (`KwGuidelinesPanel.tsx`) MOVED there unchanged — same write path
  (`setKwGuidelines` → `seo.gsc_set_site_kw_guidelines`).
- **Brand-alias panel** → folded into THE MATCHER EDITOR
  (`features/marketing/seo/value-system/dimensions/MatcherEditor.tsx`,
  `…/value/dimensions`): an alias is now added as a `brand_identity` matcher
  on the platform "Brand" value (`traffic_class:brand`), through the same
  `dimension_matcher_upsert` / `dimension_matcher_delete` RPCs every other
  matcher uses. `seo.gsc_matcher_reach_preview` was widened
  (`migrations/seo_ki036_matcher_reach_preview_brand_identity.sql`) to accept
  `brand_identity` as a text-pattern kind (contains semantics) so Preview
  reach works for a brand draft too.
- **Class-rule panel** → not moved; it retires with the Rulebook
  (`../seo/value-system/rules/MeaningRulesWorkbench.tsx`, `…/value/rules`)
  already covering the same job (KI-007/KI-035).

`?view=classification` and its legacy `?tab=classification` alias now land on
the Workbench (never a crash) via `SiteKeywordsView`'s legacy-link check.

**What did NOT get a new home, and is a genuine capability loss until someone
gives it one:** `FacetBackfillStrip` — the universal 13-facet coverage meter
(§ "Universal facets" below) — had no other surface reading
`seo.keyword_classification_status`. Rebuilt on the Keyword Dimensions screen
2026-08-24 (KI-022); this feature no longer reads it.

**Still live, unchanged by this retirement:** `seo.gsc_set_keyword_class` (the
one human write path for `traffic_class`, still called by
`keyword-research/components/SiteKeywordsWriteTargets.tsx` and
`value-system/suggestions/apply.ts`), `seo.gsc_keyword_class_review`,
`seo.keyword_class_rule` and its RPCs, `seo.gsc_class_import`,
`seo.keyword_classifier` (the AI classifier mandate) — none of these DB
objects were dropped (KI-035 owns that decision separately). Only the
FRONTEND surfaces that called the now-dead ones
(`getGscClassReview[All]`, `confirmGscKeywordClass`, `getGscBrandIdentity`,
`getGscBrandAliasPreview`, `setGscBrandAliases`, `importGscKeywordClasses`,
`classifyKeywordsWithAi`, `getFacetBackfillStatus`, `runFacetBackfillPass`)
were trimmed from `data-classification.ts` — they had zero remaining callers
once the workspace was gone.

## Universal facets — the coverage meter — REBUILT ELSEWHERE 2026-08-24 (KI-022)

`FacetBackfillStrip` lived inside the classification workspace this section
retired (KI-036) and had no other mount point, so it died with it. It is BACK,
with a real home and not in this feature: the KEYWORD DIMENSIONS screen
(`features/marketing/seo/value-system/coverage/FacetCoverage.tsx`, mounted by
`value-system/dimensions/DimensionManager.tsx` at `…/value/dimensions`). That
screen is where a site owner already reasons about whether their meaning
reaches their keywords, so the coverage of the shared 13-facet plane belongs at
the top of it rather than bolted to a Search Console surface. Nothing in
search-console reads `seo.keyword_classification_status` any more, by design.

The four rules it must never break — two planes never merged (a site's own
traffic classes are a different kind of truth from the platform-wide 13 facets),
server state not tab state, the headline is clicks not keywords, and the demand
floor is reported never silent — live in the rebuilt component's header and in
the cross-repo SoR below.

Cross-repo SoR: `../../../../common-docs/systems/marketing/seo/seo-keywords/value-system.md`.
Server half: `aidream/services/seo/keyword_classification_backfill.py`.

## KW business guidelines — the doctrine the AI classifies under (2026-08-21)

D35, ratified by Arman 2026-08-21: *"the agent wouldn't know CRT is a horrible
keyword unless there's some document that guides it and we keep these things up
to date."* ONE per-site prose document, versioned, read by every AI
classification and valuation run for that site.

- **Storage:** `web.site.settings.kw_guidelines`
  (`{text, version, updated_at, updated_by}`) — NOT a new table: one document
  per site, no lifecycle of its own, and the site row is already where durable
  per-site business truth lands. Migration:
  [`migrations/seo_kw_business_guidelines.sql`](../../../migrations/seo_kw_business_guidelines.sql).
- **Read:** `seo.gsc_site_kw_guidelines` (viewer-level — whoever can see the
  keywords can read the doctrine they were ruled under). **Write:**
  `seo.gsc_set_site_kw_guidelines` is THE one path, gated by the same
  `gsc_assert_site_editor` predicate as every other keyword-truth write. It
  merges the SINGLE key server-side and stamps `updated_at`/`updated_by` inside
  the payload, so a save can never clobber a concurrent `cms` / `content_plan` /
  `media_standards` settings write and provenance can never be faked by a
  client. Blank text CLEARS the document rather than storing an empty string.
- **Client:** `data-kw-guidelines.ts` (shared query key, so a save in one
  workbench refreshes the other). **Editor:**
  `features/marketing/seo/value-system/guidelines/KwGuidelinesPanel.tsx`,
  its own door at `…/value/guidelines`
  (`value-system/guidelines/GuidelinesWorkbench.tsx`) — moved here 2026-08-25
  (KI-036) from the retired classification workspace, unchanged. It always
  shows provenance (who/when/version) and calls out a document that has gone
  90 days without an edit. **Read-only surfacing:** the value workbench's "How
  value is computed" panel
  (`features/marketing/seo/value-system/workbench/MeaningPanel.tsx`), with a
  door back to the one place it is authored.
- **Server:** aidream `services/seo/kw_guidelines.py` is the ONE loader. The
  text reaches the agent as the NAMED variable `business_guidelines` — never
  appended to `user_input` (THE USER-INPUT LAW) — and the value is ALWAYS
  supplied (explicit no-doctrine sentinel when absent), because a code value
  the agent does not consume is silently dropped. `business_guidelines` is a
  bind-time `required_variables` entry on `seo.keyword_classifier`, so a rebind
  cannot drop the doctrine.
- **The line that keeps Law 1 intact:** for the UNIVERSAL classifier the
  document is TERMINOLOGY context only. That agent's own contract is "you are
  describing the searcher, never any business — two rival companies must be
  able to use your output unchanged", and the injected block says so: resolve
  what a trade-specific term means and who realistically types it; never change
  the verdict to suit the business, never judge worth. Worth belongs to the
  value plane. On the VALUATION side (`interview_site_strategy`) there is no
  such limit — the standing guidelines lead the business context, because what
  the expert wrote about who they serve is exactly what topic worth encodes.

## Brand identity — the settled model (KI-043, 2026-08-24)

**P29 ruling: `web.brand.profile->'brand_aliases'` is the PHYSICAL FACT
(the brand's names — domain, site name, brand name, custom aliases: DBAs,
officers, misspellings), authored on the brand via the site intake wizard.
The MEANING is the site-scoped `seo.dimension_value_matcher` row of kind
`brand_identity`, on the platform "Brand" value (`traffic_class:brand`,
id `78d0685d-6b2f-4859-8a7e-6719c914e21a`). Saving the fact mints the
meaning — the geo pattern (`seo.fn_geo_area_sync_meaning`), applied here.**

`brand_identity` is architecturally UNLIKE `geo`: `dvm_target_check` forces
`pattern`/`place_id`/`fact_value_id`/`condition_rule_id` all NULL for this
kind — there is no per-alias pattern row to mint. ONE dynamic matcher row
per site (`pattern` NULL) is the whole shape; `seo.fn_evaluate_matchers_internal`
special-cases `kind='brand_identity'` and re-derives hits from
`seo.gsc_brand_hits(site_id)` — which reads `gsc_brand_aliases(site_id)`
(domain + site name + brand name + `profile->'brand_aliases'`) **LIVE, every
evaluation pass**. So editing an alias already reaches every future match
with zero extra plumbing — the gap KI-043 found was purely EXISTENCE: 8 of
17 sites with a `brand_id` had no `brand_identity` matcher row at all
(created before/after the 2026-08-23 one-time migration, or never backfilled).

**The sync** (`migrations/seo_brand_identity_fact_to_meaning_sync.sql`):
`seo.fn_brand_identity_sync_meaning(site_id)` mints the site's ONE matcher
row if none exists, revives it if it was auto-retired (e.g. by a prior site
archive) and the site is active again, and retires it if the site is
archived — **never touching a row with `origin='human'`** (a human's decision
to keep/drop brand matching for a site is a standing ruling, not a stale
artifact). Two triggers call it: `web.site` (`AFTER INSERT OR UPDATE OF
brand_id, domain, name, deleted_at`) — a new/re-domained/re-branded/archived
site — and `web.brand` (`AFTER UPDATE OF profile, name`, guarded to fire only
when `brand_aliases` or `name` actually changed) — every site under that
brand gets checked. Backfill: **9/17 → 17/17** sites now carry the matcher.
Verified live on Data Destruction (2026-08-24): adding then removing a test
alias reached `gsc_brand_aliases`/`gsc_brand_hits` immediately with no matcher
change needed; a matcher manually set `origin='human'` + retired survived an
unrelated alias save on the same brand untouched.

**Two writers still exist side by side** (unchanged by KI-043, both read
live today — KI-036, 2026-08-25):
- **Legacy custom aliases** — `web.brand.profile->'brand_aliases'`, written
  by `gsc_set_brand_aliases` and consumed by `gsc_brand_aliases` (derive) →
  `gsc_brand_hits` (corpus scan) → `gsc_keyword_class_map` /
  `gsc_brand_identity` (the narrator: alias, origin, match counts, genericity
  demotion). The classification workspace's Brand panel that used to write
  this array is DELETED; existing aliases in it keep matching unchanged, and
  the intake wizard's accepted proposals still land here (server-side apply).
- **THE MATCHER EDITOR** (`value-system/dimensions/MatcherEditor.tsx`,
  `…/value/dimensions`) also lets a human add a `brand_identity` "matcher"
  with its own pattern text, through the same `dimension_matcher_upsert` RPC
  every other matcher uses (KI-036). **Known defect, not yet fixed:**
  `dvm_target_check` requires `pattern IS NULL` for `kind='brand_identity'`,
  so a UI-submitted brand_identity matcher that carries pattern text fails
  the CHECK constraint at insert — the editor's own doc comment ("an alias IS
  a `brand_identity` matcher... added, disabled and removed through the same
  two canonical functions as every other pattern") describes a write path the
  schema does not allow. Flagged for follow-up; out of scope for KI-043
  (which fixed the fact→meaning EXISTENCE gap, not this UI/schema mismatch).

Live legacy aliases: All Green + Titanium → "arman sadeghi"; IOPBM
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

| Export                                  | Use                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useGscClassRollup(siteId, range)`      | One site. Clamps the window to that site's freshest day, forces the prev-period compare `gsc_perf_class_summary` requires, zero-fills to canonical class order. |
| `shapeGscClassRollup(rows, periods)`    | Pure core of the above — unit-tested arithmetic.                                                                                                                |
| `GscClassBar`                           | The embeddable strip (`bar` \| `tiles`). Segments drill into `GscDrilldownWindow`; header links back here.                                                      |
| `useGscPortfolioRollup(siteIds, range)` | Many sites, via `seo.gsc_perf_class_summary_multi`.                                                                                                             |
| `GscPortfolioClassBar`                  | Brand/portfolio strip; states how many sites contributed.                                                                                                       |

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
  `GscDimensionTable` / `lib/drills.ts` / `GscDrilldownWindow`; never fork a
  per-tab table or a second panel body.
- **A score's WHY renders in exactly two shapes**, both from
  `features/marketing/seo/value-system/workbench/WhyScore.tsx`: a small (i)
  with a thin hover popover inside a table cell (`WhyScoreHint` — a
  paragraph in a cell is banned, P26), and the full receipt
  (`WhyScoreBody`) in the Why-this-score panel. Every step of the chain
  carries the door to the screen that changes it — the mapping lives ONCE in
  `value-system/reason-links.ts`. A new receipt step gains its editor there,
  never in a component.
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

**GOOGLE'S DAY IS PACIFIC.** Search Console buckets days in
`America/Los_Angeles` (with DST) and offers no UTC option, so every "how fresh
should this be?" question is asked in that calendar — never UTC's, never the
viewer's. Three places do the conversion and must agree: `gsc_today()` in
aidream (`packages/matrx-seo/matrx_seo/providers/gsc.py`, the ingestion side),
`v_gsc_timezone` in `seo.gsc_ingestion_health` (the verdict), and
[`lib/gsc-day.ts`](./lib/gsc-day.ts)'s `gscToday()` (every frontend freshness
read). Deriving the day from UTC overstates staleness by one for the 7-8 hours
between UTC and Pacific midnight. `GSC_DATA_LAG_DAYS` in
[`lib/url-state.ts`](./lib/url-state.ts) is deliberately NOT one of the three:
it sets a date-window edge that `resolvePeriods`' `dataEnd` clamp pins to real
data, and it never becomes a verdict about a site.

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

- 2026-08-24 — **KI-043: brand_aliases fact→meaning sync (the geo pattern,
  applied to brand identity).** `migrations/seo_brand_identity_fact_to_meaning_sync.sql`
  — `seo.fn_brand_identity_sync_meaning(site_id)` mints/revives/retires a
  site's ONE `brand_identity` matcher row, triggered off `web.site` (brand_id/
  domain/name/deleted_at) and `web.brand` (profile/name), never touching an
  `origin='human'` row. Backfill 9/17 → 17/17 sites with a `brand_id`.
  Verified live on Data Destruction (add/remove test alias, human-pin
  survival); see "Brand identity — the settled model" above. Found in the
  same pass, not fixed: the Matcher Editor's brand_identity pattern field
  writes a shape `dvm_target_check` rejects (pattern must be NULL for that
  kind) — flagged as a follow-up, not part of this fix.
- 2026-08-25 — **KI-036: the classification UI retired.** Deleted the whole
  `?view=classification` component tree (`components/classification/`, the
  floating panel + its overlay registration) and every link that offered it.
  The business-guidelines editor moved to its own door,
  `value-system/guidelines/` at `…/value/guidelines`; the brand-alias panel
  folded into the Matcher Editor as `brand_identity` matchers (with
  `gsc_matcher_reach_preview` widened to accept the kind); the class-rule
  panel retired with the Rulebook (`…/value/rules`). `data-classification.ts`
  trimmed to its one remaining live export (`setGscKeywordClass`) — no DB
  objects dropped. `FacetBackfillStrip` (universal facet coverage) lost its
  only mount point and has no replacement yet — flagged to KI-022.
- 2026-08-24 — Debounced the two controlled Search Console paths that did not
  use `useMarketingTableState`: `GscDimensionTable` waits 300 ms before its
  breakdown read, and the classification WindowPanel's local state waits 250
  ms. Inputs remain immediate; server reads no longer fire per character.
- 2026-08-24 — **Insights `class movers` 500 fixed — THE JOIN-SHAPE RULE.**
  `seo.gsc_perf_class_movers` on the page dimension with a class pin took
  10,008 ms past the 8 s statement timeout, so the assists producer logged
  `[gsc-assists] class movers read failed` on every Insights load. `EXPLAIN
  (ANALYZE, BUFFERS)` on the FULL body (its parts each measured under 400 ms
  and hid it): a nested loop removing **81,094,419** rows, because the function
  joined two map CTEs in sequence and the pin collapsed the first join's
  estimate to 25 rows. Fixed by `FULL JOIN`ing the class and value maps into
  ONE `kw_facts` row per keyword and joining it once — page/money
  10,008 → 648 ms, page/`unclassified` 45,629 → 780 ms, `levels=[unvalued]`
  43,149 → 829 ms, query/money 2,521 → 439 ms, and the unfiltered invariants
  held (page 864 → 786, query 658 → 601). All 15 measured cases byte-identical.
  Also `plan_cache_mode=force_custom_plan` (plpgsql's generic plan cost 11.1 s
  from the 6th call on a pooled connection) and `work_mem=32MB` (All Green's
  group-by spilled 123 MB; page/money 7,408 → 3,513 ms). Verified in the
  browser: Insights loads clean and Pages + Money movers render.
  `migrations/seo_class_movers_one_facts_join.sql`.

- 2026-08-23 — **C6 finish: panel drills, the actionable receipt, Insights by
  LEVEL** ([`migrations/seo_value_level_movers_and_topic_receipt.sql`](../../../migrations/seo_value_level_movers_and_topic_receipt.sql)).
  Right-click on any Search Console row now offers, per dimension, "See pages
  for this keyword" / "See queries for this page", "See this row's Search
  Console data" (`rowScopeDrillFor`) and — on keyword rows — "Why this score";
  each opens a WINDOW PANEL and leaves the host table's filters, sort and
  scroll exactly as they were. Panels became independently filterable
  (own period strip, own chips, own table). `seo.keyword_value_map`'s topic
  receipt gained `topic_id`, which is what lets a receipt step link to the
  topic tree AT that node; `seo.gsc_perf_class_movers` gained
  `p_filters.levels` + a `value_band` column (body now maintained in
  `seo_class_map_scope_fix.sql`), backing the by-LEVEL decomposition beside
  the class one in Traffic quality and its one-sentence headline ("clicks are
  flat overall — but Costs money to serve is up 33%"). Verified live on Data
  Destruction: two panels open side by side from different rows with the host
  table untouched, and each receipt step landing on its editor (topic tree at
  the node with its worth dialog open; the dimension screen ringing the
  stamped answer; the band vocabulary editor). Known gap: a matcher has RPCs
  but no editor SCREEN, so a matcher step links to the answer it stamps and
  says so rather than promising a screen that does not exist.
- 2026-08-23 — **C5: Dig Here saves its matches as a situational stamp**
  ([`migrations/seo_stamp_system_c5_condition_matchers.sql`](../../../migrations/seo_stamp_system_c5_condition_matchers.sql),
  `…_c5b_no_silent_cap.sql`, `…_c5c_compare_parity.sql`). A rule becomes ONE
  `condition` matcher on a situational dimension's value; the engine re-derives
  the stamps by running the rule through the identical `gsc_perf_dig` path over
  one window, with an `as_of`, releasing what stops matching and never touching
  a human pin. Also: the LEVEL pin beside the class pin, Class · Score · Level
  on dig rows through the now-shared `buildGscValueColumns`, and Re-evaluate on
  both the rule and the Dimensions screen. Verified live on DDI end to end
  (parked segment → 1,000 stamped → Queries filtered 4,471 → 1,000 → idempotent
  re-evaluate → test rows removed). Two defects the live pass caught and fixed:
  the rule's row limit silently truncated the segment (1,000 of 2,952 reported
  as the whole set), and always passing a compare window changed what a rule
  MEANS (1,563 → 2,952 matches). Nightly re-derivation is PROPOSED, not enabled.

- 2026-08-23 — **Google's day is Pacific, and the freshness check was reading
  UTC's** (health v5,
  [`migrations/seo_gsc_ingestion_health_v5.sql`](../../../migrations/seo_gsc_ingestion_health_v5.sql)
  + [`lib/gsc-day.ts`](./lib/gsc-day.ts)). `v_expected` and the portfolio's
  `daysBehind()` both derived "the day GSC data should have reached" from the
  UTC calendar. Search Console has no UTC option — it buckets days in
  `America/Los_Angeles` — so for the 7-8 hours after UTC midnight both named a
  day that had not started in California, and every site read one day staler
  than it was. At a 2-day threshold that one day moves the whole scale: a site
  one day behind, well inside Google's documented 2-3 day finalization lag,
  badged `critical` for a third of every day and then healed at 00:00 Pacific.
  Fixed on both sides with the SAME convention the ingestion side adopted first
  (aidream `gsc_today()`, commit 871385cf8) rather than a second one; the
  frontend's single home for it is `gscToday()`. Verified live: at
  2026-08-23 03:00Z the old expression yields 2026-08-21, the new one
  2026-08-20, and PST/PDT both come from the tz database, not a constant.
  **The 2-day tolerance itself is untouched and still open** — Google documents
  2-3 days, so a legitimately 3-days-behind site can still be flagged; that is
  a product call for Arman, not part of this timezone fix.

- 2026-08-23 — **A PAUSED schedule is not a FAILING schedule** (health v4,
  [`migrations/seo_gsc_ingestion_health_v4.sql`](../../../migrations/seo_gsc_ingestion_health_v4.sql)).
  The banner read *"The nightly Search Console job is failing (last run
  2026-08-20 09:15: no error recorded). No collection has been attempted for
  this site — data is 3 days behind."* Every clause misled. The dispatcher
  (`scheduler.sch_task` `a7c1e2d3-…300`) had been set `enabled=false` on
  2026-08-20 by a governance pass, so it was switched OFF, not failing — and a
  reader would go debug a Google integration when the repair is an approval and
  a row flip. v3 only ever read the last RUN, so a task that stopped being
  dispatched at all showed the corpse of its final run forever. **THE TRUE
  CURRENT STATUS LAW: "is this schedule even switched on?" is live state, and a
  status derived without it is a guess.** v4 reads the task row
  (`dispatcher_enabled` / `dispatcher_paused_at` / `dispatcher_paused_reason`,
  new columns) and leads with the switch when it is off — `warning` while the
  data is still current, `critical` once it goes stale, because a nightly job
  that is off IS the coming outage. The raw governance reason is machine-shaped
  and travels in `dispatcher_paused_reason` for the copy payload; the sentence a
  human reads says what is true and what happens next. `IngestionHealthBanner`
  titles it *"Nightly Search Console sync is switched off"* — the title must
  name the CAUSE or the reader chases the wrong fix.
  Also: "no collection has been attempted" was **false** (the pass collected this
  site at 09:15:47 before dying on the next one), so v4 reports this site's own
  run ledger, scoped to `trigger='scheduled'` — a manual "Sync now" is never
  credited to the schedule. And the bare phrase "no error recorded" is gone: an
  unexplained terminal status is named as the defect it is.
  Root cause of the reasonless failure was in aidream — the `scheduler.sch_run`
  lifecycle watchdog force-failed a healthy run on AGE ALONE (610s from
  `claimed_at`, against a 3-hour lease) and wrote `status` with no
  `finished_at`, no `error_message`, no audit stamp. Fixed in
  `aidream/db/watchdog_configs.py`; 111 of 171 erased rows repaired by
  [`migrations/repair_watchdog_erased_sch_run_failures.sql`](../../../migrations/repair_watchdog_erased_sch_run_failures.sql).
  See aidream `services/seo/FEATURE.md` change log for the full account.

- 2026-08-22 — **The geo gazetteer (I3).** Geo areas name real places instead of only
  typed words: `seo.geo_place` (51 states + 1,000 cities + 8 grammar phrases, each row
  carrying its own aliases and an ambiguity flag), `seo.keyword_place` for detections,
  deterministic detection stamping `local_intent` through the existing fact store, and a
  demand-ordered bounded backfill on the EXISTING classification ledger rather than a
  second one. Verified live on datadestruction.com: `explicit_local` 17 → 155 after 3,600
  keywords, and an area referencing four gazetteer places puts a `geo` reason on
  "hard drive shredding los angeles". The 7-argument `gsc_geo_area_preview` was replaced
  by its 8-argument successor and DROPPED — two overloads differing only by a defaulted
  argument make every PostgREST call ambiguous.

- 2026-08-21 — **Universal-facet backfill strip** (§ above): the classification
  workbench gained a server-state band for the 13-facet plane, reading
  `seo.keyword_classification_status()` and driving the durable backfill ledger
  through one bounded pass per press. Verified live on datadestruction.com —
  Search Console click coverage moved 13.9% → 52.2% off a single 40-keyword
  batch.
- 2026-08-21 — **KW business guidelines** (§ above): per-site prose document on
  `web.site.settings.kw_guidelines` behind one read + one write RPC, an editor
  panel in the classification workbench, read-only surfacing in the value
  workbench, and named-variable injection into the keyword classifier and the
  site-strategy interviewer. Verified end-to-end against datadestruction.com.
- 2026-08-11 — Classification layered search + complete table controls: kept
  the fast keyword search, added compact ordered AND rules with removable
  chips/reorder/clear, wired whole-word exclusions and numeric ranges through
  the live review RPC, enabled sort/filter for every visible data column, and
  added explicit Contains / Whole words semantics to primary keyword search,
  moved the narrow Class column directly after selection and before Keyword.
  Keyword names now open the canonical Keyword Intelligence window. Live SQL
  verification: ITAD minus what/how/meaning returned 230 matches with zero
  forbidden-word rows; clicks 10–100 returned 10 rows, all inside range.
- 2026-08-11 — Brand alias preview/inspection correctness: extracted the
  canonical normalized-alias match-strength primitive and kept the classifier,
  draft preview, and saved-alias table filter on that one definition. Draft
  previews now show only current-window keywords not already covered by the
  site's identity; re-entering a saved alias says Already covered and returns
  zero new matches. Clicking an alias's Matches count clears contradictory
  class/source/search filters, closes the side panel, and shows the exact
  effective matches (including token-subset/unspaced matches and genericity
  demotion) behind a visible, clearable alias-filter banner. Verified against
  IOPBM and the generic Data Destruction alias.
- 2026-08-11 — **"Classify with AI" never worked.** The `seo.keyword_classifier`
  mandate refused its pinned agent on every call (agent declared no structured
  `output_schema`, mandate contract requires the `results` key), aidream answered
  502, and Cloudflare replaced that response with a CORS-less error page — so the
  browser could only say _"AI classification failed — Failed to fetch"_. Fixed at
  three layers: the agent got a real output schema (verified live), aidream now
  sends app failures as 500 (`api/FEATURE.md`), and this client sends one
  server batch per request with a 90s header budget. Same repair applied to the
  Topic Assigner and Site Strategy Interviewer mandates, which were dead the same way.
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
  findings launch the `seo.page_analyzer` mandate pre-filled with the finding,
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
  batch over the universal classifier mandate, floating window panel
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
  the agent-mandate system for AI classification is written up in
  aidream/docs/handoffs/content-ir-slots.md.
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
