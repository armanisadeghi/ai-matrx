# FEATURE.md — `lib/content-cleanup` (Content Cleanup Engine)

**Status:** `stable`
**Tier:** `2` (shared primitive)
**Last updated:** `2026-07-24`

---

## Purpose

One place to answer "clean this content up" for the whole platform, so no surface
ever hand-rolls another `stripHtml` / `trim` / `removeBackticks` helper.

There are **two engines** here because there are two genuinely different problems:

| | Document engine | Value engine |
|---|---|---|
| Input | a document (a note, a transcript, prose with structure) | one scalar value (a table cell, a field) |
| Danger | destroying code/JSON/tables embedded in the prose | destroying meaning by stripping markup that was interior, not wrapping |
| Strategy | **detect + mask** protected regions, clean only around them | **whole-value vs interior** — an unwrap fires only when the marker encloses everything |
| Files | `segment.ts` → `operations.ts` → `clean.ts` → `review.ts` → `debug.ts` | `value-operations.ts` → `clean-cells.ts` |
| Types | `types.ts` | `value-types.ts` |
| Consumers | Notes (`features/notes/components/cleanup/`) | User data tables (`/data/[id]`) |

Both are **pure** — no React, Redux, DOM, or Supabase. A consumer supplies content
(or rows), gets back a report, and writes through its own canonical path.

---

## Entry points

**Document engine**
- `cleanContent(content, enabledIds) → CleanupReport` — `clean.ts`
- `buildOperationCards(content, enabledIds) → OperationCard[]` — `review.ts`
- `CLEANUP_OPERATIONS` / `DEFAULT_ENABLED_OPERATIONS` — `operations.ts`

**Value engine**
- `cleanValue(value, enabledIds) → ValueCleanupResult` — `clean-cells.ts`
- `cleanCells(rows, fields, enabledIds) → CellsCleanupReport` — `clean-cells.ts`
- `toRowPatches(changes) → RowPatch[]` — `clean-cells.ts` (one patch per row, changed fields only)
- `buildValueOperationCards(report) → ValueOperationCard[]` — `clean-cells.ts`
- `VALUE_CLEANUP_OPERATIONS` / `DEFAULT_ENABLED_VALUE_OPERATIONS` — `value-operations.ts`

**Shared UI for the value engine** (grid-agnostic, `components/content-cleanup/`)
- `<CellCleanupButton>` — the whole flow: popover of opt-in ops with live counts → frozen report → review dialog → write. Takes `fields`, `rows`, `loadAllRows`, `scopeLabel`, `onApply`.
- `<CellCleanupOptionsPopover>` / `<CellCleanupReviewDialog>` — the two steps, usable directly if a surface needs its own trigger.

---

## Invariants

- **An operation never guesses.** A value op returns `null` to decline; `null` is
  "does not apply", never "became empty". Consumers treat it as no change.
- **Whole-value only.** `` `parent_id` `` unwraps; ``The id, e.g. `a.b.c`. Stable``
  does not. An unwrap refuses when the marker survives inside the value, because
  ``` `a` and `b` ``` is two spans, not one wrapped value — merging them would be
  data loss wearing a cleanup's clothes.
- **Non-string cells are never touched.** Coercing a number/boolean/JSON cell to a
  string to "clean" it is a data-type change, not a cleanup.
- **Order is load-bearing.** Value ops run structural repair (line endings,
  invisibles, HTML) → unwrapping → whitespace, so wrapper detection sees the real
  first/last characters and whitespace tidies whatever unwrapping left.
- **Review before write.** Every consumer surface shows the frozen report and lets
  the user skip a whole *type* of change. Skipping a type re-derives the affected
  cells through the engine — a skipped op can never ride along inside a cell some
  other op also touched.
- **Cleaning covers the whole scope, not the visible page.** `loadAllRows` exists
  precisely because a grid holds one page; scanning only what is on screen and
  reporting "clean" is a lie.
- **Source stays pure ASCII.** Every non-ASCII target is built from explicit code
  points, so no invisible glyph hides inside a regex literal.

---

## Doctrine

- **Never fork either engine.** A new kind of damage is a new **operation** in the
  matching registry, not a new helper next to the consumer. Adding one to
  `VALUE_CLEANUP_OPERATIONS` immediately gives every grid the toggle, the live
  count, the review card, and the tally — for free.
- **Never add a bespoke cleanup button.** Reuse `<CellCleanupButton>`; it is
  grid-agnostic by construction (`CleanableRow` / `CleanableField` are two-field
  shapes exactly so no consumer has to bend its own model).
- **Choose the right engine.** Cleaning a body of prose that might embed code →
  document engine. Cleaning a scalar → value engine. Running the document engine
  over a cell is wrong: its inline-code detector would *protect* the very
  backticks a cell wants stripped.

---

## Change log

- `2026-07-24` — **`strip-inline-markdown` op added** (Extra, off by default).
  Strips inline markdown ANYWHERE in a value — `**bold**`, `*italic*`, `` `code` ``,
  `[text](url)` — the interior counterpart to the whole-value unwrappers, which only
  fire when a marker wraps the *entire* value (so `**planning workflow:** …` was
  reported "already clean" until this op). Underscore emphasis (`_x_` / `__x__`) is
  deliberately NOT stripped — it would maul snake_case and dunders.
- `2026-07-24` — **Value engine added.** New `value-types.ts` + `value-operations.ts`
  (line endings, invisibles, exotic spaces, decode HTML, unwrap code ticks /
  bold / italic / quotes, strip list + heading markers, straighten quotes, collapse
  spaces + blank lines, trim edges, blank-to-empty) + `clean-cells.ts` (single-value
  run, row×field scan, row patches, review cards). New shared UI at
  `components/content-cleanup/`. First consumer: user data tables — `UserTableViewer`'s
  hand-rolled `cleanupHtmlText` / `containsCleanableHtml` / `handleBulkHtmlCleanup`
  are **deleted**, and both its per-cell fixer and its bulk control now run this
  engine, so a one-cell fix and a whole-table pass can never disagree about what
  "clean" means.
- `2026-06-23` — Document engine created (extracted from the Notes cleanup build).
