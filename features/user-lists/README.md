# Structured Lists Feature

Structured Lists are reusable, editable collections of item objects. A list can stay flat, or each item can
carry a `group_name` so the same data can be projected as grouped sections, dependent dropdown options,
categorized checklists, shopping lists, task lists, menus, lightweight taxonomies, reusable labels, or
agent/runtime choice sets.

The product concept is **Structured List**. The backing tables are
`workbench.udt_structured_lists` / `workbench.udt_structured_list_items`, `/lists` is the current route,
and "picklist" means the specific mode where a Structured List is bound to a dropdown/choice input. Do
not treat the list as read-only because it is used as a picklist; owners/editors can create, rename,
group, update, and delete items anywhere the list editor is available.

A Structured List is intentionally lighter than a UDT dataset. It has one fixed item shape
(`label`, protected `description`, `help_text`, optional `group_name`, optional `icon_name`) plus list
metadata. A UDT dataset is the full table model: dynamic columns, typed cells, validation, row history,
bulk writes, and richer data operations.

## Route

`/lists` → index (sidebar + select-a-list prompt)  
`/lists/[id]` → detail view (grouped items, CRUD, bookmarks)

## Architecture

### SSR Data Flow

```
layout.tsx (Server)
  → get_user_lists_summary(user_id) → sidebar list
  → renders ListsSidebarClient (active ID from usePathname)

[id]/page.tsx (Server)
  → get_user_list_with_items(list_id) + user_lists.user_id
  → renders ListDetailClient (client wrapper with all dialogs)
```

All mutations use Server Actions (`features/user-lists/actions/list-actions.ts`) with `revalidatePath` so data stays fresh without manual cache management.

### Item `description` is an owner-only secret (migration 0064)

A Structured List item's `description` is the payload injected into agent prompts when the list is used as
a picklist binding for an agent variable (see the agents feature). It is an **absolute secret to
non-owners** and must never reach a consumer's client:

- **Consumer read path:** `getPicklistForSelection(listId)` → `get_picklist_for_selection` RPC returns **labels only** (`id,label,help_text,group_name,icon_name`), never `description`. Use this anywhere a non-owner can see the result (agent runtime dropdowns, etc.).
- **Owner/editor read path:** `getListWithItems` → `get_user_list_with_items` returns `description` **only** to the list owner/editor (`auth.uid()` gate); non-owners get `null`. The editor (`useQuickLists`) reads items directly — RLS restricts `udt_structured_list_items` SELECT to owner+editor, so `.select('*')` works for them and returns nothing for everyone else.
- **Server injection:** the Python backend resolves `description` via the service connection (bypasses RLS) and injects it only into the in-flight provider request — never persisted. Do NOT add a client read path that returns `description`.

### Key components

| Component | Purpose |
|---|---|
| `ListsSidebarClient` | Client wrapper resolving active list from pathname |
| `ListsSidebar` | Searchable list of list cards with create CTA |
| `ListCard` | Single list row — visibility badge, item count, relative time |
| `ListMetaHeader` | Title, description, stats, settings menu, list bookmark |
| `GroupSection` | Collapsible group with items + group bookmark button |
| `ListItem` | Item row — label, description, help_text, item bookmark, edit/delete |
| `BookmarkCopyButton` | One-click JSON bookmark copy with toast confirmation |
| `ListDetailClient` | Orchestrates all dialogs/state for the detail view |
| `CreateListDialog` | Dialog (desktop) / Drawer (mobile) — creates list then navigates |
| `EditListDialog` | Dialog/Drawer — patches list metadata |
| `AddItemDialog` | Dialog/Drawer — adds a single item; group autocomplete via datalist |
| `EditItemDialog` | Dialog/Drawer — edits item label/description/help_text |
| `DeleteConfirmDialog` | AlertDialog for destructive actions |

## Bookmark System

Three bookmark types copy a JSON reference object to clipboard for use in workflows and agent tools. **A bookmark IS a Matrx reference item** — the identity ids (`list_id`, `group_name`, `item_id`) are authoritative; `list_name`, `label`, and `description` are non-authoritative display hints. The shapes re-export the canonical generated wire types (see `types.ts` + `features/matrx-envelope/FEATURE.md`).

```ts
// List-level (ListMetaHeader)
{ type: "full_list", list_id, list_name, description }

// Group-level (GroupSection header)
{ type: "list_group", list_id, list_name, group_name, description }

// Item-level (ListItem row) — note `label` (was `item_label`)
{ type: "list_item", list_id, list_name, item_id, label, description }
```

`BookmarkCopyButton` — click to copy, `BookmarkCheck` icon confirms for 1.5s, `sonner` toast shows what was copied.

## Ownership & Permissions

- **Owner** (userId === list.user_id): full CRUD on list and items  
- **Collaborator** (editor via RLS has_permission): can add/update items, cannot delete items  
- **Viewer** / public: read-only, no edit controls shown

RLS enforced server-side. UI hides edit controls based on `isOwner` prop.

## Mobile

- Sidebar hidden on mobile (`md:hidden` on `<aside>`)  
- `/lists` shows a card grid instead  
- `/lists/[id]` shows a back button → `/lists`  
- All modals use `Drawer` on mobile via `useIsMobile()`  
- No tabs used; groups stack vertically  
- All inputs use `fontSize: 16px` to prevent iOS zoom

## Supabase RPCs

| RPC | Used by |
|---|---|
| `get_user_lists_summary(p_user_id)` | layout.tsx, page.tsx |
| `get_user_list_with_items(p_list_id)` | [id]/page.tsx |
| `create_user_list(...)` | createListAction |
| `update_user_list(...)` | updateListAction |

Direct table queries used for: listing accessible lists, item-level mutations (add/update/delete).

## Agent-writable surface (two mounts, ONE vocabulary)

A user list is a live write target for surface-bound agents from **both** of
its homes:

| Surface | Mount | Manifest |
| --- | --- | --- |
| `matrx-user/list-manager` | `ListManagerFloatingWorkspace` (the floating window) | [`list-manager.manifest.ts`](../surfaces/manifests/list-manager.manifest.ts) |
| `matrx-user/lists` | `ListDetailClient` with `asRoute` (the `/lists/[id]` route) | [`lists.manifest.ts`](../surfaces/manifests/lists.manifest.ts) |

They are two mounts of the SAME editable state — the window renders the very
same `ListDetailClient` in its detail pane — so they offer the same three
targets under the same names: `add_list_items` (the decomposition action — an
agent turns a goal into items), `active_list_name`, and
`active_list_description`.

**There is exactly one definition of each, and that is deliberate.** The
targets live in [`surface-write-targets.ts`](./surface-write-targets.ts) and
their validation + canonical action calls in
[`surface-write-handlers.ts`](./surface-write-handlers.ts); both manifests and
both mounts import them. Two target sets over the same fields would be a
defect. **Add or change a target HERE, never on one mount** — a target added
to a single mount is drift, and the next person to read the other manifest
will not find it.

`ListDetailClient` registers its provider ONLY when `asRoute` is true. The
window renders the same component inside its own provider, and the surface
registry resolves deepest-first, so an ungated provider would shadow
`matrx-user/list-manager` from inside its own detail pane. The `/lists` index
is a landing page and mounts nothing.

**This feature has no draft layer** — every user edit is a server action that
persists on submit. So all three targets are `mode: "entity"` and
`applyPolicy: "ask"`: an applied agent write is a database commit with no Save
bar to undo it. **Never set one of these to `auto`**, and do not declare
targets for delete or visibility — destructive and permission-shaped changes
stay human-only; the agent proposes a deletion in words and the human presses
the button. Handlers validate and throw on a bad shape, call the same
`addItemAction` / `updateListAction` the dialogs call, and refresh so the
surface's read twins update in the same turn. On the route, writes also
require ownership (`list_is_owner`) — a list opened through a shared link is
read-only and every target refuses. Read
[`features/surfaces/FEATURE.md`](../surfaces/FEATURE.md) § "The 360 loop"
before changing them.

## Change Log

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
