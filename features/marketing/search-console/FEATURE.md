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
  Preset windows CLAMP to the site's freshest data day (`gsc_perf_freshness`)
  so a lagging sync never fakes a traffic collapse; `yoy` compare shifts
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

## The three method tabs (v2, 2026-08-04)

- **Dig Here** (`components/dig/`) — the low-hanging-fruit rules engine.
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

## Change Log

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
