# FEATURE.md — System Context admin console

**Status:** `active`
**Last updated:** `2026-08-08`

---

## Purpose

Super-admin control plane for platform-wide **System Context resources** — the
context items that resolve for EVERY user with no scope selection (their scope
types carry `is_system=true` in the member-less "Matrx System" org). A resource
is a **definition + a feed**: the value is the feed's output, not the authored
thing. "Preview agent context" shows the live resolver output end-to-end.

## Entry points

- **Route:** `app/(admin)/administration/scopes-context/system-context/page.tsx` — thin wrapper only.
- **Console:** `SystemContextConsole.tsx` — header, stat cards, and the list on
  the canonical **MatrxDataTable** (`components/official/matrx-data-table`):
  per-column sort+filter, global search, Copy for AI, side-panel detail
  inspector, WindowPanel view, UUID cells.
- **Dialogs:** `ItemDialogs.tsx` (`AddItemDialog`, `EditItemDialog`,
  `NewScopeTypeDialog`) + `PreviewDialog.tsx`.
- **Feed taxonomy + editor:** `FeedConfigEditor.tsx` — shared feed-type
  metadata (`feedTypeMeta` / `feedTypeTone` / `feedSourceLink`) and the editor
  both authoring dialogs embed.
- **Shared:** `shared.tsx` — value-type / sensitivity taxonomies, tones,
  `itemSummary`, `Field`.
- **API:** everything reads/writes `/api/admin/system-context`
  (`app/api/admin/system-context/route.ts`), which re-checks Super Admin
  server-side. No other write path.

## Invariants

- **List surface is MatrxDataTable** — never a hand-rolled `<table>`. Category
  narrowing is a toolbar **facet** (button group with counts); selecting a
  category exposes its scoped "Add to <category>" / delete-category actions.
- The built-in Environment category (computed/ambient items) is protected: its
  rows are read-only (no Edit/Delete row actions) and the category cannot be
  deleted (UI hides the action; the API guards it too).
- Reference values render via `ContextValueDisplay` (live chips from the
  ```matrx fence), never the raw fence string.
- `scope` and `data_store` reference types are excluded for system items —
  see the rationale in `shared.tsx`.

## Change Log

- `2026-08-08` — Extracted from the 1,640-line route page; list views rebuilt
  on canonical MatrxDataTable (sort/filter/search/copy/panel). Data services
  and write paths unchanged.
