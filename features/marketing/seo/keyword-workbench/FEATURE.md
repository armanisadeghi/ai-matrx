---
type: Feature
title: "Keyword Workbench"
description: "The one surface where a subject-matter expert finds exactly the keywords they mean and tells the system what those keywords ARE — with the reason, in their own words, at the moment they decide."
tags: [seo, keywords, stamps, assignment, gsc]
timestamp: 2026-08-23
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

## What it is made of

| File | Job |
|---|---|
| `components/KeywordWorkbench.tsx` | The surface: thin top, filters, table, selection, assignment, context menu. |
| `components/AssignPanel.tsx` | One dimension+value+reason panel serving all three gestures (a row, the checked rows, everything matching). |
| `components/DimensionValuePicker.tsx` | The two-step dimension→value **composition** over the canonical `CreatablePicker`. |
| `components/ColumnChooser.tsx` | Every dimension this site sees, offered as a column (P26). |
| `components/SavedViewTabs.tsx` | Saved views as tabs — rename, share, reorder, delete, and "keep these changes". |
| `components/cells.tsx` | The Class dropdown that ASSIGNS (with P11's door in it), and the stamp cell that assigns and filters. |
| `state.ts` | The URL state. A saved view IS this state, stored verbatim. |
| `data.ts` | The RPC callers. **No write path of its own** — see below. |

## Reuse — what this feature deliberately does NOT own

- **Turning typed text into a value** → `value-system/quick-add.ts`
  (`quickAddDimensionValue`). One creation path for the whole keyword system.
- **The picker shape** → `value-system/pickers/CreatablePicker.tsx`.
- **The receipt and its doors** → `value-system/workbench/WhyScore.tsx`
  (`WhyScoreHint`) + `value-system/reason-links.ts` + the
  `gscWhyScoreWindow` opener.
- **The filter chips** → `search-console/components/FilterBar.tsx` and the
  `search-console` URL dialect (`parseGscFilters` / `applyGscFilters`), so a
  link means the same thing on the dashboard and here.
- **Class / Score / Level** → `seo.gsc_keyword_value_for` via
  `getGscKeywordValueFor`.
- **The table** → `MatrxDataTable` (controlled mode + its selection primitive).
- **The date window** → `search-console/components/RangeCompareControl.tsx`,
  which already owns custom ranges and compare. The hand-rolled preset list
  that replaced it for a day silently refused a custom window — the same P23
  failure in a control nobody thinks of as a picker.

The ONE human write for a stamp is `seo.gsc_set_keyword_stamps` — single row,
right-click quick-assign, and a bulk of thousands all land there.

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

Migration: `migrations/seo_keyword_workbench_c14.sql` (builds on C13's
`seo_stamp_assignment_layer.sql`).

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
- **P11 is a door, never a grey-out.** Class is platform-shared; the dropdown
  says so and offers "make it your own dimension" rather than a list with no
  way out. `pnpm check:picker-add` catches the omission.

## Change log

- **2026-08-23** — Built (C14). Live-verified on Data Destruction: whole-word
  filter 4,471 → 90; a new dimension + value invented by typing, bulk-assigned
  to 7 keywords with a reason, confirmed in `seo.keyword_facet` with
  `source='human'`, `pinned=true` and the notes; saved view created, restored
  and deleted; pages panel and receipt panel opened beside the table. Test rows
  removed.
