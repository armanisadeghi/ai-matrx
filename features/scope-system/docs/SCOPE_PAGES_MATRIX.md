# Scope System — Pages Matrix (the tracking list)

> The single checklist of **every page** the scope system needs. The key realization:
> there is **one uniform pattern** that repeats at every level — Org → Scope Type → Scope →
> Context Item → Value. We stop missing pages by applying the same surface set to each.
> Status: ✅ exists · 🟡 partial (drawer/inline/legacy, no route) · ❌ missing.

## 1. Mental model

Every level is BOTH a *thing its parent manages* AND the *owner of a nested system*:

```
User → ORG ("Titanium")
         └─ owns → SCOPE TYPE ("Clients")          ← a thing, and owns TWO nested systems:
                     ├─ owns → CONTEXT ITEM ("Brand Personality")   (a field, shared by all clients)
                     └─ owns → SCOPE ("Cosmetics Injectables Medspa") (one client)
                                 └─ has → VALUE = (ITEM × SCOPE)      ← the cell, not a thing
```

Editing **a thing** = its own settings (affects it / all its children).
Editing **a value** = one cell (one item for one scope).

## 2. The uniform surface set (the "Hub" pattern)

For **every thing type T** (Org, Scope Type, Scope, Context Item), we need the same surfaces.
The **Organization** level is the gold standard — copy it everywhere.

| Surface | Meaning | Org gold-standard | Route convention |
|---|---|---|---|
| **Collection Hub** | view ALL T (list, add, drill, link to manage) | `/organizations` | `/{things}` |
| **Collection Manage** | edit/reorder/bulk ALL T | (org: n/a) | `/{things}/manage` |
| **Add one** | create one T (drawer + page) | "New org" | `/{things}/new` (+ drawer) |
| **Thing Hub** (view one) | the thing + parent (up) + children (down), drill down | `/organizations/titanium` ⭐ | `/{thing}` |
| **Thing Manage** (edit one) | the thing's OWN settings — normal + advanced (drawer + page) | `/organizations/titanium/settings` ⭐ | `/{thing}/edit` |

> "Hub" = **view** (and navigate). "Manage" = **edit**. A Hub for a thing that owns a nested system
> must surface that system with its own add / manage / drill buttons. A Scope-Type Hub ("Clients Hub")
> surfaces **two** nested systems (its context items AND its scopes) — that's the dynamic complexity.

## 3. Per-level instantiation (with status)

### Level 1 — Organization  (parent: user · children: scope types, projects, members…)
| Surface | Route | Status |
|---|---|---|
| Collection Hub (all orgs) | `/organizations` | ✅ |
| Org Hub (view one) | `/organizations/[org]` | ✅ ⭐ best hub we have |
| Org Manage (edit one) | `/organizations/[org]/settings` | ✅ ⭐ best manage we have |

### Level 2 — Scope Type ("Clients")  (parent: org · children: context items + scopes)
| Surface | Route | Status | Now |
|---|---|---|---|
| Collection Hub (all types) | `/organizations/[org]/scopes` | ✅ | ScopesManager |
| Collection Manage (manage all types) | `/organizations/[org]/scopes/manage` | 🟡 | reorder dialog only |
| Type Hub (view "Clients") | `/organizations/[org]/scopes/[type]` | ✅ | ScopesList (surfaces both nested systems) |
| Type Manage (edit "Clients") | `/organizations/[org]/scopes/[type]/edit` | 🟡 | drawer EditScopeTypeSheet — **no route** |

### Level 3a — Scope ("Cosmetics Injectables Medspa")  (parent: scope type · children: values)
| Surface | Route | Status | Now |
|---|---|---|---|
| Collection Hub (all clients) | `/organizations/[org]/scopes/[type]/scopes` *(or the Type Hub's table)* | 🟡 | table inside Type Hub — **no dedicated route** |
| Scope Hub (view "Medspa") | `/organizations/[org]/scopes/[type]/[scope]` | ✅ | ScopeDetailEditor (view+edit combined) |
| Scope Manage (edit "Medspa") | `/organizations/[org]/scopes/[type]/[scope]/edit` | 🟡 | inline + ScopeAdvancedSection — **no route** |

### Level 3b — Context Item ("Brand Personality")  (parent: scope type · children: values across scopes)
| Surface | Route | Status | Now |
|---|---|---|---|
| Collection Hub (all items for type) | `/organizations/[org]/scopes/[type]/context-items` | ✅ | `ContextItemsHub` (Wave A) |
| Collection Manage (manage all items) | `/organizations/[org]/scopes/[type]/context-items/manage` | 🟡 | reorder dialog (in collection hub) |
| Item Hub (view "Brand Personality") | `/organizations/[org]/scopes/[type]/context-items/[item]` | ✅ | `ContextItemHub` (Wave A) — settings + value per scope |
| Item Manage (edit "Brand Personality") | `/organizations/[org]/scopes/[type]/context-items/[item]/edit` | 🟡 | drawer EditContextItemSheet — route is Wave B |

### Level 4 — Value  (item × scope — a cell, not a thing)
| Surface | Route | Status |
|---|---|---|
| Value View/Edit | `/organizations/[org]/scopes/[type]/[scope]/[item]` | ✅ ScopeItemDetail |

## 4. The "felt-missing" navigation (buttons that connect the hubs)

On the **Type Hub** (`/…/scopes/clients`) today, these connectors are missing:
- Next to **"Context Items"** → a **Manage / Open** button → the Context-Items Collection Hub (`…/context-items`); each item row → its **Item Hub** (`…/context-items/[item]`).
- Next to the **scopes table** → a **"Manage {plural}"** link → the Scopes Collection Hub (`…/scopes` or a manage page).
- A **route** (not just the drawer) to **Manage "Clients"** itself (`…/[type]/edit`).

Every Hub should expose: **up** (parent), **down** (each child system with add + manage + drill), and **edit this** (route + drawer).

## 5. Phase 2 — direct / cross-nested routes (after the nested hubs are real)
| Route | Purpose | Status |
|---|---|---|
| `/scopes` | all scopes, all orgs | ✅ ScopesHub |
| `/scopes/[scopeId]` | global scope hub (by id) | ✅ ScopeDetailView — ⚠️ collides with `/scopes/[typeSlug]` |
| `/scopes/[type]` | a scope type across orgs | ❌ (needs collision design) |
| `/context-items` · `/context-items/[item]` · `/[item]/edit` | items across scopes | ❌ (legacy `/agent-context/*` is the closest) |

## 6. Legacy `/agent-context/*` (old item UI — reconcile in Phase 2)
`/agent-context` (`ContextDashboard`+`ContextItemList`) ≈ `/context-items`; `/agent-context/items/[itemId]`
(`ContextItemDetail`) ≈ item Hub; `+/edit`, `+/history`, `+/new`. Migrate into the scope structure + redirect.

## 7. Build order

- **Wave A — DONE ✅** — `…/context-items` (`ContextItemsHub`) + `…/context-items/[item]` (`ContextItemHub`:
  item settings header + Details + every scope's value inline-editable, deep-linking to the value page).
  Type Hub now links "Context Items" + each item name → the new pages. Reserved slugs added
  (`context-items`/`scopes`/`edit`/`manage`/`new`/`settings`); not-found states on the new routes.
- **Wave A.2 — DONE ✅ (one component, two scopes)** — `ContextItemsHub` generalized: with `typeParam` it
  shows one type's items (full manage); without, it shows **every scope type in the org grouped into
  sections** — the new route `/organizations/[org]/context-items`. Dropping the type filter forces the
  scope-type headers (which also fixes "show me which dimension I'm in").
- **Wave A.3 — DONE ✅ (all four context-items levels + link/terminology cleanup)** —
  - **All four scopes of `/context-items` now exist:** all-orgs `/context-items` (`AllContextItemsHub`,
    iterates `selectFullContextOrganizations`, grouped org → type → items); org `/organizations/[org]/context-items`;
    type `…/scopes/[type]/context-items`; **scope `…/scopes/[type]/[scope]/context-items`** (`ScopeContextItemsHub`,
    one scope's items + values as a dedicated page, distinct from the scope hub).
  - **Orphan routes linked** (found via parallel route-audit agents): org hub (`OrgWorkspace`) "Context & Scopes"
    header now links **Scope Type Hub** (`/[org]/scopes`) + **Context items** (`/[org]/context-items`) — both were
    previously unreachable except via settings/edit.
  - **Terminology fixed** ("Scope" → "Scope Type" where it creates a dimension): `OrgWorkspace`, `AddScopeModal`
    (title/desc/button), `ScopesManager` (×2), `AddScopeTypeCard`.
  - **Still orphaned / to consolidate** (route-inventory agent running): `/scopes/templates`, `/scopes/settings`
    (stub), the `/agent-context/*` family — Wave D consolidation.
- **Wave B — Manage routes (single thing):** `…/[type]/edit`, `…/context-items/[item]/edit`, `…/[scope]/edit`
  — host the existing drawer forms full-page (drawers stay as quick accelerators linking to "open full editor").
- **Wave C — Collection Manage + Scopes Collection Hub:** `…/scopes/manage`, `…/[type]/scopes`,
  `…/context-items/manage`.
- **Wave D — Phase 2 direct routes** + retire legacy `/agent-context/*`.

## Open confirmations
1. Route words: **Hub = `/{thing}` (view)**, **Manage = `/{thing}/edit` (edit settings)** — or do you prefer
   `/manage` or `/settings` to match the org's `/settings`?
2. Reserved slugs `context-items`, `scopes`, `edit`, `manage`, `new` (so no scope/item can take them) — ok?
3. Edit routes **reuse** the existing drawer forms hosted full-page — agreed?
4. Build order above — start at Wave A?
