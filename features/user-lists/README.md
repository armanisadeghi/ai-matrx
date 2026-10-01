# Structured Lists (Picklists) Feature

Structured Lists are reusable collections of choices. A list can stay flat, or each choice can carry a
`group_name` so the same data can be projected as grouped sections, dependent dropdown options,
categorized checklists, menus, lightweight taxonomies, or agent/runtime choice sets. "Picklist" is the
mode where a list is bound to a dropdown/choice input.

**Where a list lives.** Every list is a Table of choices in the record store (`custom.*`), one Record
per choice (`name`, protected `description`, `help_text`, `group_name`, `icon`), under the list's own
id. It is edited on its own page, `/lists/<id>` — the store's table page — never in a second editor.

## Routes

| Route | What it is |
|---|---|
| `/lists` | Signed in: the Picklists page (`components/PicklistsPage.tsx` → `PicklistsIndex`), every picklist across the person's organizations from THE LIST INDEX, New picklist first. Guest: the landing (`features/structured-lists/StructuredListLanding.tsx`). |
| `/lists/<id>` | The list's page: the store's table page (`app/(core)/lists/[id]/StoreListPage.tsx`) under one line. |
| `/lists/v1`, `/lists/v2`, `/lists/v3` | Retired addresses; redirect to `/lists`. |

## Reads and writes

| Operation | Door |
|---|---|
| Every list a person may open | `custom.pick_list_index_everywhere()` / `custom.pick_list_index(org)` via `pick-list-index.ts` (`getAccessibleLists`, `organizationPickListsInTheNewSystem`) |
| One list with its choices (owner/editor sees `description`) | `get_user_list_with_items` (`getListWithItems`) |
| One list, labels only (consumers, agent runtime) | `get_structured_list_for_selection` (`getStructuredListForSelection`, `useStructuredListForSelection`) |
| Rename / re-describe | `update_user_list` (`updateList`) |
| Add / change a choice | the records client in the list's organization: `recordWrite` / `recordUpdate` on the list's Table (`addChoices`, `updateChoice`) |
| New picklist | `create_user_list` (`createList`), born in the store |

### Item `description` is an owner-only secret

A choice's `description` is the payload injected into agent prompts when the list is bound to an agent
variable. Consumers read through `get_structured_list_for_selection`, which never returns it;
`get_user_list_with_items` returns it only to an editor. The Python backend resolves it at run time and
injects it only into the in-flight provider request. Do NOT add a client read path that returns it.

## Key components

| Component | Purpose |
|---|---|
| `PicklistsPage` / `PicklistsIndex` | The Picklists page at `/lists` |
| `ListManagerFloatingWorkspace` | The List Manager window: `ListsSidebar` + the selected list (`ListDetailClient`) |
| `ListsSidebar` / `ListCard` | Searchable list of lists |
| `ListDetailClient` | A list handed to a host: its name and the way to its page |
| `GroupSection` / `ListItem` / `BookmarkCopyButton` | Grouped read-only choice rows with bookmarks (the picklist tool's inline view) |

## Bookmark System

Three bookmark types copy a JSON reference object to clipboard for use in workflows and agent tools. **A
bookmark IS a Matrx reference item** — the identity ids (`list_id`, `group_name`, `item_id`) are
authoritative; `list_name`, `label`, and `description` are non-authoritative display hints. The shapes
re-export the canonical generated wire types (see `types.ts` + `features/matrx-envelope/FEATURE.md`).

## Agent-writable surface

`matrx-user/list-manager` (the List Manager window) declares four targets — `add_list_items`,
`update_list_item`, `active_list_name`, `active_list_description` — defined once in
[`surface-write-targets.ts`](./surface-write-targets.ts), handled once in
[`surface-write-handlers.ts`](./surface-write-handlers.ts) (the same doors as the table above). There is
no draft layer, so every target is `mode: "entity"`, `applyPolicy: "ask"`; never `auto`, and never a
delete or visibility target. `lists.manifest.ts` (`matrx-user/lists`) imports the same targets; its
route mount is now the store's table page. Read
[`features/surfaces/FEATURE.md`](../surfaces/FEATURE.md) § "The 360 loop" before changing them.

## Change Log

- `2026-10-01` — **No trace of the older list tables (lane OLD-READERS-REMOVAL, part FE-LISTS).** `/lists` is the Picklists page for a signed-in person (moved from `/lists/v3`); `/lists/v1`–`v3` redirect there. Deleted: the two older managers (`features/structured-lists/StructuredListManagerV1/V2`, `useStructuredLists`, the v1·v2·v3 header), the older list editor (dialogs, tree/split/table layouts, `actions/list-actions.ts`), the `lists-junk` demos and their tests. `service.ts` reads only the list index and the store-answering doors; choice writes go through the records client. `/lists/<id>` no longer reads the older row for an owner or a "moved" line. Tests: `__tests__/a-persons-picklists-live-in-the-record-store.test.tsx` (A–E), `app/(core)/lists/[id]/__tests__/a-list-page-says-what-it-is-and-never-that-it-moved.test.tsx`.

- `2026-09-27` — **The Picklists page reads THE LIST INDEX (lane HANDOVER).** `/lists/v3` is `components/PicklistsIndex.tsx`: every picklist of the organization the person is working in (or every organization, one click), from ONE store door — `custom.pick_list_index(org)` / `custom.pick_list_index_everywhere()` through `pick-list-index.ts` — New picklist first, a filter, the archive under the list; a row opens `/lists/<id>`. Nothing reads `workbench.*` from the browser. `storeListsOf` (the pickers' store half) and `organizationPickListsInTheNewSystem` (the org Lists tab) now read the same index. The older v3 document editor (`structured-list-manager-v3.tsx`) is deleted; the v1 · v2 · v3 switcher retires at the final switch. Tests: `__tests__/lists-of-a-switched-organization-live-in-the-new-system.test.tsx` (B: the page lists from the index and reads no older table).
- `2026-09-17` — **Every list-item write carries its list's `organization_id`.** `addItemAction` (`actions/list-actions.ts`) and `addItemToList` (`service.ts`) read the parent list's `organization_id` and send it on the insert; the two managers in `features/structured-lists` do the same (`StructuredListManagerV1`, `structured-list-manager-v3`), and a NEW list there is filed in the ACTIVE organization (`selectOrganizationId`, never `selectEffectiveOrganizationId`). None of these rows relied on the `_stamp_org_default` trigger any more, which stamped the author's PERSONAL organization on anything inserted without one. Each path fails closed and names the remedy: the server actions throw, the managers toast ("Choose an organization first…" / "This picklist isn't filed in an organization…"). Law: `../common-docs/policies/context-is-carried-never-rebuilt.md`.
- `2026-08-27` — **The `/lists/v3` sidebar now exposes the same universal list-row menu on touch.** Every picklist row is the `structured_list` entity context and carries a visible 44px Actions control at tablet/mobile widths; it opens the canonical v3 menu/sheet without replacing the existing select, quick-look, or open-in-new-tab doors.
- `2026-08-27` — **The deterministic review list is ownership-safe for both authorized admin identities.** The original `Countries by Continent` fixture remains at `/lists/9f9241bc-7046-479a-a883-2133ef03cba8` for `admin@admin.com`; the in-app Browser admin identity owns an idempotent clone at `/lists/3c5a879d-69b0-7d36-827a-c49760e4ff98`. Both contain the same 15 grouped items, including `Africa`, so `/lists/v3` search and list-specific owner actions can be verified without widening RLS or transferring the original fixture.
- `2026-08-26` — **List/group actions are discoverable on touch.** Canonical `/lists` cards, `/lists/[id]` group headings, and the tree-layout nodes expose a visible 44px overflow control at tablet/mobile widths. Each dispatches into its existing universal v3 context-menu scope, so Copy, Agents, Quick Actions, and list-specific actions stay one implementation rather than drifting into a second mobile menu. Deterministic review target: `/lists/9f9241bc-7046-479a-a883-2133ef03cba8` (`Countries by Continent`, including the `Africa` group).
- `2026-08-22` — claude: **surface-check `matrx-user/lists` — pass-with-arman-items
  (checklist v1, 4 fixes).** S2: five values added
  (`active_list_url`, `active_list_group_count`, `active_list_created_at`,
  `active_list_updated_at`, `list_group_names`); `selected_item_*` now also
  track the right-clicked row, so their descriptions say so — 16 → 21 values,
  DB-synced. S3: **`update_list_item`** added to the SHARED
  `surface-write-targets.ts` / `surface-write-handlers.ts`, so the route mount
  AND the List Manager window gained in-place item editing (including moving
  an item between groups) in one change — 3 → 4 targets. Because its item id is
  now agent-supplied, `updateItemAction` is scoped `.eq("list_id").eq("user_id")`
  so a foreign id MISSES instead of quietly editing an off-screen row. S6: the
  detail pane had **no canonical context menu at all**; one
  `NonEditableContextMenu` now wraps it with `surfaceName` +
  `getApplicationScope` + the `structured_list` entity (Attach To / Share), and
  `resolveContextOnOpen` resolves the right-clicked item/group off the
  `data-list-item-id` / `data-list-group` attributes in the new
  `dom-anchors.ts` — single-instance delegation, so there is ONE menu shell and
  no nested Radix triggers, and every extra row calls the same handler the
  kebab already did. S7: every content textarea is `ProTextarea` and every
  single-line content field is `ProInput` (search/filter inputs stay bare);
  THE LENGTH RULE → `enableTextStats` OFF on all four descriptions (item 500 /
  list 300 typical chars). **Fixed an unfinished intent:** `EditItemDialog`
  took `existingGroups` and never rendered a Group field, so an item could
  never be moved between headings from the UI. Removed the dead
  `getLucideIcon` placeholder in `ListItem`. ARMAN ITEMS (chipped, not
  decided here): `list_visibility` means DIFFERENT things on the two list
  surfaces (`public|authenticated|private` here vs `public|personal` on
  list-manager, which hand-rolls it instead of calling `getListVisibility`),
  and seven values are declared verbatim in both manifests — the
  missing-parent smell, but introducing a parent surface is a hierarchy call.
  `ListItemsTableView` / `ListsTableView` are built and mounted nowhere a user
  can reach; chipped, NOT deleted. Header/mobile/theme were checked
  statically only (no browser in that session) — clean, but unverified by eye.
- `2026-08-11` — claude: **The `/lists/[id]` ROUTE is now agent-writable too
  (`matrx-user/lists`), sharing ONE vocabulary with the List Manager window.**
  The two are mounts of the same state, so the three targets and their
  handlers moved into `surface-write-targets.ts` / `surface-write-handlers.ts`
  and both manifests + both mounts import them — nothing renamed, list-manager's
  names win. Registration is gated on `asRoute` so the window's surface is not
  shadowed from inside its own detail pane. The surface was `readiness: "stub"`
  with no emitter; it now emits a real scope (`list_visibility` from the actual
  `LIST_VISIBILITY_VALUES` constant instead of the fictional
  `personal | shared | public` it used to claim, plus a new `list_is_owner`).
  **Fixed a pre-existing bug this depended on:** `get_user_list_with_items`
  returns no `user_id`, so `ListDetailClient`'s `isOwner` was false for
  everyone and the route header's "Edit list" / "Delete list" actions never
  appeared for owners — `app/(core)/lists/[id]/page.tsx` now attaches the
  owner from the table. Live-verified with a Badass Agent run on a throwaway
  list: three targets applied in one message (SQL-confirmed), a decline
  returned `{ok:false, declined:true}`, delete requests produced no tool call,
  and a JSON object forced into `active_list_name` returned the handler's
  "plain text, not JSON and not JSON-encoded" throw verbatim to the model.
- `2026-08-10` — claude: **List Manager surface made agent-writable** (3 entity
  targets, all `ask`). Verified with a live Badass Agent run on a throwaway
  list: items added and persisted, description rewritten, a declined rename
  handled as a normal outcome, a bad value returned
  `add_list_items expects a non-empty array…` to the agent, an undeclared
  target (visibility) refused, and zero `surface-writeback` captures in the
  Error Inspector.
