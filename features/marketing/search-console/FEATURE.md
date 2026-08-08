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
- **Read layer:** four `SECURITY INVOKER` RPCs applied live and recorded in
  [`migrations/seo_gsc_perf_rpcs.sql`](../../../migrations/seo_gsc_perf_rpcs.sql):
  `seo.gsc_perf_summary` / `gsc_perf_timeseries` / `gsc_perf_breakdown` /
  `gsc_perf_freshness`. **THE ACCURACY CONTRACT lives in that migration's
  header — read it before touching any of this feature's numbers**:
  narrowest-profile resolution (property = truth for totals; bare
  query/page profiles avoid `query_page` sampling loss), CTR =
  Σclicks/Σimpressions, position weighted only over rows WITH a position,
  wildcard-escaped ILIKE filters, and WINNING-RUN dedup (dedup_key is
  RUN-scoped and Google restates days — per (profile, date) only the newest
  run's rows aggregate, chosen before user filters apply).
- Reads go browser → Supabase directly (`data.ts`); the ONE compute call is
  the sync trigger (`sync.ts` → aidream, streamed, health-gated by the
  site's GSC binding). The legacy `web.gsc_page_stat` pipeline is untouched
  and still feeds the sites portfolio / page cards (retirement handoff:
  `docs/handoffs/gsc-page-stat-retirement.md`).

## Surface map

- `app/(core)/marketing/search-console/page.tsx` → `SearchConsoleGate`
  (the route's ONE `next/dynamic({ssr:false})` edge; recharts and all
  sub-components import statically inside — Fragmentation Law).
- `components/SearchConsoleWorkspace.tsx` — composition root. No `?site` →
  `SearchConsolePortfolio` (cross-site KPI cards over `listSites`);
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
  — the header therefore always prints the RESOLVED window beside "data
  through", because otherwise a clamped range change looks like nothing
  happened. The KPI band takes `isFetching` (not just `isLoading`): with
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
  user site valuation (`seo.site_keyword_value` — suppression /
  not_offered / actively_avoided / negative_value → `mismatch`;
  content_role → `money`/`educational`) beats **BRAND MATCH**
  (`class_source='brand_match'`, 2026-08-07: deterministic zero-AI token
  matching of the query against the site's identity — domain minus TLD +
  `web.site.name` + `web.brand.name`, never a hand-written per-site list;
  branded traffic "is not real SEO" and is pulled out even when intent
  says transactional, so brand sits ABOVE intent_class and BELOW the
  user's explicit valuation — the rescue hatch when a brand name collides
  with a service term. A **genericity guard** demotes an alias whose
  spaced/token form matches >250 corpus keywords to literal-unspaced
  matching only — datadestruction.com's "data destruction" IS its money
  vocabulary; the threshold + match rules live ONLY in the migration's
  header) beats universal
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
