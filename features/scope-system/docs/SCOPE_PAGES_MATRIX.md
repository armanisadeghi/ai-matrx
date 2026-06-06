# Scope System — Pages Matrix (the tracking list)

> The single checklist of **every page** the scope system needs, at every level, so we
> stop missing surfaces. Companion to [`SCOPE_UI_OVERHAUL.md`](./SCOPE_UI_OVERHAUL.md).
> Status: ✅ exists · 🟡 partial (drawer-only / inline / legacy) · ❌ missing.

## 1. The mental model (kills the confusion)

The confusion is **editing a THING vs editing the VALUE of a thing for a nested scope.**
They are different pages.

```
Organization
  └─ owns → Scope TYPE        ("Clients")           ← a THING (a dimension)
              ├─ owns → Context ITEM ("Brand Personality")  ← a THING (a field, shared by all clients)
              └─ owns → SCOPE        ("Cosmetics Injectables Medspa")  ← a THING (one client)
                          └─ has → VALUE  = (Context ITEM × SCOPE)      ← the cell, NOT a thing of its own
```

- A **Context Item** ("Brand Personality") is **one shared definition** living on the scope type.
- A **Value** ("Cosmetics Injectables Medspa's Brand Personality") is the **cell** for one item × one scope.
- Editing **the item** changes it for *every* client. Editing **a value** changes it for *one* client.

## 2. Page archetypes (apply to every THING)

| Archetype | What it is | Permission |
|---|---|---|
| **List** | the collection of these things (with quick add / reorder) | view: all · structural edit: admin |
| **View** | one thing + **all its nested dimensions** (children/values shown as rows) | all |
| **Edit (route)** | the thing's **own settings only** — *not* its nested values; a real page, not a drawer | admin (structural) / member (instance) |
| **Edit (drawer)** | optional quick-edit accelerator; every drawer must have a route equivalent | same as route |

The **value** is not a THING — it gets a View/Edit page as `(item × scope)`, but no "list/settings" of its own.

---

## 3. Canonical org-bound route tree (BUILD THESE FIRST)

```
/organizations/[org]/scopes
 │   View: all scope types for the org                              ✅ ScopesManager
 ├─ /edit            Edit/manage all types (reorder, bulk)          🟡 reorder dialog in-page; no route
 └─ /[type]                                                          ("Clients")
     │   View: the scope type (scopes table + items + counts)       ✅ ScopesList
     ├─ /edit         Edit the TYPE's own settings (route)          🟡 drawer EditScopeTypeSheet; no route
     ├─ /context-items
     │   │   View: all context items for this type (interact)       🟡 list inside ScopesList; no route
     │   ├─ /edit     Edit ALL items as a whole (reorder/manage)    🟡 reorder dialog; no route
     │   └─ /[item]                                                  ("Brand Personality")
     │       │   View: THE ITEM — its settings at top, then each    ❌ KEY MISSING PAGE
     │       │   scope listed with its current value (view/edit)
     │       └─ /edit Edit the ITEM's own settings (route)          🟡 drawer EditContextItemSheet; no route
     └─ /[scope]                                                     ("Cosmetics Injectables Medspa")
         │   View: the scope + its values                           ✅ ScopeDetailEditor (view+edit combined)
         ├─ /edit     Edit the SCOPE's own settings (route)         🟡 inline + ScopeAdvancedSection; no route
         └─ /[item]
             View/Edit: the VALUE for this scope × item             ✅ ScopeItemDetail
             (/edit optional — view currently is the editor)        🟡 view == edit
```

**The #1 gap** the user called out: `/[type]/context-items/[item]` — the item's own page showing
**all clients' values for that item** (e.g. Brand Personality across every client), with view/edit per
client that deep-links into the existing value page `…/[scope]/[item]`.

> Route note: `context-items` is a literal segment, so it never collides with `[scope]`. Reserve the
> slugs `context-items` and `edit` so no scope/item can take them.

---

## 4. Direct / cross-nested routes (PHASE 2 — after the nested pages are real)

| Route | Purpose | Status |
|---|---|---|
| `/scopes` | all scopes across all orgs (index) | ✅ `ScopesHub` |
| `/scopes/[scopeId]` | global scope detail (by id) | ✅ `ScopeDetailView` — ⚠️ collides with a future `/scopes/[typeSlug]` |
| `/scopes/[type]` | one scope type across orgs ("all my clients") | ❌ (conflicts with `[scopeId]` — needs design) |
| `/scopes/[type]/context-items` | all items for a type | ❌ |
| `/context-items` | all context items, all scopes (grouped by type) | ❌ (legacy `/agent-context` dashboard is the closest) |
| `/context-items/[item]` | item detail + values across scopes | ❌ (legacy `/agent-context/items/[itemId]`) |
| `/context-items/[item]/edit` | edit item settings (route) | ❌ (legacy `/agent-context/items/[itemId]/edit`) |

---

## 5. Legacy `/agent-context/*` to reconcile (already exists, old UI)

| Route | Component | Maps to | Decision |
|---|---|---|---|
| `/agent-context` | `ContextDashboard` + `ContextItemList` | `/context-items` (all items) | migrate → scope-system, redirect |
| `/agent-context/items/[itemId]` | `ContextItemDetail` | `/context-items/[item]` (item view) | migrate → scope-system, redirect |
| `/agent-context/items/[itemId]/edit` | legacy edit | item `/edit` route | migrate, redirect |
| `/agent-context/items/[itemId]/history` | version history | item view → "History" tab | fold in |
| `/agent-context/items/new` | create | item create | fold into list "Add" |

These prove the *routes* are wanted; they're just the old agent-context styling, item-by-id (no
org/type/scope context), and don't show values-across-scopes.

---

## 6. Build order (proposed)

- **Wave A — Context Item View (the KEY page):** `/[type]/context-items` (list) +
  `/[type]/context-items/[item]` (item view: settings header → per-scope value rows, each deep-linking
  to the existing value page). Highest user value.
- **Wave B — Dedicated Edit routes:** `/[type]/edit`, `/[type]/context-items/[item]/edit`,
  `/[scope]/edit` — each reuses the existing drawer form logic, just hosted on a route. Keep drawers as
  quick accelerators that link to "Open full editor".
- **Wave C — Edit-all routes:** `/scopes/edit` (manage types), `/[type]/context-items/edit` (manage items).
- **Wave D — Direct routes (Phase 2):** `/context-items`, `/context-items/[item]`, `/scopes/[type]`,
  resolving the `/scopes/[scopeId]` vs `[typeSlug]` collision; then retire legacy `/agent-context/*`.

## Open design questions (confirm before building)
1. Segment name `context-items` for item-definition pages — good, or prefer `fields` / `items`?
2. Edit routes should **reuse** the existing drawer forms (`EditScopeTypeSheet`, `EditContextItemSheet`,
   `ScopeAdvancedSection`) hosted full-page — agreed?
3. Scope View vs Edit: split `ScopeDetailEditor` into a read-first View + a `/edit` route, or keep the
   combined inline editor as the "View" and add `/edit` as the focused settings page?
4. Legacy `/agent-context/*`: migrate + redirect into the scope routes (Wave D), or leave for now?
