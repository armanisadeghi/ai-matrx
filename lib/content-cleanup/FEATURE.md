# FEATURE.md — `lib/content-cleanup` (Content Cleanup Engine)

**Status:** `stable`
**Tier:** `2` (shared primitive)
**Last updated:** `2026-07-25`

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
| Files | `segment.ts` → `operations.ts` + `region-operations.ts` → `clean.ts` → `review.ts` → `debug.ts` | `value-operations.ts` → `clean-cells.ts` |
| Types | `types.ts` | `value-types.ts` |
| Consumers | Notes (`features/notes/components/cleanup/`) | User data tables (`/data/[id]`) |

Both are **pure** — no React, Redux, DOM, or Supabase. A consumer supplies content
(or rows), gets back a report, and writes through its own canonical path.

---

## Entry points

**Document engine**
- `cleanContent(content, enabledIds, enabledRegionIds?) → CleanupReport` — `clean.ts`
- `buildOperationCards(content, enabledIds) → OperationCard[]` — `review.ts`
- `buildRegionOperationCards(report) → RegionOperationCard[]` — `review.ts`
- `CLEANUP_OPERATIONS` / `DEFAULT_ENABLED_OPERATIONS` — `operations.ts`
- `CLEANUP_REGION_OPERATIONS` / `CLEANUP_REGION_OPERATION_META` / `countJsonRegions` — `region-operations.ts`

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

## Region operations — the ONLY way protected content gets rewritten

An ordinary operation runs on the **cleanable** text and may never touch a
protected region. A **region operation** (`region-operations.ts`) is the exact
mirror: it runs *only* on a protected region, and only on the kinds it declares.

Why the class exists: a fenced JSON blob is protected precisely because
collapsing its whitespace with a regex would destroy it. Re-printing it through
a real parser + writer (`lib/json-format`) is the opposite — it is the only safe
way to condense one. The safety rule stays intact ("never regex inside a
protected region") while the capability arrives.

Shipped ops (all `group: "structured"`, all **off by default** — a note's JSON is
the user's text): `condense-json` (compact fill), `minify-json` (one line),
`expand-json` (2-space pretty).

Rules on top of the shared invariants:

- **Mutually exclusive per region.** The first *enabled* op that produces a
  change wins, so condense and expand can never fight and yield order-dependent
  nonsense. Surfaces render them as a single choice, not independent toggles.
- **Strict JSON only.** An op refuses anything that needed JSON5 to parse —
  re-emitting it would silently delete the user's comments and trailing commas.
  That is a rewrite wearing a cleanup's clothes.
- **The report is the review.** A region rewrite is a parse + re-print, so there
  are no character-range edits to re-derive; `report.regionChanges` records the
  real before/after and `buildRegionOperationCards` renders exactly that.

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

- `2026-07-25` — **Region operations added** (`region-operations.ts`): `condense-json`
  / `minify-json` / `expand-json`, the first ops allowed to rewrite a *protected*
  region — always through the new `lib/json-format` parser+writer, never a regex,
  and never on JSON that only parsed tolerantly. `cleanContent` gained a third
  arg (`enabledRegionIds`, defaulted to `[]` so every existing caller is
  unchanged); `CleanupReport` gained `regionOperations` + `regionChanges`; the
  debug XML carries both. Review cards for them come from the frozen report
  (`buildRegionOperationCards`) with a new `"region"` `ChangeExample` kind showing
  real before/after text, and `OperationCard` generalized to `ReviewCard<TId>` so
  one card component renders both families. Notes surfaces it as an exclusive
  "JSON blocks" choice in the cleanup popover, shown only when the note actually
  contains re-printable JSON (`countJsonRegions`).
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
