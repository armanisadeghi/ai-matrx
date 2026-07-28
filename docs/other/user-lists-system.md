# Structured Lists — data model notes (Supabase)

> Historical note: this document describes the pre-UDT `user_lists` / `user_list_items` model.
> Structured Lists are stored in `workbench.udt_structured_lists` /
> `workbench.udt_structured_list_items`. The product/data concept is **Structured List**; "picklist"
> describes one usage mode, not the full data shape.

**Historical reference tables:** `public.user_lists` and `public.user_list_items` on the **automation-matrix** Supabase project (`txzxabzwovsujtloxrus`, `public` schema).
**Purpose:** Named, editable collections (**Structured Lists**) owned by a user, each with many **items** (rows). Items support **optional grouping** via `group_name`. A Structured List can be consumed as dropdown/picklist choices, but it can also represent grouped checklists, shopping lists, menus, lightweight taxonomies, and other reusable item collections.

---

## Entity relationship

- **`user_lists`** — Container: title, description, owner, visibility flags.
- **`user_list_items`** — Rows belonging to exactly one list (`list_id` → `user_lists.id`, **ON DELETE CASCADE**).
- **Ownership:** `user_lists.user_id` is the list owner (no FK enforced at DB level).  
  **`user_list_items.user_id`** references **`auth.users(id)`** (CASCADE on update/delete).

---

## Columns

### `user_lists`

| Column        | Type        | Default        | Notes |
|---------------|-------------|----------------|-------|
| `id`          | `uuid`      | `gen_random_uuid()` | PK |
| `created_at`  | `timestamptz` | `now()`      | |
| `updated_at`  | `timestamptz` | `now()`      | nullable |
| `list_name`   | `varchar`   | | Display title |
| `description` | `text`      | | |
| `user_id`     | `uuid`      | | Owner |
| `is_public`   | `boolean`   | `false` | |
| `public_read` | `boolean`   | `true`  | |

### `user_list_items`

| Column        | Type        | Default        | Notes |
|---------------|-------------|----------------|-------|
| `id`          | `uuid`      | `gen_random_uuid()` | PK |
| `created_at`  | `timestamptz` | `now()`      | |
| `updated_at`  | `timestamptz` | `now()`      | nullable |
| `label`       | `varchar`   | | Primary line for UI |
| `description` | `text`    | | |
| `help_text`   | `text`      | | Secondary/helper copy |
| `group_name`  | `varchar`   | | **Grouping key**; null aggregates under `"Ungrouped"` in read API |
| `user_id`     | `uuid`      | | FK → `auth.users` |
| `is_public`   | `boolean`   | `false` | |
| `public_read` | `boolean`   | `true`  | |
| `list_id`     | `uuid`      | | FK → `user_lists.id` |
| `icon_name`   | `varchar`   | | Optional Lucide/icon id for rich UI |

**Indexes:** PK only on both tables (no secondary indexes in DB today).

---

## Row Level Security (authenticated)

Policies use **`has_permission('user_lists', <list id>, 'viewer' | 'editor')`** for collaboration alongside **owner** and **`is_public`**.

### `user_lists`

- **SELECT:** `user_id = auth.uid()` OR `is_public = true` OR viewer permission on that list id.
- **INSERT:** `user_id` must equal `auth.uid()`.
- **UPDATE:** owner OR editor permission.
- **DELETE:** owner only (`user_id = auth.uid()`).

Policies apply to role **`authenticated`**.

### `user_list_items`

- **SELECT:** item `user_id = auth.uid()` OR item `is_public = true` OR parent list is visible (public, owner, or viewer on list).
- **INSERT:** item `user_id = auth.uid()` **or** editor on parent list (allows collaborators to add rows with correct `list_id`).
- **UPDATE:** item owner OR list owner OR list editor.
- **DELETE:** item `user_id = auth.uid()` only (stricter than update — collaborators cannot delete via RLS as written).

**UI implication:** Editing flows should respect “owner vs collaborator” vs “item-level owner”; bulk replace may need RPC or elevated path.

---

## RPCs (`SECURITY DEFINER`, `EXECUTE` granted to `anon` and `authenticated`)

All definitions live in `public`. They bypass table RLS **inside** the function body; product code should still treat them as sensitive (see **`get_user_lists_summary`** below).

### `get_user_lists_summary(p_user_id uuid) → jsonb`

Returns a **JSON array** of objects (or `'[]'`), **only for lists where `user_lists.user_id = p_user_id`**:

- `list_id`, `list_name`, `description`, `created_at`, `updated_at`
- `item_count`, `group_count` (distinct `group_name` on items)

Ordered by `created_at` DESC on the list.

**Gap for product UI:** This does **not** include lists shared via `has_permission` (viewer/editor). For a “all lists I can open” screen, use a **table query under RLS** or a new RPC that unions owned + shared.

### `get_user_list_with_items(p_list_id uuid) → jsonb`

Single object:

- `list_id`, `list_name`, `description`, `created_at`, `updated_at`, `is_public`, `public_read`
- **`items_grouped`:** JSON object whose keys are group names (or **`"Ungrouped"`**), values = JSON arrays of `{ id, label, description, help_text }` ordered by `created_at`.

**UI implication:** Primary screen for one list is naturally **sections per group**, then rows inside each section.

### `create_user_list(...) → jsonb`

Parameters include `p_list_name`, `p_description`, `p_user_id`, `p_is_public`, `p_authenticated_read`, `p_public_read`, `p_items` (default `'[]'`).

- Inserts one `user_lists` row with **`list_name`, `description`, `user_id`, `is_public`, `public_read`** only (`p_authenticated_read` is **not** written to `user_lists` in current implementation).
- For each element of `p_items` (JSON array), inserts `user_list_items` with keys from JSON:
  - `'Label'` → `label`
  - `'Description'` → `description`
  - `'Help Text'` → `help_text`
  - `'Group'` → `group_name`
  - plus `p_user_id`, `p_is_public`, `p_public_read`, new `list_id`

Returns `{ list_id, list_name, description, items: [ { id, label, description, help_text, group_name } ] }`.

### `update_user_list(p_list_id, …, p_items jsonb default null) → jsonb`

- Patches list fields with `COALESCE` (only non-null args apply).
- If `p_items` **is not null**: **deletes all items** for `p_list_id`, then re-inserts from the same JSON shape as create (`Label`, `Description`, `Help Text`, `Group`), copying list-level `user_id`, `is_public`, `public_read` onto each new item.

**UI implication:** “Save list” from a full editor is **replace-all items**, not merge-by-id (unless you PATCH rows directly via Supabase client and avoid this RPC).

---

## Chat / MCP tool shape (app)

Tool name **`get_user_lists`**; renderers expect a result like:

```ts
{ lists: UserList[]; page?: number; page_size?: number; count?: number }
```

Each `UserList` in UI code includes: `id`, `list_name`, `description`, `user_id`, `is_public`, `public_read`, `created_at`, `updated_at`, `item_count`.

Visibility badges treat **`is_public` or `public_read`** as “Public”; both false → “Users Only” / private-style states (see `features/tool-call-visualization/renderers/get-user-lists/*`).

---

## Design checklist for a dedicated UI

1. **Two-level navigation:** list index → list detail with **grouped** items (`items_grouped` or equivalent).
2. **Ownership vs shared:** RLS allows viewers/editors on lists; **`get_user_lists_summary` is owner-only** — decide data source for index (PostgREST `select` vs new RPC).
3. **Collaboration vs item delete:** RLS allows editors to insert/update items but **not** delete items unless item `user_id` matches; align UX with backend or adjust policies.
4. **Bulk edit:** `update_user_list` + `p_items` is **full replace** of items; partial edits should use row-level updates or explicit merge logic.
5. **Schema drift:** Generated app types may mention `authenticated_read` on items; **live DB columns** for these tables are as in the tables above — verify migrations if the UI adds toggles.
6. **Sharing links:** `ShareModal` uses `/lists/:id`; there is **no** matching App Router page in-repo yet — pair URL with a real route or entity-crud fallback.

---

*Generated from Supabase MCP (`execute_sql` on project `txzxabzwovsujtloxrus`, 2026-03-29).*
