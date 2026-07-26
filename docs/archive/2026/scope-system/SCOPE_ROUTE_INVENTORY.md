> ARCHIVED 2026-07-26 — superseded by `common-docs/systems/scope-context-system/FEATURE.md` (the canonical model) + `features/scopes/FEATURE.md` (the FE implementation). Historical record of the pre-`features/scopes` scope-system UI effort.

# Scope / Context / Knowledge — Route Inventory & Consolidation Plan

> Full sweep of every page route across the overlapping families (scope, scopes, ctx,
> context, context-items, agent-context, knowledge) in all route groups. Goal: keep the
> best, link the orphans, merge the duplicates, delete the junk. Companion to
> [`SCOPE_PAGES_MATRIX.md`](./SCOPE_PAGES_MATRIX.md). Generated 2026-06-06 via route-audit agent.

## Canonical — KEEP

| Route | Component | Role |
|---|---|---|
| `/scopes` | ScopesHub | global scope browser (all orgs) |
| `/scopes/[scopeId]` | ScopeDetailView | global scope detail (cross-org) |
| `/scopes/[scopeId]/graph` | KgGraphCanvas | scope knowledge graph |
| `/scopes/templates` | TemplatesGalleryPanel | template catalog |
| `/organizations/[org]/scopes` | ScopesManager | org scope-type hub |
| `/organizations/[org]/scopes/[type]` | ScopesList | scope type hub |
| `/organizations/[org]/scopes/[type]/[scope]` | ScopeDetailEditor | scope hub |
| `/organizations/[org]/scopes/[type]/[scope]/[item]` | ScopeItemDetail | value (item × scope) |
| `/organizations/[org]/scopes/[type]/context-items` | ContextItemsHub (type) | items for a type |
| `/organizations/[org]/scopes/[type]/context-items/[item]` | ContextItemHub | item hub (values across scopes) |
| `/organizations/[org]/scopes/[type]/[scope]/context-items` | ScopeContextItemsHub | one scope's items+values |
| `/organizations/[org]/context-items` | ContextItemsHub (org) | all org items, grouped by type |
| `/context-items` | AllContextItemsHub | all items, all orgs |
| `/organizations/[org]/settings/scopes` | ScopeManagerPage | org scope admin (access/privacy) |
| `/agent-context/hierarchy` | HierarchyTreePage | unique org→project→task tree |
| `GET /api/agent-context-menu` | — | agent shortcut menu (distinct system) |

## LINK — good but orphaned (just need entry points)

| Route | Add link from |
|---|---|
| `/context-items` (all-orgs) | global `/scopes` hub (ScopesHub) + org hub already links org-level — **DOING NOW** |
| `/knowledge-graph` (KnowledgeGraphClient) | nav under Research/Knowledge, or admin — **user's call** |
| `/scopes/templates` (FYI surfacing) | a small "Templates" link on scope-type hub / org scopes overview |

## MERGE / RENAME (needs decisions — touches legacy + shared surfaces)

- `/agent-context/templates` → duplicate of `/scopes/templates` (same `ContextTemplateBrowser`). Merge + redirect.
- `/agent-context/items/[itemId]/edit` + `/history` → fold into `/agent-context/items/[itemId]` (tabs/mode).
- `/scopes/settings` → **stub** (diagnostics + links only; "no actual settings" — user confirmed). Rename to
  `/scopes/admin` (or merge into `/administration/scopes`) to stop implying user settings.
- `/agent-context` legacy hub → becomes a gateway to the org-scoped context routes; deprecate over time.
- `/agent-context/items/*` (view/new) → overlap with the org-scoped `…/context-items/[item]`; prefer org-scoped,
  keep agent-context as fallback or redirect. **This is the biggest overlap to resolve.**
- `/agent-context/analytics` → clarify global vs org; if org-level, move under `/organizations/[org]/...`.

## DELETE — junk/dead

- `/scopes/manage` → hard redirect to `/scopes`; no value (keep only if external bookmarks rely on it).
- SSR demo routes `/(ssr)/demos/context-menu*` → dev-only; not prod nav.

## Recommended order
1. **Now (safe):** link `/context-items` from ScopesHub; surface `/scopes/templates` FYI.
2. **Next (user OK):** rename `/scopes/settings` → `/scopes/admin`; delete `/scopes/manage`.
3. **Bigger (user's domain, coordinate):** consolidate the `/agent-context/*` family into the org-scoped
   routes (templates → /scopes/templates; items → org-scoped; analytics clarify; hub → gateway).
