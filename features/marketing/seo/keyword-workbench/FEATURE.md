---
type: Feature
title: "Keyword Workbench"
description: "The one surface where a subject-matter expert finds exactly the keywords they mean and tells the system what those keywords ARE — with the reason, in their own words, at the moment they decide."
tags: [seo, keywords, stamps, assignment, gsc, topics, services]
timestamp: 2026-08-24
---

# Keyword Workbench (C14)

**Route:** `/marketing/brands/[brandId]/sites/[siteId]/keywords?view=workbench`
(sibling sub-views on the same route: `performance`, `classification` — the
latter folds into this one at parity, C18).

**Cross-repo SoR:** `common-docs/systems/marketing/seo/seo-keywords/value-system.md`
§ THE KEYWORD WORKBENCH · principles **P23–P26** in `keyword-system-decisions.md`
· Arman's words in `VISION.md` § "Assignment, tables, and panels" · the campaign
plan in `common-docs/projects/keyword-intelligence-convergence/PLAN.md` (C13/C14).

## The four laws this surface exists to satisfy

| | Law | How it shows up here |
|---|---|---|
| **P23** | Every picker takes new input | The value picker's footer offers `Create "what you typed"`, and naming a dimension that does not exist creates it with its first value. A platform vocabulary refuses with a sentence and a door, never a grey-out. |
| **P24** | The WHY is captured at the moment of assignment | One reason box on every assignment, single or bulk, stored ON the stamp. It is the training material an AI later learns the pattern from. |
| **P25** | Never lose the view | "See pages for this keyword" and "Why this score" open as floating panels beside the table you built. |
| **P26** | The table is the user's | Any dimension can be a column; every column sorts and filters; the arrangement saves as a named tab; and the why is an (i), never a novel in a cell. |

Plus one negative requirement that shapes the layout more than any of them:
*"the current page is far too busy at the top with things that add no value…
I don't like pages where there are novels written."* The top is ONE line of
context plus the controls. Everything else is table.

## THE SERVICE COLUMN (2026-08-24)

Arman: *"What I've lost is my ability to set the service or product or main
thing that this relates to. That's gone."* And: *"when I look at all green
electronics recycling, the first thing I wanna know is what service they map
to… I wanna know what maps to e-waste recycling, what maps to ITAD, and what
maps to data destruction."*

**Service** is the second column, right after the keyword — the order a person
reads: the phrase, what it is FOR, how we classify it, the dimensions, the
numbers. It is the keyword's PRIMARY TOPIC: the name, with its root under it
("Data Destruction Services" / "IT Asset Disposition (ITAD)"), an `AI` badge
when a machine placed it, and **"Not placed yet"** — never a blank — when
nobody has.

The topic tree is the ONE declared hierarchical exception in the stamp model
(**P19**), so this column reads and writes `seo.keyword_topic` rather than a
dimension+value pair. Everything else about it is the same contract as a stamp:

| Gesture | How |
|---|---|
| Place one keyword | The cell IS the control (same doctrine as Class) — click, pick, done. No dialog. |
| Invent a service | The picker's `Create "…"` plus ONE extra choice: its own root, or under an existing topic (**P23**). Creating and placing is one gesture. |
| Place the checked rows | **Service…** in the selection bar → `ServiceAssignPanel`, with the reason box. |
| Place everything matching | **Service for all N** in the toolbar. Honest when the server caps the sweep — the same sentence the stamp panel uses, from the shared `AssignTargetHeadline`. |
| Say WHY (**P24**) | One reason per placement, stored ON the placement (`seo.keyword_topic.notes`). |
| Find everything under a service | The **Service** filter (its own control beside the filter bar), the hover Filter icon in any cell, or the column's own filter. All three write ONE server filter. |
| Sort by service | Server-side (`p_sort = 'topic'`). A paged table sorted in the browser would sort 50 of 4,471 rows and say nothing about it. |

Two deliberate choices worth knowing:

- **A service filter means the service AND its whole subtree.** Filtering
  "ITAD" answers "what maps to this branch", which is the question. `none`
  selects the unplaced — that is the work queue.
- **The filter's control lives here, not in the shared `FilterBar`.** The URL
  dialect (`tp=`) is shared so a pasted link means the same thing everywhere,
  but only this surface holds the topic catalog, and a chip reading
  `tp: 47a36caa-…` is not a filter a person can understand (**P22** — shared
  machinery never obligates a shared UI).

## What it is made of

| File | Job |
|---|---|
| `components/KeywordWorkbench.tsx` | The surface: thin top, filters, table, selection, assignment, context menu. |
| `components/AssignPanel.tsx` | One dimension+value+reason panel serving all three gestures (a row, the checked rows, everything matching). |
| `components/DimensionValuePicker.tsx` | The two-step dimension→value **composition** over the canonical `CreatablePicker`. |
| `components/ColumnChooser.tsx` | Every dimension this site sees, offered as a column (P26). |
| `components/SavedViewTabs.tsx` | Saved views as tabs — rename, share, reorder, delete, and "keep these changes". |
| `components/cells.tsx` | The Class dropdown that ASSIGNS (with P11's door in it), and the stamp cell that assigns and filters. |
| `components/ServiceCell.tsx` | THE SERVICE COLUMN's cell — the name, its root, who placed it, and the picker behind it. |
| `components/ServicePicker.tsx` | The tree-shaped, creatable service picker shared by the cell, the bulk panel, and the filter. |
| `components/ServiceAssignPanel.tsx` | Bulk placement + the reason, over the ONE placement write. |
| `components/ServiceFilterControl.tsx` | The Service filter chip and picker (the shared bar cannot name a topic). |
| `hooks/useSiteServices.ts` | The site's topic tree, flattened parent → child for a picker. Shares the topic screen's query keys. |
| `state.ts` | The URL state. A saved view IS this state, stored verbatim. |
| `data.ts` | The RPC callers. **No write path of its own** — see below. |

## Reuse — what this feature deliberately does NOT own

- **Turning typed text into a value** → `value-system/quick-add.ts`
  (`quickAddDimensionValue`). One creation path for the whole keyword system.
- **The picker shape** → `components/ui/creatable-picker.tsx`.
- **The receipt and its doors** → `value-system/workbench/WhyScore.tsx`
  (`WhyScoreHint`) + `value-system/reason-links.ts` + the
  `gscWhyScoreWindow` opener.
- **The filter chips** → `search-console/components/FilterBar.tsx` and the
  `search-console` URL dialect (`parseGscFilters` / `applyGscFilters`), so a
  link means the same thing on the dashboard and here.
- **Class / Score / Level** → `seo.gsc_keyword_value_for` via
  `getGscKeywordValueFor`.
- **The topic tree itself** → `value-system/topics/` — its reads
  (`listAllTopics`, `listTopicWorth`, `getTopicStats`), its tree math
  (`buildTopicTree`, `flattenTree`, `lineageOf`), its create
  (`saveTopic` → `gsc_topic_save`) and its root vocabulary (`ROOT_TYPE_META`).
  This feature owns no second topic catalog, no second tree walk, and no
  second way to invent a service.
- **The trigger's compact display** → `CreatablePicker`'s `renderSelected`
  (added 2026-08-24). A dense cell shows one line; the option row it came from
  is indented and annotated. Same selection, two jobs, one component.
- **The table** → `MatrxDataTable` (controlled mode + its selection primitive).
- **The date window** → `search-console/components/RangeCompareControl.tsx`,
  which already owns custom ranges and compare. The hand-rolled preset list
  that replaced it for a day silently refused a custom window — the same P23
  failure in a control nobody thinks of as a picker.

The ONE human write for a stamp is `seo.gsc_set_keyword_stamps` — single row,
right-click quick-assign, and a bulk of thousands all land there. The ONE human
write for a PLACEMENT is `seo.gsc_set_keyword_topic`, the same way.

> **Known duplication, deliberate and dated.** The topic tree screen has its
> own thinner wrapper over that same RPC
> (`value-system/topics/data.ts` → `setKeywordPrimaryTopic`, no reason field).
> Two client wrappers, ONE write path; collapse them into
> `keyword-workbench/data.ts` → `setKeywordService` when that file is next
> touched.

## Server contract

| RPC | Job |
|---|---|
| `seo.gsc_perf_breakdown` | The rows. C14 added `query_word` (whole-word) + `clicks_min/max`, `impressions_min/max`, `position_min/max`. |
| `seo.gsc_breakdown_keyword_ids` | **Select all matching** — every keyword the filters produce, in ONE scan, capped at 5,000 and **honest when it caps**. |
| `seo.gsc_keyword_stamps_for` | The dynamic-column data. THE SCOPE RULE: ≤2,000 ids, so ask for the page you render. |
| `seo.gsc_keyword_value_for` | Class · Score · Level · reasons for the rows on screen. |
| `seo.gsc_quick_add_value` | P23 (via `quickAddDimensionValue`). |
| `seo.gsc_set_keyword_stamps` | P24. Human stamps are pinned. |
| `seo.gsc_saved_views` / `gsc_save_view` / `gsc_delete_saved_view` | Saved views (site-editor guarded). |
| `seo.gsc_keyword_topics_for` | THE SERVICE COLUMN's data — name, root, lineage, who placed it, which ancestor its worth comes from. THE SCOPE RULE: ≤2,000 ids. |
| `seo.gsc_topic_keyword_set` | Every keyword placed anywhere in a topic's subtree — what the service filter means. |
| `seo.gsc_set_keyword_topic` | THE placement write, now carrying `p_notes` (P24). Answers with the band each keyword lands in AFTER the change, from the resolver. |

Migrations: `migrations/seo_keyword_workbench_c14.sql` (builds on C13's
`seo_stamp_assignment_layer.sql`) and
`migrations/seo_keyword_workbench_service_column.sql` (the Service column:
`keyword_topic.notes`, the two reads above, `p_notes`, and the `topic` filter
key + `p_sort = 'topic'` on `gsc_perf_breakdown` /
`gsc_breakdown_keyword_ids`).

## Traps this surface already fell into

- **A context menu trigger renders `asChild`.** Handing it a component that
  does not forward props drops the right-click handler silently, with no
  error. Wrap the table in a real DOM element.
- **A site dimension's slug carries a `site_<8 hex>_` prefix.** It is plumbing.
  Never render it — not even for the second the catalog is still loading.
- **A selection belongs to the result set it was made in.** Changing filters,
  window, or saved view resets it; carrying it across invites a bulk write onto
  keywords the person can no longer see.
- **Never imply totality.** When the id sweep caps, the panel says how many it
  took and that there are more.
- **Controlled search has two clocks.** The input draft updates immediately;
  the URL and server query update after a 300 ms pause. Sending every character
  through `router.push` made large sites interrupt typing and filled the
  browser history. The Keyword header filter and toolbar search now share this
  one draft/query path.
- **P11 is a door, never a grey-out.** Class is platform-shared; the dropdown
  says so and offers "make it your own dimension" rather than a list with no
  way out. `pnpm check:picker-add` catches the omission.

## Traps the SERVICE column added to the list

- **An added DEFAULT parameter creates a SECOND function.** `gsc_set_keyword_topic`
  had to be dropped and recreated to take `p_notes`; leaving both overloads
  live hands PostgREST an ambiguous call. Callers passing three named
  arguments keep working.
- **A `topic` filter with no group is not group-neutral.** `FilterBar` derives
  the active dimension profile from which keys are set; a key it did not know
  made `activeGroup` answer "appearance" and the whole Add-filter menu
  vanished. The key is declared in the query/page group and skipped for
  rendering — `SKIPPED_KEYS`, not omission.
- **Three pieces of text on one dense line truncate all three.** The first cut
  of the cell read "Data Dest… IT Asset Di… AI". The name gets the width; the
  root sits under it in the size of a footnote.

## Change log

- **2026-08-24** — Made controlled keyword search usable on large sites: text
  stays immediate in both the toolbar and Keyword column filter, while URL and
  RPC work is debounced into one replace; widened Service from 210 px to 300 px
  so the service and its root remain readable. Audited every controlled
  `MatrxDataTable` consumer and repaired the three other remote-search paths
  that bypassed their canonical debounced state owner (GSC dimensions,
  classification window, outreach-list members).
- **2026-08-24** — **THE SERVICE COLUMN** (Arman's "that's gone"). Service is a
  first-class column next to the keyword; the cell places, the picker invents,
  bulk places the checked rows and everything-matching with a reason, and the
  column filters AND sorts server-side. Live-verified on Data Destruction
  (4,471 keywords): sorted by service on the server; filtered to one service
  subtree and to "Not placed yet"; a single placement and a bulk placement with
  a reason confirmed in `seo.keyword_topic` (`assigned_by='human'`, notes
  stored) and the receipt's band re-resolved; test placements removed.
  ⚠️ All Green Recycling could NOT be verified in the UI: its site
  (`d0aff5b6-…`, org `5dc930e9-…`) refuses `gsc_assert_site_access` for
  `admin@admin.com`, a pre-existing access gap unrelated to this work.
- **2026-08-23** — Built (C14). Live-verified on Data Destruction: whole-word
  filter 4,471 → 90; a new dimension + value invented by typing, bulk-assigned
  to 7 keywords with a reason, confirmed in `seo.keyword_facet` with
  `source='human'`, `pinned=true` and the notes; saved view created, restored
  and deleted; pages panel and receipt panel opened beside the table. Test rows
  removed.
