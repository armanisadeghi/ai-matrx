---
type: Feature
title: "The Keyword Table"
description: "The ONE keyword list in the product. Every surface that shows keywords renders this component, reads this query, and offers these columns — a surface chooses which columns it opens on, never whether they sort or filter."
tags: [seo, keywords, table, gsc, sorting, filtering, saved-views]
timestamp: 2026-08-24
---

# The Keyword Table

**Cross-repo SoR:** `common-docs/systems/marketing/seo/seo-keywords/keyword-system-decisions.md`
— **P26** (a table is the user's; ONE TABLE) and **P28** (one data access
system). **P23** (every picker takes new input), **P24** (the WHY rides the
stamp) and **P27** (the Back button is undo) all apply here too.

## Why this exists

Arman, 2026-08-24, on the topic tree's unplaced queue:

> *"Whoever made this table didn't bring over the full functionality of our
> table system. So now we have this thing where for this company, I'm staring at
> five thousand eight hundred and twenty three keywords, and the keywords aren't
> ordered in any special way. Clicks and impressions are no longer sortable and
> filterable. My normal dimensions that I can sort and filter by are gone… all
> they had to do is just use the canonical table… we've gotta also make it where
> the rule is anywhere the table appears. This is the bare bones table. The core
> data doesn't change. The things you can sort and filter by do not change. Now
> we can add and remove columns… they all need to be one single table at the
> core. One table, one data access system, but then you're basically just saving
> configurations for each page, and then the user gets to create their own
> configurations."*

The measured before-state: **26,458 keywords**, zero table headers, zero
sortable columns, zero filters — one screen away from the Keyword Workbench,
where the same keywords carried all of it.

## The shape of the rule

**A surface supplies a CONFIGURATION. It never supplies a table.**

| A surface MAY choose | A surface may NEVER choose |
|---|---|
| Which core columns it OPENS on (`defaultColumns`) | Whether a column sorts |
| A base filter that is what MAKES it that surface (`baseFilters`) | Whether a column filters |
| Its own bulk actions, row action, and one extra column | Where the rows come from |
| Whether the shared filter bar / range control show | What a column means |

And **both** configurations are real: the opening set is the developer's, the
arrangement the person builds on top of it is theirs — saved as a named view,
which is why it lives in the URL.

**Phone rows use one explicit card configuration.** `<KeywordTable>` supplies
`MatrxDataTable.mobileCards` below `sm`: keyword, Offering, editable Class,
Clicks, Impressions, CTR, class provenance (`Site value` / `Brand match` /
`AI intent` / `No signal`), Level/Why, selection, and the table's canonical row
actions. Tablet and desktop keep the one grid. Cards never open another query
or write path.

## The files

| File | What it owns |
|---|---|
| `KeywordTable.tsx` | The component. Controlled `MatrxDataTable`, the URL ↔ query-state translation, selection, and the two write panels (dimension assign, offering placement). |
| `useKeywordRows.ts` | **THE ONE QUERY** (P28). `seo.gsc_perf_breakdown` for the rows plus the four page-scoped reads that decorate them (value, offering, stamps, catalog) and the site's own band vocabulary. |
| `columns.tsx` | **THE ONE COLUMN SET** (P26). Keyword, Offering, Class, any dimension, Clicks, Impressions, CTR, Position, Score, Level. |
| `state.ts` | The URL dialect + the per-surface `prefix`, `visibleCoreColumns`, `liveSearchParams`, and the saved-view snapshot codec (`viewStateFor` / `stateFromViewState` / `viewStateMatches`). |
| `savedViews.ts` | **Saved views (KI-021).** The CRUD around `seo.keyword_saved_view` — `listSavedViews` / `saveView` / `deleteSavedView`, one row per (site, surface, name), state stored verbatim from `viewStateFor`. Any surface rendering `<KeywordTable>` can mount saved views by calling these with its own `surface` id; a surface UI (tabs, a picker, anything) is that surface's own chrome, never a second data layer. |
| `ColumnChooser.tsx` | Add AND remove core columns; add any dimension from the site's catalog. |

## Server vs browser — the honesty rule

`key`, `topic`, `clicks`, `impressions`, `ctr`, `position` sort **in the RPC**,
and their filters are RPC filters (`clicks_min/max`, `impressions_min/max`,
`position_min/max`, the topic subtree, the stamp pairs, `levels`). Score and the
dimension columns sort the page on screen — and the header line SAYS
`· sorted on this page only` when that is what is happening. A page of fifty
rows sorted in the browser is not a sorted list of 26,458 keywords; claiming
otherwise is the quiet lie this whole system exists to stop.

## The surfaces

| Surface | Opens on | Base filter | Prefix |
|---|---|---|---|
| Keyword Workbench (`/keywords?view=workbench`) | keyword, offering, class, clicks, impressions, score, level | — | *(none — it owns its route, and every saved view already stored uses this dialect)* |
| Not placed on the tree (`/value/offerings`) | keyword, offering, class, clicks, impressions, level | `topic: "none"` | `u_` |
| Proposals (`/value/offerings`) | keyword, offering, clicks, impressions, level + How sure | `placement: "proposed"` | `pq_` |

Two tables share `/value/offerings`, so each owns a URL namespace and Back undoes
exactly one step on the one you touched.

## Adding a surface

1. Declare a `KeywordTableSurface`. Do not add columns — pick from the core set.
2. If your surface needs a filter the shared query cannot express, **extend
   `seo.gsc_perf_breakdown`** with one filter key (that is what `placement`
   is) and add it to `GscFilters` + `FILTER_PARAMS`. Never open a second query.
3. Render `<KeywordTable>`. Use `selectionActions` / `rowActions` for your own
   verbs, and the `KeywordTableControls` handed to them for placement and
   assignment — never rebuild a panel.

Guard: `pnpm check:one-table-law`.

## Traps

- **Never read `useSearchParams()` from an event handler here.** With the React
  Compiler on, a memoized handler can close over an older value; merging into
  that stale copy produces the URL you already had, `router.push` no-ops, and
  the click silently does nothing. Both of this feature's launch defects were
  this. Use `liveSearchParams(params)`.
- **Never call a setState during another component's render.** `selectionActions`
  runs inside the table's render; use `onSelectedKeywordIdsChange` instead.
- Value bands are **site-authored** (`seo.site_vocabulary` — All Green calls its
  top band "Core revenue"). The Level filter's options are read, never listed.

## Change Log

- 2026-08-25 — The keyword queues now live at the customer-facing
  `/value/offerings` route. The retired `/value/topics` URL redirects with its
  table query state intact.

- 2026-08-25 — Phone rows now use the canonical table's `mobileCards` seam to
  expose the complete classification evidence and touch-sized assignment/copy
  actions without horizontal discovery. The shared loading state no longer
  presents `0 keywords` while the count query is pending.

- 2026-08-25 — **Dimension cells are dropdowns in every state.** The shared
  `StampCell` now renders `DimensionValuePicker` directly for assigned and
  empty Geo/Price/custom-dimension cells instead of hiding assignment behind a
  hover-only plus. Selection commits through the existing stamp write; the
  picker keeps custom-entry, Clear, and Assign-with-a-reason actions. Shared
  metric headers use `CLICK · IMPR · CTR · POS · SCORE · LEVEL`.

- 2026-08-25 — Claude: **the Offering column became a shared builder
  (MSR-06).** Search Console → Queries now carries the same column (Arman: "the
  other critical thing to put here would be the one where you map it to an
  offering"), so its definition moved out of `buildKeywordColumns` into an
  exported `buildKeywordOfferingColumn` that both tables call. P26 with a
  second consumer: one column, one set of filter options, one word for an
  unplaced keyword, one placement write. Behaviour here is unchanged except
  for two additions both surfaces now get — an EMPTY offering catalog renders
  the sentence plus the door to the topic tree instead of a dropdown with
  nothing in it, and the cell stops click propagation so picking an offering
  can never also open the row on a table whose row click drills elsewhere.

- 2026-08-25 — gsc-ideas: **KI-021 — saved views moved to the shared layer.**
  `state.ts` already carried the saved-view snapshot codec (`viewStateFor` /
  `stateFromViewState` / `viewStateMatches`) and `KeywordWorkbench.tsx` already
  used it; what still lived workbench-side was the CRUD itself
  (`listSavedViews` / `saveView` / `deleteSavedView` + the `SavedView` type,
  duplicated verbatim in `keyword-workbench/data.ts`). Moved that CRUD to
  `savedViews.ts` here (added an explicit `surface` parameter to
  `listSavedViews` / `saveView` so a second surface can adopt views under its
  own id without touching workbench rows) and deleted the workbench copy — one
  data layer, not two. `seo.keyword_saved_view` needed no migration: its
  `surface` column and the `p_surface` RPC args already generalize past the
  workbench, `'keyword_workbench'` was only ever the column DEFAULT. Also
  deleted `keyword-workbench/state.ts` and its only consumer
  `keyword-workbench/components/ColumnChooser.tsx` — dead since the grid (and
  its column chooser) moved to this folder 2026-08-24; nothing else imported
  either. Live-verified end to end on Data Destruction
  (`38eff4c9-b021-451a-b995-7d9b3d17db5e`): saved "Money keywords" (Class =
  Money, sorted by Score desc), reloaded the page, reopened the tab, confirmed
  the exact filter + sort + column arrangement restored; renamed it; deleted
  it. See `keyword-workbench/FEATURE.md` Change Log for the full walkthrough.

- 2026-08-24 — Claude: **the Location column (C10).** Multi-location attribution
  was built and starved — the ladder worked, but the answer lived only on the
  rules-bench panel, so the ONE keyword table could not say which branch a
  local search belongs to and nothing could filter by it. Added:
  `location` in the SHARED `GscFilters` dialect (`lo=`), resolved SERVER side in
  `seo.gsc_perf_breakdown` through the existing `gsc_keyword_locations` ladder
  (no bespoke filter, no sixth RPC); the `Location` column + `LocationCell`,
  which renders THREE states rather than one dash — placed on a branch, *local
  but unplaced* (the unrouted-revenue work list), and *not location-specific* —
  with the attribution REASON in its tooltip; `p_include_unplaced` on
  `gsc_keyword_locations` so the table can tell the last two apart (existing
  callers byte-identical; the two-arg overload dropped, not twinned).
  Live-verified on **All Green Recycling** (45,385 keywords, 90-day window):
  the filter partitions exactly — San Diego 95 + Los Angeles 75 + unresolved
  1,632 + not-local 43,583 = 45,385. Measured gap:
  keyword-intelligence-convergence ADOPTION-SWEEP.md #15.

- **2026-08-24** — Built, by extracting the Keyword Workbench's grid rather
  than copying it, and rebuilding the topic tree's unplaced and proposals
  queues on it. Added the `placement` filter key to `gsc_perf_breakdown` so the
  proposals queue is a configuration and not a second RPC; deleted the two
  replaced data wrappers. Gained on the way: real server-side range filters on
  Clicks / Impressions / Position (they had `filter: false` everywhere), a
  server-side Level filter, and a Columns chooser that removes as well as adds.
  Live-verified against SQL on **All Green Recycling** (26,458 unplaced
  keywords: sort by clicks desc → *are address labels recyclable* / *e waste
  alhambra* / *electronics recycling torrance*, matching the RPC's tiebreak
  exactly; sort by impressions desc → *it recycling* 1,859; Class = Money →
  26,458 → 97, confirmed by SQL; add Position, remove Class; Back undid one
  step each time; saved a view and reopened it) and on **Data Destruction**
  (4,173 unplaced, top three matching SQL).
