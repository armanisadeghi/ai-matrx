---
name: table-drill-down
type: Skill
title: "Table drill-down — group, break out, and land on a page about the value"
description: "Drill-down on the shared MatrxDataTable, local or server, with per-Dimension levels. Use when adding group-by, breakdown or 'by X' analytics to a table, replacing hand-built totals or rollup tables, or when people want counts or sums by status, owner, model or day."
tags: [tables, ui, drill-down, analytics]
timestamp: 2026-10-07
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/table-drill-down/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# Table drill-down

A drill-down is a table about the thing you clicked, not a list of groups. Usage by user, click a
user, and you land on that user (header of facts and totals, one-click "By provider / agent /
conversation / day" chips); group by conversation and you see title, agent, started, last activity,
cost, calls, tokens. That second half is **levels**. API detail lives in
`aidream/apps/shared/design-system/README.md` § Drill-down and § How to declare levels; state and
rules in `common-docs/systems/data/drill-down/STATE.md`. Do not copy them here or into the page.

## 1. Add it, or not

- **Add** when the table has a few groupable columns (status, owner, model, a date) and number columns
  (amount, cost, count), or when the page hand-builds totals or rollup tables. The drill replaces them.
- **Do not add** to config editors, work queues, spreadsheet-style editors, or tiny tables (a handful
  of rows has nothing to group).

## 2. Local or server

| The table holds | Use |
|---|---|
| Every row of its source, under 50,000 | **Local**: `drill={{ local: true }}` |
| A page, a window, or a partial set (server pagination, `coverage` or `facets.totalRows` larger than the rows held) | **Server**: a declared `*.drill.ts` |
| More than 50,000 rows | **Server**; local refuses in words past its ceiling |

Never local on partial data: counts of whatever happens to be loaded are wrong numbers. The table
refuses in words; do not work around it by passing `source`.

## 3. Local, then levels

```tsx
<MatrxDataTable data={jobs} columns={columns} getRowId={(j) => j.id} drill={{ local: true }} />
```

Dimensions and Measures are inferred from `columns`. Then declare **levels** keyed by Dimension, for
each Dimension someone will drill into:

- **`breakouts`**: the questions a person asks next about one value, most useful first, time last
  (`"due:month"`, `"at:day"`). Not "every other column".
- **`show`**: the numbers that matter for that thing, in reading order.
- **`attributes`**: facts that describe the one value and are constant inside its group (a user's
  organization, a model's provider). Never a number that varies per row.
- **`records`** (server): the columns "See these records" shows at that level.

Worked example, an ordinary list (jobs by owner and client):

```tsx
drill={{ local: true, levels: {
  owner:  { breakouts: ["client", "project", "status", "due:month"], attributes: ["team"], show: ["count", "sum_amount"] },
  client: { breakouts: ["owner", "status", "due:month"], attributes: ["industry"] },
} }}
```

Drilling into Ada shows her team in the header, chips for her clients, projects and statuses, then
months. Grouping by client shows each client with its industry beside count and amount.

Worked example, Arman's usage (server, on the Dimension in `ai_usage.drill.ts`):

```ts
{ key: "person", ..., level: { breakouts: ["provider", "model", "agent", "feature", "at:day"], attributes: ["organization"] } },
{ key: "conversation", ..., level: { breakouts: ["request", "model", "at:hour"], attributes: ["agent", "person"],
  show: ["cost", "calls", "tokens_in", "tokens_out", "started", "last_activity"] } },
```

Nothing declared is inferred (every other Dimension fewest values first), which is a fallback, not
the design. A level whose list equals the default has not been designed.

## 4. Server

1. Write `aidream/apps/shared/records/scripts/drill-definitions/<key>.drill.ts`, copying
   `ai_usage.drill.ts` for shape: source, lanes (every lane gets a rule), Dimensions with `level`,
   Measures, `records`.
2. `pnpm drill:sync --write --lane <LANE>` (in `apps/shared/records`) writes the campaign migration; apply
   it the way DB changes are applied in this workspace (never hand-edit the generated
   `platform.drill_def__<key>()`).
3. Census: `pnpm drill:sync` with no flag fails when a declaration and the live body differ or a
   definition is unsound (`drill_definition_problems` judges levels too). It must pass.
4. Mount `DrillExplorer` (matrx-frontend `components/official/drill-explorer/`, read its FEATURE.md) or
   `useDrill` in a records grid. Never a second explorer screen.

## 5. Verify

- Open the playground with the question in the address (`http://127.0.0.1:3026/?scenario=drill-level-owner`,
  `pnpm demo`; any setup is a link, see `design-system/demo/README.md` § Links), or your page with
  `?drill.by=…` set. Walk it as a user: group, click a value, read the header, click a chip.
- Check a number against a hand count or a SQL query on the same rows. A drill that looks right and
  is not counted is worse than none.
- Look at it at 390 px wide.
- Real data only; no placeholder rows to make it look full.

## 6. Anti-patterns

- A hand-built group table or totals strip beside the table.
- Every level showing the same columns (levels not declared, or all copied from one list).
- `local: true` on paged or partial data.
- Styling the table from the host (`className`, arbitrary variants). One UI system: a missing option is
  added in `@ai-matrx/design-system`, released and adopted (canonical-table-usage rule 7).
- A per-row measure listed as an `attribute`, or an id column offered as a Dimension.
- A second explorer or a one-off chart instead of `DrillExplorer` / `MatrxDrillChart`.
