# Agent shortcut categories — what is actually duplicated, and how to merge it

> Research requested by Arman, 2026-08-24: *"we have something incredible that we create, and we
> decide to share that love with the rest of the app. And the one that gets left behind is the one
> who originally had it. That's the case with agent shortcuts. The only reason we have categories
> is because we had it with agents, and it worked beautifully."*
>
> Status: **research complete, one zero-risk fix applied, the merge itself NOT started.**
> One product decision is open (see the last section) and nothing further should be built until
> Arman rules on it.

## Correction first

An earlier report in this session said agent shortcuts run *"a second category system — its own
table, its own API"*. **The table half of that was wrong**, and the correction matters because it
makes the job far smaller than it sounded.

## What is true, verified live (2026-08-24)

**There is ONE table.** Shortcut categories are `platform.categories` rows with
`dimension = 'shortcut'` — 66 live rows, alongside 27 other dimensions in the same 533-row table.
The data migration already happened: 65 of the 66 rows still carry
`metadata.legacy_table = 'shortcut_categories'`, and 62 carry `legacy_id`, from the move off the
old table. That old table no longer exists in any schema.

**The link is sound.** `agent.shortcut.category_id` is NOT NULL, and all **207** live shortcuts
point at a `dimension='shortcut'` category. Zero strays, zero dangling ids.

**The data already obeys the canonical rules.** 46 root categories, 20 children, **no
grandchildren and no orphans** — it already satisfies the two-level guard the canonical primitive
enforces. *A merge therefore needs no data reshaping at all.*

## The duplication is entirely in CODE, in three layers

| Layer | Shortcut path | Canonical path |
|---|---|---|
| Read | `GET /api/agent-shortcut-categories` — a Next route doing a **direct** `platform.categories` select | `cat_list(dimension)` RPC via `useCategories` |
| Write | the same route doing a **direct table insert**, bypassing `cat_create` and its governance | `cat_create` / `cat_update` / `cat_reparent` / `cat_delete` |
| Wire shape | a legacy row (`label`, `sort_order`, `parent_category_id`, `is_active`, …) translated at the boundary by `app/api/agent-shortcut-categories/_lib/categoryRow.ts` | `PlatformCategory` (`name`, `position`, `parent_id`) |
| State | its own Redux slice, `features/agents/redux/agent-shortcut-categories/` | `useCategories` |
| Picker | `features/agent-shortcuts/components/CategorySelect.tsx` (393 lines) | `features/scopes/components/CategorySelect.tsx` |

Two shortcut EDITORS consume that forked picker, and **both are live and routed** — `ShortcutForm`
(`/agents/shortcuts` user scope, `/organizations/[orgId]/shortcuts` org scope) and
`ShortcutEditorNext` (`/agents/[id]/shortcuts/new` and `/[shortcutId]`). Neither is dead code.
`features/agents/mandates/FEATURE.md` already names them "both agent-shortcut forks".

## FIXED 2026-08-24 — a trap in the canonical constant

`CATEGORY_DIMENSIONS.agentShortcut` was `"agent-shortcut"`. **That dimension has zero rows.** The
live one is `"shortcut"`. No caller had used the constant yet, so it had never broken anything —
but the first person to point the canonical picker at it would have got a silently empty dropdown
and no error at all. Corrected to `"shortcut"`, with the evidence recorded beside it.

## The four genuine differences to resolve

Everything else is naming. These are real:

1. **`placement_type`** — a REAL COLUMN on `platform.categories`, used by nothing but shortcuts
   (65 of 66 rows: 32 `content-block`, 26 `ai-action`, 3 `user-tool`, and one each of
   `organization-tool`, `button`, `card`, `quick-action`). `cat_list` does not return it and
   `cat_create` does not accept it, so the canonical path cannot serve shortcuts today.
2. **Scope below the organization** — 8 rows are user-scoped, 3 project-scoped, 3 task-scoped, via
   `metadata.user_id` / `project_id` / `task_id`. The canonical model is organization-scoped only.
3. **`is_active`** (in metadata on 65 rows) — an on/off the canonical model has no concept of.
   Canonical categories are either present or soft-deleted.
4. **`enabled_features`** (in metadata on 65 rows) — shortcut-specific payload.

## The merge, in shippable phases

Each phase stands alone, changes no data, and is reversible. Nothing here needs downtime.

- **Phase 1 — the constant.** ✅ done (above). Zero consumers, zero behaviour change.
- **Phase 2 — widen the canonical reader/writer (additive).** Add `placement_type` to `cat_list`'s
  return and to `cat_create` / `cat_update`. Precedent and exact shape: `migrations/cat_list_metadata.sql`,
  which widened the same function for `deal_pipeline` on 2026-08-20 for identical reasons — a
  return-type change needs DROP + CREATE and the grants must be restated. Every existing consumer
  selects named fields, so nothing breaks.
- **Phase 3 — teach the ONE picker what the fork knows.** The canonical `CategorySelect` needs
  three optional props to cover the fork: grouping (placement sections with headers), a filter
  (single-placement mode), and an exclude list (a category cannot be its own parent). All three are
  presentation/filtering — no new data path. This is exactly the shape Arman asked for: one
  component, arguments that tell it what to render.
- **Phase 4 — move the state.** Point the shortcut Redux slice at `useCategories`. The legacy API's
  only remaining job is scope filtering, which becomes a client filter over `metadata`.
- **Phase 5 — delete.** The legacy route, `_lib/categoryRow.ts`, the forked picker, the slice.
  Nothing is left behind, per the no-legacy policy.

**Blast radius if all five land:** one dropdown behaves identically in both shortcut editors and
in the other ~12 canonical category surfaces; 207 shortcuts and 66 categories keep their exact
rows and ids. No FK moves, because a dimension value is not an id.

## THE OPEN DECISION — Arman's call, and nothing should be built before it

`is_active` and the user/project/task scoping are semantics the canonical model does not have.
Two honest options:

- **Leave them in `metadata`.** Works today, costs nothing, and keeps the canonical model simple —
  but shortcut categories stay slightly special forever, and any future canonical surface that
  renders them will ignore an "off" category.
- **Promote them into the canonical model for everyone** — an `is_active` on every category, and
  scope below the organization as a first-class idea. Bigger, and it changes what a category *is*
  for all 28 dimensions.

This is a product question about what a category means, not an engineering one, which is why it is
sitting here rather than being decided by whoever picks this up.
