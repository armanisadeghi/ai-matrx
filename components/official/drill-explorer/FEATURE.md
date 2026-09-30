# FEATURE.md — `drill-explorer` (one explorer screen for every declared drill definition)

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
Program: `../common-docs/projects/data-doctrine-adoption/v5/PROGRESS-DRILL-FINISH.md` (decision 9).
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
  the definition declares none), `rowNoun?`, `hideGrains?`, `headerExtras?`, `dataAttributes?`.
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
- `grain.ts` — the grain a window reads best at (a time group asked with no grain).
- `types.ts` — the ONE place the contract additions (`views`, `findings`, `records`, `having`,
  `as_of`, `stale_after_knob`) are typed and read defensively until `@ai-matrx/records` publishes them.

Mounts: `features/admin/usage-drill/UsageExplorer.tsx` (`/administration/usage`).

---

## Invariants & gotchas

- Import only what the PUBLISHED `@ai-matrx/design-system` / `@ai-matrx/records` export. Package abilities
  waiting on a publish (the chart, Pareto, row actions, export/coverage/note props, `drillAutoGrain`)
  are listed in PROGRESS-DRILL-EXPLORER "After publish" — never a placeholder in the UI.
- Money: a Measure with unit `usd` prints through the platform's one credits/$ switch
  (`selectCostUnit`, `formatAdminPoints` / `formatAdminUsd`); the toggle shows only to someone who may flip it.
- Controls live in the header row and the toolbar row; no third stacked row.
- Freshness: the door's `as_of` wins over a host's own count; staleness reads the knob describe names
  (`stale_after_knob`) through `lib/knobs/featureKnobs.ts` — a missing knob is said, never replaced by a constant.

## Tests

- `__tests__/drill-explain.test.ts` — the Explain this payload: absent until answered, the question's
  parts, groups in the table's order with names, change, Other, total, coverage, nesting (5).
- Walk: `scripts/drill-explain-walk.mjs` (shared preview, admin@admin.com; drills a person, presses
  Explain this, reads the workspace's Copy for AI back, checks the Continue-with-AI destinations are
  offered, never presses one).
- `__tests__/drill-explorer-contract.test.ts` — optional contract fields, declared → address question,
  auto grain, finding window, the Saved-view save path (7).
- Walk: `scripts/drill-explorer-walk.mjs` (`PART=app` on the shared preview; `PART=package` on the
  design-system demo).

## Change log

- `2026-09-30` — Created (lane DRILL-EXPLORER): generalized from the usage page's explorer; built-in
  views, findings and records rendered when describe returns them; answers tied to their question.
- `2026-09-30` — Explain this (lane DRILL-EXPLAIN, program DRILL-FINISH decision 22): the question and its
  answer as one Alchemy payload; the Alchemy host now works in the admin seat's organization so the
  workspace on `/administration/*` offers Continue with AI (`components/agent-copy/alchemy-organization.ts`).
