# Scope System — UI Spec

This spec describes the three screens needed to make the scope/context system usable. The design goal is **casual, forgiving, low-friction**. Users shouldn't have to think about types, fetch hints, or sensitivity levels. They type a field name, they type a value, it works. Everything else has sensible defaults.

## Tables involved

| Table | Role |
|---|---|
| `ctx_scope_types` | Categories ("Models", "Clients", "Departments") |
| `ctx_scopes` | Instances of those categories ("Opus", "ABC Company", "SEO") |
| `ctx_context_items` | Fields defined on a scope type ("Max tokens", "Brand colors") |
| `ctx_context_item_values` | The actual data cells (one per scope × field) |

---

## Screen 1: Categories page

**Route:** `/categories` (or under org settings)
**Who:** Org admins
**Purpose:** Create scope types and quickly define their fields

### Layout

A grid of category cards plus an "Add category" card.

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ 🏢  Clients      │ │ 💼  Departments  │ │  +               │
│ 4 items          │ │ 2 items          │ │  Add category    │
│ 5 fields         │ │ 1 field          │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Initial data load

```ts
const { data } = await supabase.rpc('list_scope_types', { p_org_id: orgId });
// Returns: [{ id, label_singular, label_plural, icon, scope_count, ... }]
```

For each card, show `label_plural`, the count, and a "fields" line. The scope count comes from the RPC. For the field count, do one extra batch query or store it in `default_variable_keys` length.

### Action: Click "Add category"

Open a modal (or expand inline). Two sections:

**Section A — The category itself**
- Singular name (required): `Client`
- Plural name (auto-fills from singular by adding "s"; user can override): `Clients`
- Icon (optional, defaults to `folder`): a Tabler icon picker with search; show 8 common defaults
- Description (optional): one-line subtitle

**Section B — Fields to track**
A repeating row of field-name inputs with an "x" remove button and a "+ Add field" at the bottom. Each row is just a single text input.

```
What fields do you want to track for each Client?

  ─ Brand voice                                    [×]
  ─ Brand colors                                   [×]
  ─ Target audience                                [×]
  + Add field
```

Don't ask for type, fetch hint, or anything else. Default everything to `string` / `on_demand` / `internal`. They can refine later.

### Action: Save the category

This is one or many RPC calls. Wrap them in a try/catch and surface a single error if any fail.

```ts
// 1) Create the scope type
const { data: typeRow } = await supabase.rpc('create_scope_type', {
  p_org_id: orgId,
  p_label_singular: form.singular,
  p_label_plural: form.plural,
  p_icon: form.icon || 'folder',
  p_description: form.description || '',
});
const typeId = typeRow.id;

// 2) For each field, create a context item
for (const fieldName of form.fields) {
  await supabase.rpc('create_context_item', {
    p_scope_type_id: typeId,
    p_key: slugify(fieldName),          // e.g. "Brand voice" → "brand_voice"
    p_display_name: fieldName,
    p_value_type: 'string',             // sensible default
    // description, category, fetch_hint, sensitivity, tags — all defaulted
  });
}
```

`slugify` rule: lowercase, replace spaces/hyphens with `_`, strip anything that isn't `a-z0-9_`. Show the user the generated key as a small grey caption under the input so they understand what it'll be called internally.

### Action: Click an existing category card

Navigate to Screen 2 for that type.

---

## Screen 2: Scopes list

**Route:** `/categories/:type_id` or `/{label_plural_slug}` (e.g. `/clients`)
**Who:** Anyone in the org
**Purpose:** Browse scopes of a type, jump into one to edit, or add new

### Layout

Title is the `label_plural` for the type. Below it, a list of scopes. Each row shows the scope name, "X of Y fields filled" indicator, and last-edited time. Click anywhere on the row to go to the scope detail (Screen 3).

```
Clients                                              [+ New Client]
──────────────────────────────────────────────────────────────────
ABC Company        5 of 5 fields           edited 2 days ago   →
XYZ Company        3 of 5 fields           edited 1 week ago   →
DEF Industries     0 of 5 fields           never edited        →
```

### Initial data load

Two parallel calls:

```ts
// 1) The fields defined for this type — needed to compute "X of Y filled"
const { data: items } = await supabase.rpc('list_scope_type_items', { p_scope_type_id: typeId });

// 2) The scopes of this type
const { data: scopes } = await supabase.rpc('list_scopes', {
  p_org_id: orgId,
  p_type_id: typeId,
});
```

`list_scopes` already returns `assignment_count` per scope, but we want the **count of context-item values**, which is different. For v1, show only the scope count "5 of N fields" using a third small query if needed:

```ts
// Optional per-scope counts (defer if it becomes slow at scale)
for each scope:
  await supabase
    .from('ctx_context_item_values')
    .select('context_item_id', { count: 'exact', head: true })
    .eq('scope_id', scope.id)
    .eq('is_current', true);
```

Cheaper: compute it once in a future RPC like `list_scopes_with_completion` if you need it. For v1 just show scope name + edited time.

### Action: Click "+ New {label_singular}"

A simple inline form or modal:
- Name (required): one input
- Description (optional): one input
- Parent scope (only if this type has `parent_type_id` set — hide otherwise): a select populated from the parent type's scopes

On save:
```ts
const { data } = await supabase.rpc('create_scope', {
  p_org_id: orgId,
  p_type_id: typeId,
  p_name: form.name,
  p_description: form.description || '',
  // p_parent_scope_id only if applicable
});
// Then route to /scopes/{data.id} (Screen 3)
```

### Action: Click a scope row

Route to Screen 3 for that scope.

---

## Screen 3: Scope detail / editor

**Route:** `/scopes/:scope_id`
**Who:** Anyone in the org
**Purpose:** View and edit the values for one scope. This is the screen where the magic happens.

### Layout

The visual mockup shown above. Top: back link to the type's list, the scope's name (editable), a subtle "saved X ago" indicator. Then one card containing all the fields, each as a labeled input. At the bottom: "+ Add another field".

### Initial data load

```ts
// One call gets everything:
const { data: rows } = await supabase.rpc('get_scope_context', {
  p_scope_id: scopeId,
  p_item_ids: null,         // we want ALL items for this scope's type
  p_include_empty: true,    // include fields that don't have values yet
});

// Returns an array, one row per defined field:
// [{ item_id, key, display_name, value_type, has_value,
//    value_text, value_number, value_boolean, value_json, ... }]
```

Render one input per row. The input type depends on `value_type`:

| `value_type` | Input |
|---|---|
| `string` | `<input type="text">` (or `<textarea>` if value > 80 chars) |
| `number` | `<input type="number">` |
| `boolean` | toggle / checkbox |
| `object` or `array` | `<textarea>` with monospace font, parsed as JSON on save |
| `document` | URL input |
| `reference` | (deferred — id picker) |

For v1 you can show **every field as a textarea** and parse on save based on `value_type`. The user's request was explicit: "everything to an LLM is text anyway, so we default to a text area." That's correct and simpler.

### Action: Edit a field

**Auto-save on blur** (when the user clicks away from a field). Show a subtle "saving..." then "saved" indicator.

```ts
// On blur of a field input:
await supabase.rpc('set_scope_context_value', {
  p_scope_id: scopeId,
  p_context_item_id: row.item_id,
  // Pass only one of these based on value_type:
  p_value_text: row.value_type === 'string' ? newValue : null,
  p_value_number: row.value_type === 'number' ? parseFloat(newValue) : null,
  p_value_boolean: row.value_type === 'boolean' ? Boolean(newValue) : null,
  p_value_json: ['object','array'].includes(row.value_type) ? JSON.parse(newValue) : null,
  p_value_document_url: row.value_type === 'document' ? newValue : null,
  p_change_summary: null,   // optional — could add a "why?" field later
});
```

The versioning trigger handles version bumping and marking the previous value not-current automatically. Each save just inserts a new row.

If the user re-enters the same value, you can skip the call (compare to the loaded value first). Optimistic update: change the UI immediately, show "saving" → "saved" badge, roll back on error.

### Action: Click "+ Add another field"

Expand an inline form (do NOT open a modal — keep momentum):

```
┌─────────────────────────────────────────────────────────────┐
│ New field — adds to all {label_plural}                       │
│                                                              │
│ Field name: [____________]  Value: [____________]  [Save]    │
└─────────────────────────────────────────────────────────────┘
```

A small caption above the form makes clear: **"Adds to all Models"** (or whatever the plural is). This is critical UX — the user needs to understand they're not just adding a value, they're defining a column that exists for every scope of this type.

On save, two RPCs in sequence:

```ts
// 1) Create the context item (the column)
const { data: newItem } = await supabase.rpc('create_context_item', {
  p_scope_type_id: typeId,
  p_key: slugify(fieldName),
  p_display_name: fieldName,
  p_value_type: 'string',  // default — they can edit type later if needed
});

// 2) Set the value for this scope
await supabase.rpc('set_scope_context_value', {
  p_scope_id: scopeId,
  p_context_item_id: newItem.id,
  p_value_text: value,
});

// 3) Append the new field to the form below the existing ones
```

Now if the user navigates to a sibling scope (e.g. Sonnet), the new field appears there as an empty input automatically — because it's defined on the type.

### Action: Edit the scope name

The H1 should be `contenteditable` or have a small pencil-edit affordance. On blur:

```ts
await supabase.rpc('update_scope', {
  p_scope_id: scopeId,
  p_name: newName,
});
```

### Action: Delete a field (defer to a later "manage fields" page)

Out of scope for v1. When ready, surface a small `⋯` menu next to each field with "Edit" / "Delete". Deleting a field cascades to all values across all scopes — show a strong confirmation.

```ts
// Future:
await supabase.from('ctx_context_items').delete().eq('id', itemId);
// Cascade is automatic — values for this field on all scopes will be deleted.
```

---

## What to defer for v1

These are real but not blocking. Build the v1 without them, mention them as "coming soon" if asked:

- **Field reordering** — `ctx_context_items` doesn't currently have a `sort_order` column. Add one when needed; until then, alphabetize by `display_name`.
- **Field categories** — `ctx_context_items.category` exists; use it later to group fields ("Brand info" / "Technical info"). Render as collapsible sections.
- **Value type changes** — promoting `string` to `number` etc. Rare; defer.
- **Version history UI** — `get_value_history(scope_id, item_id)` exists. Add a small clock icon next to each field that opens a side panel showing past versions.
- **Required/optional flags** — agent authors may want certain fields marked required for an agent to function. Add a `required_for_agents` flag later.
- **Bulk table view** — "show me all Clients × all fields as a spreadsheet for bulk editing." Build when there are 5+ scopes.
- **Empty-state coaching** — onboarding micro-copy ("Start by adding your first Client") for orgs that haven't set anything up yet.

---

## Component breakdown for the React team

| File | Purpose |
|---|---|
| `app/categories/page.tsx` | Screen 1 |
| `app/categories/[typeId]/page.tsx` | Screen 2 |
| `app/scopes/[scopeId]/page.tsx` | Screen 3 |
| `components/scope/CategoryCard.tsx` | Card in Screen 1 grid |
| `components/scope/AddCategoryDialog.tsx` | The two-section modal (type + fields) |
| `components/scope/ScopeFieldInput.tsx` | One field row on Screen 3 (handles type-appropriate input + auto-save) |
| `components/scope/AddFieldInline.tsx` | The inline "+ Add another field" expansion |
| `lib/scopeRpc.ts` | Typed wrappers around all 8 RPCs (`list_scope_types`, `create_scope_type`, `list_scope_type_items`, `list_scopes`, `create_scope`, `update_scope`, `get_scope_context`, `set_scope_context_value`, `create_context_item`) |
| `lib/slugify.ts` | Display name → key conversion |

---

## The 8 RPCs the React team uses, at a glance

```
list_scope_types(p_org_id)
  → for Screen 1 grid

create_scope_type(p_org_id, p_label_singular, p_label_plural, p_icon?, p_description?, ...)
  → "Add category" button

create_context_item(p_scope_type_id, p_key, p_display_name, p_value_type, ...)
  → adding a field during category creation or via "+ Add another field" on a scope

list_scope_type_items(p_scope_type_id)
  → Screen 2 needs this to count "X of N fields"

list_scopes(p_org_id, p_type_id?, p_parent_scope_id?)
  → Screen 2 list

create_scope(p_org_id, p_type_id, p_name, p_parent_scope_id?, p_description?, p_settings?)
  → "+ New {label_singular}"

update_scope(p_scope_id, p_name?, p_description?, p_settings?)
  → editing the scope name on Screen 3

get_scope_context(p_scope_id, p_item_ids?, p_include_empty?)
  → loads Screen 3 with all fields and their current values

set_scope_context_value(p_scope_id, p_context_item_id, p_value_text?, p_value_number?, p_value_boolean?, p_value_json?, p_value_document_url?, p_change_summary?)
  → auto-save on every blur
```

That's the whole surface area for the v1 UI. No other RPCs needed.

---

## One last design note

The user's instinct was right: **default to text**. An LLM doesn't care if `200000` is stored as a number or a string — it reads "200000" either way. For v1, treating every field as a string with a textarea input is a perfectly valid design choice that radically simplifies the UI. The `value_type` column on `ctx_context_items` is still useful for future structured inputs (date pickers, toggles, file uploads), but in v1 you can hardcode `value_type='string'` everywhere and use `value_text` exclusively. The system supports both approaches.
