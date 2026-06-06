# Scope System — UI Finalization (working spec)

> Single source of truth for the in-progress effort to finalize the CTX Scope UI.
> Captures the full backlog so nothing is lost, the architecture facts agents keep
> rediscovering, the View/Edit/Advanced inventory, and wave-by-wave status.
> Owner-driven; updated as waves land. Companion docs: `features/scopes/FEATURE.md`
> (canonical scope feature) and `features/scopes/FEATURE.md` model overview.

Last updated: 2026-06-05.

---

## The model (recap)

Four-level chain, owned per organization:

```
scope type (dimension)  →  scope (instance)  →  context item (field)  →  value (cell)
ctx_scope_types            ctx_scopes            ctx_context_items        ctx_context_item_values
```

Plus `ctx_scope_assignments` (M2M: a scope ↔ any entity — note/task/agent/…). Values are
versioned (`is_current = true` is live). A value's `source_type` distinguishes human-confirmed
from AI-extracted.

---

## Architecture facts (so we stop rediscovering them)

### Live code path (what production routes actually render)
- `app/(core)/organizations/[orgId]/scopes/page.tsx` → `features/scopes/components/management/ScopesManager` (org overview — the **new** feature).
- `app/(core)/organizations/[orgId]/scopes/[typeId]/page.tsx` → `features/scope-system/components/ScopesList` (scope-**type** detail).
- `app/(core)/organizations/[orgId]/scopes/[typeId]/[scopeId]/page.tsx` → `features/scope-system/components/ScopeDetailEditor` (scope detail).
- Global read view: `app/(core)/scopes/[scopeId]/page.tsx` → `features/scopes/components/management/ScopeDetailView`.

### ⚠️ Three parallel scope feature dirs (pre-existing doctrine debt)
- `features/scope-system/` — components + `contextItemsSlice` (`state.contextItems`) + `scopeValuesSlice`. **Live** on type/scope/item pages.
- `features/agent-context/redux/scope/` — `scopeTypesSlice` + `scopesSlice` (+ `types.ts`). **Live** type/scope data.
- `features/scopes/` — the "canonical, scaffolded" feature; its service write methods are stubbed `notYetImplemented`.

**Decision:** build on the **live** path; do NOT migrate onto `features/scopes/` now (large, bug-risky).
Add new shared utils under `features/scope-system/`. Consolidation is tracked tech debt.

### RPCs that exist & work (verified via `pg_proc`)
`create_scope_type / update_scope_type / delete_scope_type`, `create_scope / update_scope / delete_scope`,
`create_context_item`, `set_scope_context_value`, `set_context_value(jsonb)`, `list_scope_types`,
`list_scopes`, `list_scope_type_items`, `get_scope_context`, `get_scope_tree`, `get_user_scopes`,
`get_user_scopes_with_projects`, `set_entity_scopes`, `get_entity_scopes`, `search_scopes`,
`list_entities_by_scopes`, `agx_get_user_context_tree`.

Key gotchas:
- `create_scope_type` / `update_scope_type` do **not** carry `color` (the edit sheet persists color via a
  direct table write). They also don't carry `slug` yet.
- `create_context_item` already accepts `description`, `category`, `tags`, `value_type`.
- `update_scope` already accepts `p_settings` (scopes have `settings jsonb`; scope types do not).
- JSON-building list/get RPCs only emit hand-listed columns — **adding a DB column requires editing the RPC** to return it.

### Enums
- `context_value_type`: string, number, boolean, object, array, document, reference (+ `date` being added — Wave 2).
- `context_source_type`: manual, ai_generated, ai_enriched, imported, scraped, system.
- `context_fetch_hint`: always, on_demand, batch_related, lazy, never.
- `context_sensitivity`: public, internal, restricted, privileged.

---

## Full backlog (the user's asks — verbatim intent, organized)

### Task 1 — Human-readable routing (slug OR id at every level)
- Org already resolves by slug-or-id (`getOrganizationBySlugOrId`).
- **Scope types** resolvable by name/slug or id, with **and without** the `scopes` segment:
  - `…/scopes/<typeId>` ✔ today
  - `…/scopes/clients` and `…/clients` (short alias) — to add.
- **Scopes** resolvable by slug or id: `…/scopes/clients/cosmetic-injectables-medspa`.
  - Add a kebab **slug** field; expose a JSON **settings** editor in advanced edit (scopes already have `settings`).
- **Context items** resolvable by slug: `…/clients/cosmetic-injectables-medspa/brand-personality`.
  - Add kebab slug to DB + every relevant UI; auto-generate as an option; validate **unique per scope type** at DB and in UI.
- The item route shows the item's details + its value.

### Task 2 — View / Edit / Advanced-Edit awareness (per level)
Each dynamic level needs coherent VIEW, EDIT, and (where useful) ADVANCED-EDIT surfaces, plus
"up/down" navigation (parent + siblings/children). Awareness first → inventory (below) → build gaps
one at a time. Some surfaces are routes, some are drawers — get organized about which is which.

### Task 3 — Scope-type page polish
1. Icon must render in the **chosen color** (was falling back to a hashed color). ✅ Wave 1
2. Description **below the title**, with the icon. ✅ Wave 1
3. Counts/stats shown under the icon in a **better format** (not a single comma line). ✅ Wave 1
4. Button "Edit scope type" → **"Edit {label_singular} Settings"**. ✅ Wave 1
5. Show the **owning org** at the top; personal orgs shown sensibly. ✅ Wave 1
6. Adding a context item should let you **immediately add another** (Add & Next), like the Edit-Scope-Type flow. ✅ Wave 1
7. Add a **`date`** data type — wired through DB, this codebase, Supabase, and aidream. → Wave 2
8. Inline **advanced** options when adding (Description, Category, Tags) behind a disclosure. ✅ Wave 1
9. Item list: drop the snake_case `key` and the raw data-type; show **category, tags, description** instead.
   Offer **Add**, **Add & Next**, **Cancel**. ✅ Wave 1

### Big Picture (AFTER the above, with further guidance)
- Walk every page ONE BY ONE; solidify VIEW / EDIT / ADVANCED-EDIT.
- Proper **Associations** routes where they make sense:
  - All items for a given scope.
  - For an item: all its properties (normal + advanced).
  - For an item: all its values across all scopes, in one meaningful UI.
  - For an item × scope: the single value, maintained/edited.
- **DB field audit:** reconcile available columns vs what the UI exposes. Some omissions are by choice
  (e.g. parent/child for types & scopes is intentionally deferred); some are accidental and must be fixed.

---

## View / Edit / Advanced-Edit inventory

| Level | VIEW | EDIT | ADVANCED EDIT | Gaps / TODO |
|---|---|---|---|---|
| **Organization** | list `/organizations`; detail `/organizations/[orgId]` | `/organizations/[orgId]/settings` | settings page | no inline edit drawer |
| **Scope type** | `ScopesList` header (`…/scopes/[typeId]`) | `EditScopeTypeSheet` drawer; admin `…/settings/scopes` | sort order, max-assign (sheet) | no dedicated edit route; **+slug**; carry color/slug in RPCs |
| **Scope** | `ScopeDetailEditor` (`…/[typeId]/[scopeId]`); global `/scopes/[scopeId]` (read) | inline name/desc on detail | **none yet** | add settings JSON + slug; no edit drawer/route |
| **Context item** | row in `ScopesList`; `EditContextItemSheet` | `EditContextItemSheet` drawer; inline add | sensitivity, fetch_hint, review, tags (sheet) | no item route; **+slug** (date type ✅ Wave 2) |
| **Context value** | inline in `ScopeDetailEditor`; column in `ScopesList` | `EditScopeValueSheet`; `ScopeFieldInput` | change_summary, source_type | no value route; cross-scope value view (date input ✅ Wave 2) |

---

## Reusable primitives (doctrine: build the platform)

- `features/scope-system/constants/scope-colors.ts` — `SCOPE_COLORS` is the **single** color source; picker iterates it.
- `features/scope-system/components/ScopeColorPicker.tsx` — curated picker bound to `SCOPE_COLORS`.
- `features/scope-system/components/ScopeGlyph.tsx` — stable, case-normalizing scope-type icon.
- `features/scope-system/components/ContextItemAddForm.tsx` — the one inline add form (Add / Add & Next / Cancel + advanced).
- (Wave 3) `features/scope-system/utils/slugify.ts` `toSlug`, resolver selectors, `scopeRoutes.ts` URL builder.

---

## Waves & status

- **Wave 1 — scope-type page polish (frontend only).** ✅ Task 3 #1–#6, #8, #9. Files: `scope-colors.ts`,
  `ScopeColorPicker.tsx`, `ScopeGlyph.tsx`, `ContextItemAddForm.tsx`, `AddContextItemInline.tsx`,
  `ScopesList.tsx`, `ScopeDetailEditor.tsx`, `EditScopeTypeSheet.tsx`, scope-type `page.tsx`.
- **Wave 2 — `date` data type.** ✅ DONE. DB: `context_value_type` += `date`, `value_date date` column on
  `ctx_context_item_values`, RPCs updated (`get_scope_context`, `set_context_value`, `set_scope_context_value`)
  — recorded in `migrations/ctx_add_date_value_type.sql`. FE: `ContextValueType` += `date`,
  `VALUE_TYPE_CONFIG` (Calendar icon), `ScopeContextRow`/thunk/reducer + `useScopeAutoSave` + native date
  inputs in `ScopeFieldInput` & `EditScopeValueSheet` & `ScopesList.renderValue`; legacy `/agent-context/items`
  editor wired too (`ContextItemForm` ValueInput/buildValueData, `ContextValuePreview`, save guards,
  `ContextValueFormData`). aidream `db/models.py` regenerated (DATE enum + `value_date` DateField).
  Verified end-to-end at the DB layer: create date item → `set_scope_context_value(p_value_date)` → stored &
  returned → `get_scope_context` emits `value_date`. Task 3 #7.
- **Wave 3 — slug routing.** ✅ DONE (core). DB: `slug` on `ctx_scope_types` (uniq per org),
  `ctx_scopes` (uniq per type), `ctx_context_items` (uniq per type, active) — backfilled kebab + partial-unique
  indexes (`migrations/ctx_add_slugs.sql`). RPCs: create/update_scope_type (+`p_color`,`p_slug`),
  create/update_scope (+`p_slug`), create_context_item (+`p_slug`) carry slug; `list_scope_type_items` +
  `get_scope_context` emit `slug`; `list_scope_types`/`list_scopes` emit via `to_jsonb`. FE: `toSlug`/`isUuid`
  (`utils/slugify.ts`), `scopeRoutes.ts` URL builder, resolver selectors `selectScopeTypeBySlugOrId` /
  `selectScopeBySlugOrId` / `selectItemBySlugOrId`; `ScopesList` + `ScopeDetailEditor` resolve the route
  segments as slug-or-id and emit slug hrefs; auto-gen slug on create (ContextItemAddForm, NewScopeInline,
  EditScopeTypeSheet rapid-add) and editable slug in advanced edit (EditScopeTypeSheet, EditContextItemSheet).
  Color now persists via the RPC (`p_color`) — the `persistColorIfChanged` direct-write workaround is gone.
  Canonical URL: `/organizations/:org/scopes/:typeSlug/:scopeSlug`. **Follow-up:** the org-overview
  `ScopesManager` and global `ScopeDetailView` (both `features/scopes/`) still emit id hrefs (they resolve
  fine) — slug them when threading slug through the `features/scopes` node types. Scope-slug *editing* UI
  folds into Wave 4 (scope advanced edit alongside settings JSON). Task 1 core.
- **Wave 4 — scope settings JSON + `/scopes`-less alias.** `update_scope` settings editor; Next.js rewrite. Task 1 tail.
- **Wave 5 — item detail route + inventory gaps.** Item detail (`…/:itemSlug`) + cross-scope value view; then
  page-by-page VIEW/EDIT/ADVANCED per the user's further guidance. Big Picture.

---

## Open decisions (revisit if wrong)
1. Build on the live `scope-system` + `agent-context` path; defer `features/scopes/` consolidation.
2. Dedicated `slug` columns (auto-gen on create, stable on rename, editable, validated unique).
3. `value_date date` column for the date type (matches the `value_*` column pattern).
4. Short `/scopes`-less alias via a Next.js rewrite, shipped last and isolated.
5. Settings JSON applies to **scopes** (column/RPC exist); not adding one to scope *types* unless requested.
