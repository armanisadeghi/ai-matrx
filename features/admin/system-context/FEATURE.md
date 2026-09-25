# FEATURE.md — System Context admin console

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/scopes-context/STATE.md` — read it before touching this feature in any repo. The dedicated System Context table supersedes that document's older `is_system` scope-type implementation notes.

**Status:** `active`. This is the Super Admin control plane for platform-wide truths available to every agent.

## Entry points

- **Route:** `app/(admin)/administration/scopes-context/system-context/page.tsx` — thin wrapper only.
- **Console:** `SystemContextConsole.tsx` — canonical **MatrxDataTable**, class facet, search/filter, Copy for AI, detail panel, and WindowPanel view.
- **Dialogs:** `ItemDialogs.tsx` (`AddItemDialog`, `EditItemDialog`) and `PreviewDialog.tsx`.
- **Feed editor:** `FeedConfigEditor.tsx` — feed metadata and configuration shared by both dialogs.
- **Shared:** `shared.tsx` — fixed class metadata, direct-entry value types, sensitivity taxonomy, and presentation helpers.
- **API:** `app/api/admin/system-context/route.ts` — the only read/write path; every method re-checks Super Admin.

## Invariants

- **One row is one truth.** `context.system_context_item` stores the definition, feed, and one current `value` JSONB. System Context has no scope, scope type, category, or separate value row.
- **Classes are fixed.** `ambient` is server-computed and read-only; `curated` is admin-maintained; `dataset` is delivered as a queryable resource pointer. Never add user-defined categories.
- **Values are feed outputs.** Manual feeds accept direct values. Dataset, agent, API, computed, and web feeds expose their configuration and status; do not offer direct value editing.
- **Ambient rows are infrastructure.** The UI offers no edit/delete actions and the API rejects mutation or deletion.
- **List surface is MatrxDataTable.** Class narrowing is a toolbar facet. Feed targets use `EntityRef`; never render a named source as a dead-end label.
- **A System item reaches an agent only when named.** Both resolvers read only the items `p_system_item_refs` names (an agent's binding, an inspector pick, or the platform knob `context/system_item_defaults` — "Every agent receives these without naming them", edited by `SystemItemDefaultsEditor` on `/administration/scopes-context`). The preview here passes that knob's list. `current_timezone` is the person's timezone (the `communication.person_notification_window` ladder); `current_date`/`current_datetime` render in it.
- **Generated types are authoritative.** Run `pnpm sync-types` after schema changes; never hand-edit `types/database.types.ts`; the entity vocabulary ships in `@ai-matrx/associations`.

## Change Log

- 2026-08-27 — Migrated the console and API from `is_system` scope scaffolding to canonical `context.system_context_item` rows and fixed ambient/curated/dataset classes.
- 2026-09-25 — Lane CONTEXT-VALUES-NAMED-2: defaults knob editor on the scopes-context landing; preview passes the knob's list; `current_timezone` is a computed key.
