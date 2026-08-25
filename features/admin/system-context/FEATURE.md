# FEATURE.md — System Context admin console

> Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/scopes-context/STATE.md — read it before touching this feature in ANY repo.

**Status:** `active`. The System Context model (definition + feed, the `is_system`
tier, the feed types and what is still unbuilt) lives in the node kit, not here.

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

- **The `is_system` flip must use the CALLER'S authenticated client**, not the
  service client: the DB trigger gates on `is_super_admin()` against the live
  JWT and the service role's `auth.uid()` is null. Every other write uses the
  service client.
- **`set_value` and preview still trust a client-supplied `scopeId`/user id.**
  Super-admin-gated today; re-derive `scope_id` server-side from the item's
  scope type before this surface widens.
