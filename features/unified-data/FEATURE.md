---
type: Feature
title: "unified-data — the web app's record-store host code"
description: "Mechanics and landmines for features/unified-data: the data home, the table page, the host ports records-ui calls, the cutover leftovers, and the guards. What is live and why lives in the common-docs custom-data node."
tags: [custom-data, record-store, unified-data, frontend]
timestamp: 2026-10-02
---

# FEATURE — `features/unified-data`

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/data/custom-data/STATE.md — read it before touching this feature in ANY repo.

This file holds only mechanics and landmines for this directory. What is live, what is open and what Arman ruled
live in the custom-data node (`STATE.md`, `HANDOFF.md`, `DECISIONS.md`, `VISION.md`); drill-down in
`common-docs/systems/data/drill-down/STATE.md`.

## What is where

| Path | What it holds |
|---|---|
| `home/` | The data home at `/data`. `DataHomeRoute.tsx` picks the new list-shell home or the old hub |
| `hub/` | The old hub and its listing; `hub/doors.ts` is the only file that calls store doors the `@ai-matrx/records` client does not carry yet |
| `table-page/` | The table page at `/data/<tableId>` (`UnifiedDataTablePage.tsx`, `UnifiedTable.tsx`) |
| `cutover/` | Switch-era clients: `seamSwitches.ts` (the one client for `platform.cutover_seams` / `cutover_seam_press`), `copyAgain.ts`, the switch cards |
| `records*.ts(x)` at the root | Host ports handed to `@ai-matrx/records-ui`: files, file images, clean text, references and kinds, toasts |
| `whereThisTableLives.ts`, `objectOrganization.ts` | A table's organization, read from its own id through `custom.where_id_opens` |
| `standard-field-columns/` | Custom fields shown as columns on standard tables' lists; `useTableCustomFieldColumns` is the table host's `useCustomFieldColumns` binding, and `EntityListPage` adds the same columns to every canonical list's picker |
| `components/EntityCustomFields.tsx` | The custom-fields section on every record view: pages, the Detail host port (`window-panels/detail/DetailCustomFieldsSection.tsx`), peeks (`PeekDialog record={{token,id}}`); its own reads (row home, row readable) are kept by record in `storeReads` — a wake or remount asks nothing (`__tests__/entity-custom-fields-reads-once.test.tsx`) |
| `components/EntityBackLinks.tsx` | The "Linked records" section (AP-4): the custom rows that link to a platform record, from `custom.entity_back_links` through the records package's `useEntityBackLinks` (`@ai-matrx/records/react` — the door, cache and paging live there), grouped by table, each opening `/data/<tableId>/r/<recordId>`, paged by `next_cursor`. `EntityCustomFields` renders it, so every record view with the custom-fields line has it; the party's StandardRecordForm view mounts it in `PartyIdentityCard`. G1 fails a record view without it |
| `every-record-view-has-custom-fields.test.ts` | G1: the record-view census (`scripts/record-pages/`), its generated map and shrink-only ledger (`lib/record-pages/`); live half = safety-net check `custom-fields.walk-every-record-view` |
| `grid-agent-context/`, `page-capture/`, `record-chat/`, `row-agent-action/`, `row-change-agent/` | What a table, a row or a visible view hands to agents and chat |
| `typedAnswers.ts` | What a stranger typed on a public door (form, booking, portal), turned into values once |
| `test-bench/` | Route-existence facts read from the build tree |
| `__tests__/` | Behaviour tests for the host code |

Routes outside this directory: `app/(core)/data/`, `app/(core)/data/page.tsx` (redirects to `/data`),
`app/(core)/pick-lists/` with `features/data-tables/pick-lists/`.

## Mechanics

- **Every store read and write goes through the two packages.** `@ai-matrx/records` (doors) and
  `@ai-matrx/records-ui` (screens); source in `aidream/apps/shared/records` and `records-ui`; this app takes `latest`.
  A door the client lacks goes through the package's own seam, `recordsDataSource(...).rpc(fn, args, { schema })`,
  in `hub/doors.ts` only, and moves into the package at its next release.
- **A table opens in its own organization.** The store's doors are keyed (organization, id); the organization comes
  from the object's id (`custom.where_id_opens`), never from the active organization or a caller.
- **The record store is never off** (Arman, 2026-10-03: everything is on by default). There is no store switch,
  no gate hook, no switch notice and no nav gate; `custom.store_is_open` answers true for every organization and the
  knob `custom/system_enabled` is archived. Guards: `features/shell/__tests__/no-nav-row-is-gated.test.ts`,
  `pnpm check:the-store-is-never-off`.
- **The gates in front of a table keep their answers** (`useObjectOrganization`,
  `useSharedTable` → `lib/kept-answer/keptAnswer.ts`): one answer per object / organization for the session, read
  synchronously on remount or wake, re-asked in the background when stale, replaced only when it changed, never
  blanked by a retry; forgotten on sign-out. A gate never drops back to "resolving" and unmounts the grid.
- **The custom-fields section reads the ROW's organization from the store** (`custom.entity_record_home(token, id)`,
  invoker, through `hub/doors.ts`) — never the active organization. A page holding the row may pass `organizationId`
  as the fallback used only while that door is not applied; surfaces without one show no section until it is. The
  section's first read (`custom.entity_record_read`) is asked before it mounts: a refusal is a short state or, for the
  known pre-apply column refusal, no section — never a raw database error.
- **Every record view declares its token in its own file** (`<EntityCustomFields entityToken="…">` or a
  `// record-view:` line); regenerate with `pnpm tsx scripts/record-pages/generate.ts --shrink`.
- **A package change ships package first.** Publish `@ai-matrx/records` / `records-ui` before any consumer code that
  needs it lands on main; until npm has it, `:3001` and the release build break on the missing export.

## Landmines

- **The old hub is one knob or one link away.** `custom.data_home_shell` picks the new home (live value true,
  platform default false); `?home=old` still renders the old hub for one visit. Both are removed after the soak, not
  before 2026-10-03 20:38Z (owner: v6 lane ONE-HOME in common-docs `projects/data-doctrine-adoption/v6/`).
- **"Copy this table again" is still on the table menu** (`UnifiedTable.tsx` imports `cutover/copyAgain.ts`), though
  every organization has switched. Same clock as above.
- **Never touch `custom.*` directly.** `pnpm check:no-custom-store-code` fails on any `.schema("custom")`, store SQL or
  profile header in app code.
- **Never reach the old tables.** The six `udt_*` tables sit in schema `deprecated` and refuse writes;
  `pnpm check:old-system-unreachable` (and `:db`) lists every path that still names them and fails on a new one.
- **The undo is gone.** `platform.cutover_seam_press` refuses a press back to the old system; the switch cards in
  `cutover/` are history waiting for deletion, not controls to rely on.
