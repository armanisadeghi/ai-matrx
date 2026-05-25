# User Lists Feature

Named collections of labeled items — used for structured choice lists, agent tools, and workflow references.

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

A picklist item's `description` is the payload injected into agent prompts when a variable is bound to a list (see the agents feature). It is an **absolute secret to non-owners** and must never reach a consumer's client:

- **Consumer read path:** `getPicklistForSelection(listId)` → `get_picklist_for_selection` RPC returns **labels only** (`id,label,help_text,group_name,icon_name`), never `description`. Use this anywhere a non-owner can see the result (agent runtime dropdowns, etc.).
- **Owner/editor read path:** `getListWithItems` → `get_user_list_with_items` returns `description` **only** to the list owner/editor (`auth.uid()` gate); non-owners get `null`. The editor (`useQuickLists`) reads items directly — RLS now restricts `udt_picklist_items` SELECT to owner+editor, so `.select('*')` still works for them and returns nothing for everyone else.
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

Three bookmark types copy a JSON reference object to clipboard for use in workflows and agent tools.

```ts
// List-level (ListMetaHeader)
{ type: "full_list", list_id, list_name, description }

// Group-level (GroupSection header)
{ type: "list_group", list_id, list_name, group_name, description }

// Item-level (ListItem row)
{ type: "list_item", list_id, list_name, item_id, item_label, description }
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
