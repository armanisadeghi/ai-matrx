# FEATURE.md — `drill-explorer` (one explorer screen for every declared drill definition)

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/data/drill-down/STATE.md — read it before touching this feature in ANY repo.

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-30`

---

## Purpose

THE screen that explores one drill definition: a headline total with its window and freshness, the drill
trail, the window, the Measures, Group by, the grouped answer, the records behind a number, built-in and
personal Saved views, and findings. Every number is one question of the definition asked through the one
read door (`platform.drill_describe` / `drill_ask` / `drill_rows`, `@ai-matrx/records`) in the host's
lane; the question lives in the address, so every drill is one Back step and every answer is a link.
Usage, CX usage, KG cost and workflow runs are mounts of this screen — never a second explorer.

**Which primitive:** a whole page answering a declared definition → this. A grouped answer inside a table
someone is already on (the records grid's drill) → `@ai-matrx/records-ui` `useDrill` + the design
system's `MatrxDrillAnswerTable`, which this screen also renders.

---

## Entry points

- `DrillExplorer.tsx` — `DrillExplorer` props (`types.ts` `DrillExplorerProps`): `source`
  (`{ kind: "entity", token }` or a Table), `lane` (`mine` | `organization` | `platform`),
  `organizationId` (whose calendar cuts periods — the platform organization in admin), `title`,
  `rootLabel`, `firstQuestion?` (default: the definition's own default), `names?` (per-Dimension
  `DrillNameResolver` for id-valued Dimensions), `headline?` (`{ measure, also? }`), `freshness?`
  (a host-kept count + Recount, until the door says `as_of`), `recordsLink?` (where records live when
  the definition declares none), `rowNoun?`, `openRecord?` (a record's door: its id column opens by
  `href` or `open` — a window on the admin seat), `reconcile?` (the headline against another
  definition's Measure, same window + filters — `useDrillReconcile.ts`), `location?` (where a copied
  group came from), `headerExtras?`, `dataAttributes?`.
- `useDrillExplorer.ts` — the data hook: describe once, `drillRequests(question)` + the whole (no
  trail) for the coverage sentence, names through the resolvers, `as_of` from the answers. Answers
  belong to ONE question: while a new window/trail is counted the screen shows its loading state,
  never the previous question's numbers.
- `DrillSavedViews.tsx` + `savedViews.ts` — built-in views (describe `views`, listed first, read-only,
  "Save a copy") and personal views (`platform.saved_view`, surface `drill/<definition key>`,
  `saved_view_save` / `saved_view_archive`).
- `DrillFindings.tsx` — describe `findings`, each answered through `drill_ask` in the explorer's window;
  nothing found reads "none"; a row drills. A control in the toolbar row, rendered only when declared.
- `DrillRecords.tsx` — "See these records" through `drill_rows` when describe declares `records`.
- `DrillExplainButton.tsx` + `explainPayload.ts` — **Explain this** (header row, present only while a
  grouped answer is on screen): the question (trail by name, grouping, window with its moments, Measures
  with units, comparison, sort, any carried `conditions`) and the answer exactly as the table draws it
  (`buildDrillTree`: same order, same words, printed value + raw number, change vs the prior window,
  every "Other" rest, total, coverage, counted-through, the door's sentences, the address) as ONE `json`
  Payload + AI envelope (`kind: "drill-answer"`) handed to `openAlchemySession` (intent `prepare`,
  `forDestination`). The person picks the destination (new chat / assistant / tools), the agent and the
  question in Alchemy; nothing is sent from here, no agent or prompt is chosen in code, and the answer
  rides as an attached resource — never `user_input`. No content_ir kind fits (searched 2026-09-30:
  `aggregate_result` lacks question/window/trail/Other), so the Alchemy structured form is used.
- `grain.ts` — the grain a window reads best at (a time group asked with no grain): the knobs
  `drill.auto_grain.{hour,day,week}_max_days`; while unread, the package's `drillAutoGrain` (said on screen);
  clamped to the grains the Dimension offers.
- `useDrillKnobs.ts` — every line the screen draws by, read once per minute: `drill.chart.top_n` (chart
  series), `drill.pareto.share_pct` (the Pareto line), `drill.pivot_columns` (pivot cap), the three
  auto-grain lines, and (`useDrillStaleAfter`) the definition's `stale_after_knob`. A knob that cannot be
  read is a "Defaults" chip naming it in its tooltip; the package's line is used.
- `drillKnob.ts` — THE one way the explorer reads a drill setting: `platform.drill_knob`'s address rule
  (feature = all but the last segment) and the effective value from the knob snapshot
  (`lib/scoped-config/effectiveKnobs.ts`); the platform lane reads with no organization. No file here
  may import `lib/knobs/featureKnobs.ts` (guarded by `drill-live-fixes.test.tsx`).
- `explorerWords.ts` — small labels from data: a records noun from the grain, moments in the door's
  calendar, short ids, a finding's true count past the cap, "148 requests" / "Cost 3,578 points".
- `DrillExplorerNotes.tsx` — the answer's note row as chips with tooltips (grain, reconciliation, open
  view, Behind, Defaults, Recount failed) and the door's own sentences behind "Notes (n)".
- `useDrillChart.ts` — the chart's two rounds through the door (`drillChartQuestions` → series +
  periods, then `drillChartCellsQuestion` → cells), same lane / window / open view as the table.
  `MatrxDrillChart` (subpath `@ai-matrx/design-system/data-table/drill-chart`) draws above the answer:
  split = the first non-time grouping, bars at the auto grain, a segment click drills, a period click narrows.
- `useDrillReconcile.ts` — decisions 12/29: the headline's total vs another definition's Measure for the
  same window and the filters both read the same way (`shared`); a crumb it cannot carry is said; the
  sentence is built from the two measured numbers (`drillReconcileSentence`).
- `measureFormat.ts` — every unit the contract carries, formatted ONE way (`usd` through the one
  credits/$ switch, `tokens`, `count`, `characters`, `ms` → human durations, `share` → %, `percent`,
  `times` → ×). Every value is rounded on its own: a value reads the same wherever it appears (owner
  ruling 2026-09-30, which replaced the rows-add-up-to-the-rounded-total apportioning).
- `dimensionWords.ts` — a group reads as the definition's declared `choices` / `empty_label` and the
  door's relation `labels` (merged by the hook before any host resolver); a code no definition names
  reads in plain words. A person's name is the one thing still read through a host resolver (the
  platform's names door).
- `types.ts` — the explorer's types; the contract additions (`views`, `findings`, `records`, `having`)
  are `@ai-matrx/records`' own types (0.58.109+), still read defensively from describe's JSON.
- The answer (`MatrxDrillAnswerTable`) carries the Pareto line, row actions (Copy / Copy for AI, ticks),
  export (Copy, CSV), the coverage line, the pivot cap and the explorer's `note` (grain, reconciliation,
  the open view's conditions, freshness, knob sentences); its wrapper is a flex column so the table's
  own scroll box keeps its header row in view. The window menu's presets are the package's (All time,
  Today, Yesterday, 24 h … 12 months, Custom range). The unit switch reads "Points" / "$".
- An open Saved view is named in the address (`view=builtin:<key>` or the saved row's id), so its link
  reopens it WHOLE (what it carries beyond the address included) and Explain this hands a model its
  `conditions` (VERIFY-DRILL-WAVE2 W2-1). The saved-views list is paged 50 at a time and says "N of M".

Mounts: `features/admin/usage-drill/UsageExplorer.tsx` (`/administration/usage`),
`features/administration/kg-cost/components/KgCostExplorer.tsx` (`/administration/knowledge/kg-cost/explore`,
definition `kg_cost`, platform lane), `features/workflow-runtime/drill/WorkflowRunsExplorer.tsx`
(`/administration/automation/workflow-runs` platform lane; `/workflows/runs/analyze` mine lane; definition
`workflow_runs`). The KG cost dashboard's unit-economics section is the kg_cost mount, unconditionally (the old
`fn_kg_cost_unit_economics` section and its flag are deleted). A mount passes no words of its own for a definition that
declares its choices (lane DRILL-GAPS); the mine lane's header says "Your <rowNoun>s across all your
organizations" (`mineScope`), because the door counts the person's rows in every organization.

---

## Invariants & gotchas

- **ONE NAME BOOK (`drillNames.ts`).** Every relation value on the screen — answer, chart, trail,
  records, glance columns, findings, a sibling's findings — reads its words from the explorer's one
  book. A surface hands it the door rows it draws (`readRows`) or ids (`want`); the book keeps the
  door's labels and asks the host resolver for exactly the unnamed ids, once each. A failed read
  ends in the resolver's `unreadLabel`, never "Reading the name…". Never keep names in a surface.
- **Only a declared definition is described.** `records.fact` is a fact token and is never
  described: records over the definition's own fact take its own grain; records that are a sibling
  definition's rows take that sibling's grain, already described by `useDrillSiblings` (D2).

- Import only what the PUBLISHED `@ai-matrx/design-system` / `@ai-matrx/records` export (lane
  DRILL-WIRE needs design-system 0.49.54+ and records 0.58.120+: `search`, Dimension `entity` /
  `colorFor`, Measure `moment`, `TableDoors.menu`, choice `color`).
- ONE mapping from a definition to the answer primitives: `drillSiblingDimensions` /
  `drillSiblingMeasures` (`drillSiblings.ts`) serve the explorer AND its siblings' findings — a relation
  names its record kind (`entity` = `relation.token`), a choice's declared chart token is its `colorFor`,
  a `unit: "time"` Measure is a `moment` (never a share, a change or a Pareto line).
- A group row's record doors come from the table host (`MatrxDataTableHost` `resolveEntityDoors`): a
  `user` on an `/administration` page gets the admin user menu as `TableDoors.menu`
  (`features/admin/users/components/admin-user-table-menu.ts`, built from `buildAdminUserMenuSection` —
  the one destination list); elsewhere a person has no menu; organization / agent keep open + preview.
- Money: a Measure with unit `usd` prints through the platform's one credits/$ switch
  (`selectCostUnit`, `formatAdminPoints` / `formatAdminUsd`); the toggle shows only to someone who may flip it.
- A run rate (`op: "rate"`) needs a window with a start: with "all time" it is left out of the ask and
  the screen says so — never a failed answer.
- Controls live in the header row and the toolbar row; no third stacked row.
- Freshness: the door's `as_of` wins over a host's own count; staleness reads the knob describe names
  (`stale_after_knob`) through `drillKnob.ts` — an unreadable knob is a chip, never replaced by a constant.
- Times print in the calendar the door cuts periods in: describe's `calendar.time_zone` when the door
  carries it, else the host's `timeZone` (UTC on the platform lane mounts); a chip says it once.
- The header asks its own headline Measure on the total whatever the open view shows.
- Records: the count's noun is the records' grain (a definer's records relation that is another
  definition is described for its grain); the door's first-page `measures` are the header row's sums;
  `settling` is a chip; the table is `controlled-append`, so its pager reads the door's total.

## Tests

- `__tests__/drill-explain.test.ts` — the Explain this payload: absent until answered, the question's
  parts, groups in the table's order with names, change, Other, total, coverage, nesting (5).
- Walk: `scripts/drill-explain-walk.mjs` (shared preview, admin@admin.com; drills a person, presses
  Explain this, reads the workspace's Copy for AI back, checks the Continue-with-AI destinations are
  offered, never presses one).
- `__tests__/drill-gaps.test.ts` — units formatted by the screen, groups read as the definition's and
  the door's words, the door's labels on an answer (lane DRILL-GAPS).
- Walk: `scripts/drill-gaps-walk.mjs` (clone preview for real answers; live preview for the honest refusal).
- `__tests__/drill-explorer-contract.test.ts` — optional contract fields, declared → address question,
  auto grain, finding window, the Saved-view save path (7).
- Walk: `scripts/drill-explorer-walk.mjs` (`PART=app` on the shared preview; `PART=package` on the
  design-system demo).

- `__tests__/drill-adopt.test.tsx` — the chart above the answer with the knob's Top N and the auto
  grain; the answer's Pareto / pivot cap / row actions / export / coverage; the unit word; an address
  naming a Saved view reopens it and Explain this carries its conditions; knob sentences; the
  reconciliation words (lane DRILL-ADOPT).
- Walk: `scripts/drill-adopt-walk.mjs` (live and clone previews).
- `__tests__/drill-live-fixes.test.tsx`, `__tests__/drill-live-fixes-door.test.tsx` — VERIFY-DRILL-LIVE
  F1 and F3–F9: the knob rule and the no-other-knob-reader guard, records noun / sums / pager / cells,
  the finding's true count, the header's own Measure, a crumb's name asked of the door, the chips.
- Walk: `scripts/drill-live-fixes-walk.mjs` (live preview, read-only, 1280 / 390, light / dark).
- `__tests__/drill-wire.test.ts` — a relation's record kind, a choice's colour, a moment Measure, and
  the admin user menu on administration pages only (5; red 5/5 on HEAD copies).
- Walk: `scripts/drill-wire-walk.mjs` (shared preview, read-only: search an email, the person row's ⋯
  and right-click admin menu never pressed, origin colours, Tool calls / finish reason, 390 px dark).

## Change log

- `2026-09-30` — Created (lane DRILL-EXPLORER): generalized from the usage page's explorer; built-in
  views, findings and records rendered when describe returns them; answers tied to their question.
- `2026-09-30` — Explain this (lane DRILL-EXPLAIN, program DRILL-FINISH decision 22): the question and its
  answer as one Alchemy payload; the Alchemy host now works in the admin seat's organization so the
  workspace on `/administration/*` offers Continue with AI (`components/agent-copy/alchemy-organization.ts`).
- `2026-09-30` — Lane DRILL-GAPS: the explorer reads describe's choice labels and the door's relation
  labels (mount word/name patches removed from the KG and workflow mounts), formats every contract unit,
  rounds every value independently (`apportion.ts` deleted), says the mine lane's scope, asks the
  header's `also` Measures on the total only, formats records cells by unit and words, and names record
  ids through the door; the KG cost dashboard's unit-economics section switched to the kg_cost mount.
- `2026-09-30` — Lane DRILL-ADOPT: adopted the published packages — `MatrxDrillChart` above the answer,
  Pareto, row actions, export / coverage / note on the answer, the package's window presets and
  moment windows, the pivot cap from `drill.pivot_columns`, `drillAutoGrain` (its lines now knobs);
  `hideGrains`, the local moment-window reader and the newest-first pivot reorder removed; the open
  Saved view named in the address and handed to Explain this; the reconciliation line; the unit
  switch says "Points"; saved views paged; records open through `openRecord`; package contract types.
- `2026-09-30` — Lane DRILL-LIVE-FIXES (VERIFY-DRILL-LIVE): one knob reader (`drillKnob.ts`, the door's
  address rule, effective values); records in their own noun with sums, settling and a source-paged
  pager; moments formatted, ids short; findings show the true count past the cap; the header asks its
  headline Measure; relation crumbs named through the door; the door's calendar said once; toolbar
  controls wrap instead of clipping; the note row is chips (interface text is layout).
- `2026-09-30` — Lane DRILL-WIRE: adopted design-system 0.49.54 / records 0.58.120 — the answer
  searches its groups; a person row on an administration page carries the admin user menu (row ⋯ and
  right-click); choices keep their chart colours (origin); a time Measure is a moment; the explorer and
  its siblings share one Dimension/Measure mapping.
- `2026-10-01` — Lane DRILL-D1: one name book for every surface (Findings rows on
  ai_usage_executions read "Reading the name…" forever — their ids never reached the names door);
  the records' noun never describes a raw fact token (`workflow_run_facts` 403).
- `2026-10-07` — Lane DRILL-PRIMITIVE-2: a level breakout naming a sibling definition's Dimension
  (`ai_usage_executions:conversation` on ai_usage's person) is offered through the design-system
  `cross` door built from the mount's siblings — the chip opens the sibling grouped by it, carrying the
  trail's filters it has, the window, and that level's `show`; an address grouping by a Dimension with
  no `show` shows its level's (`useDrillUrlState({ dimensions })`); a failed attribute read carries
  `error` (said in the package's ErrorBox) and every failed ask is said in words (`drillFailureWords`),
  never the database's text. Test: `__tests__/drill-primitive-2.test.tsx`.
