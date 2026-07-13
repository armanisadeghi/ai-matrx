---
status: active
updated: 2026-07-12
repos: [matrx-frontend]
---

# Context / Scope-Assignment Rollout

The ContextAssignment system (tag entities to scopes; set/filter by active context) is built and
wired across Files / PDF / RAG / sidebar / Chat / Transcripts / Notes / Knowledge graph. Storage is
fully canonical: **scope tags live on `platform.associations`** — `ctx_scope_assignments` is
graveyarded (see `features/scopes/FEATURE.md`, 2026-06-24/25 entries).

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
  `ActiveContextTree`, `ActiveContextPanel`, `ActiveScopeChips`, `ActiveContextLayersPanel`,
  `ContradictionBanner`, `ClearContextButton`.
- Writes: `scopesService.setEntityScopes`; global state: `lib/redux/slices/appContextSlice.ts`
  (`addActiveScope`/`removeActiveScope` are additive — no same-type eviction).
- Demo lab: `/demos/scopes/context-lab`.

## Remaining work

1. **Knowledge-graph deep integration** — direct scope↔node assignment / scope nodes in the graph.
   Design not started; the biggest-win item above.
2. **Notes local multi-scope FILTER UI** — the field's `filter` mode is built; `NoteSidebar` still
   filters via active context only. Mount the filter mode + bulk scope read for the orphan hint.
3. **Header-level context indicator** — blocked on Arman's direction (see Vision).

## Done

- Legacy hierarchy-selection family converted to MULTI-SCOPE (2026-07-12): `useHierarchySelection`
  is id-keyed with additive `toggleScope`/`clearScopeType`; Cascade/Tree/Pills use checkbox
  semantics with "+N" multi display; `useReduxBridge` diffs to `addActiveScope`/`removeActiveScope`;
  `AgentAppHierarchyCascade` drops first-wins trimming. Dead variants deleted outright
  (`HierarchyBreadcrumb`/`HierarchyHoverMenu`/`HierarchyCommand`/`SidebarContextSelector` — no live
  route rendered them).
- Full component family + all nine surfaces wired — `features/scopes/components/context-assignment/`.
- Storage migrated to `platform.associations`; `ctx_scope_assignments` graveyarded (FEATURE.md 2026-06-24/25).
- Multi-scope active context restored (2026-07-07, Arman-ruled regression): additive slice actions,
  checkbox semantics in `ActiveContextTree`/`TasksContextSidebar`, id-keyed readers, ambient path
  ships all scopes — `lib/redux/slices/appContextSlice.ts`, `features/scopes/FEATURE.md` change log.
- Both stranded write sites persist via `platform.associations` (2026-07-07) —
  `UploadContextPrompt.tsx` (real per-file `setTargets` writes), `FileContextSection.tsx` (was
  already wired; stale comment removed).
