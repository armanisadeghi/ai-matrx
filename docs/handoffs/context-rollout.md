---
status: active
updated: 2026-07-28
repos: [matrx-frontend]
vision: [features/scopes/FEATURE.md]
---

# Context / Scope-Assignment Rollout

The ContextAssignment system (tag entities to scopes; set/filter by active context) is built and
wired across Files / PDF / RAG / sidebar / Chat / Transcripts / Notes / Knowledge graph. Storage is
canonical: **scope tags live on `platform.associations`** — `ctx_scope_assignments` is graveyarded.

## Vision — Arman's words

- Multi-scope is the law (2026-07-07): "Scope is not limited to just one... if I'm working on
  'SALES' for Client X that is two scopes! And if I'm selling a product, now it's 3 and you throw
  a product in there and it's 4!" One-per-type is a regression pattern — never reintroduce.
- Knowledge-graph deep scope↔node integration: Arman called it **the biggest win** of the whole
  rollout. (inferred phrasing — no verbatim doc; confirm scope with him before designing.)
- Header-level context indicator: Arman has ideas; waiting on his direction.

## Resources

- Skill: `context-assignment` (mental model + component table) — read first.
- `features/scopes/FEATURE.md` — canonical; its change log holds the association-migration record
  and the 2026-07-07 multi-scope restore.
- Core field: `features/scopes/components/context-assignment/ContextAssignmentField.tsx`
  (+ Popover/Dialog/Window wrappers, `ContextSummaryChips`, `ContextStatusButton`,
  `UploadContextPrompt`, `data.ts` caches).
- Surface A (global-context writers): `features/scopes/components/active-context/` —
  `ActiveContextTree`, `ActiveContextPanel`, `ActiveContextButton`, `ActiveContextLensChip`,
  `ContextLensBar`, `ActiveScopeChips`, `ActiveContextLayersPanel`, `ContradictionBanner`,
  `ClearContextButton`.
- Writes: `scopesService.setEntityScopes`; global state: `lib/redux/slices/appContextSlice.ts`
  (`addActiveScope`/`removeActiveScope` are additive, id-keyed — no same-type eviction).
- Demo lab: `/demos/scopes/context-lab`.

## Remaining work

1. **Knowledge-graph deep integration** — direct scope↔node assignment / scope nodes in the graph.
   The graph page today only *filters* by working context (`ActiveContextButton` in the
   `PageHeader` of `app/(core)/knowledge/graph/page.tsx`, plus `?scope=`/`?scopeType=` deep links);
   nothing in `features/knowledge/**` writes or reads a per-node scope. Design not started; this is
   the biggest-win item above.
2. **Notes local multi-scope FILTER UI** — the field's `filter` mode is built, but `NoteSidebar`
   still derives its scope filter purely from the global active context
   (`selectScopeSelectionsContext` → `useEntitiesByScopes`, `features/notes/components/NoteSidebar.tsx`
   ~line 174). Mount the filter mode locally + a bulk scope read for the orphan hint.
3. **App-shell header context indicator** — still awaiting Arman's direction. Note the chat-side
   face already shipped (`ActiveContextLensChip` in `ChatRunHeader`, `QuicksetPanel`, war-room
   header; `ContextLensBar` in the composer's `PlusAttachMenu`), so the open question is narrowed
   to the global shell header specifically.

## Done

- Full component family + all nine surfaces wired — `features/scopes/components/context-assignment/`.
- Storage migrated to `platform.associations`; `ctx_scope_assignments` graveyarded (FEATURE.md 2026-06-24/25).
- Multi-scope active context restored (2026-07-07, Arman-ruled regression) — additive id-keyed slice
  actions, checkbox semantics, ambient path ships all scopes; verified still intact 2026-07-28.
- Legacy hierarchy-selection family converted to MULTI-SCOPE (2026-07-12); dead variants deleted
  (`HierarchyBreadcrumb`/`HierarchyHoverMenu`/`HierarchyCommand`/`SidebarContextSelector`).
- Both stranded write sites persist via `platform.associations` — `UploadContextPrompt.tsx`,
  `FileContextSection.tsx`.
