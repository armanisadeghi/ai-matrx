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

## The files

| File | What it owns |
|---|---|
| `KeywordTable.tsx` | The component. Controlled `MatrxDataTable`, the URL ↔ query-state translation, selection, and the two write panels (dimension assign, service placement). |
| `useKeywordRows.ts` | **THE ONE QUERY** (P28). `seo.gsc_perf_breakdown` for the rows plus the four page-scoped reads that decorate them (value, service, stamps, catalog) and the site's own band vocabulary. |
| `columns.tsx` | **THE ONE COLUMN SET** (P26). Keyword, Service, Class, any dimension, Clicks, Impressions, CTR, Position, Score, Level. |
| `state.ts` | The URL dialect + the per-surface `prefix`, `visibleCoreColumns`, and `liveSearchParams`. |
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
| Keyword Workbench (`/keywords?view=workbench`) | keyword, service, class, clicks, impressions, score, level | — | *(none — it owns its route, and every saved view already stored uses this dialect)* |
| Not placed on the tree (`/value/topics`) | keyword, service, class, clicks, impressions, level | `topic: "none"` | `u_` |
| Proposals (`/value/topics`) | keyword, service, clicks, impressions, level + How sure | `placement: "proposed"` | `pq_` |

Two tables share `/value/topics`, so each owns a URL namespace and Back undoes
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
