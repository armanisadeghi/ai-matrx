---
status: active
updated: 2026-07-07
repos: [matrx-frontend]
---

# Context / Scope-Assignment Rollout

The ContextAssignment system (tag entities to scopes; set/filter by active context) is built and
wired across Files / PDF / RAG / sidebar / Chat / Transcripts / Notes / Knowledge graph. Storage is
fully canonical: **scope tags live on `platform.associations`** — `ctx_scope_assignments` is
graveyarded (see `features/scopes/FEATURE.md`, 2026-06-24/25 entries).

## Vision

- Knowledge-graph deep scope↔node integration: Arman called it **the biggest win** of the whole rollout. (inferred phrasing — no verbatim doc; confirm scope with him before designing.)
- Header-level context indicator: Arman has ideas; waiting on his direction.

## Resources

- Skill: `context-assignment` (mental model + component table) — read first.
- `features/scopes/FEATURE.md` — canonical; its change log holds the association-migration record.
- Core field: `features/scopes/components/context-assignment/ContextAssignmentField.tsx` (+ Popover/Dialog/Window wrappers, `ContextSummaryChips`, `ContextStatusButton`, `UploadContextPrompt`, `data.ts` caches).
- Surface A (global-context writers) is now `features/scopes/components/active-context/`: `ActiveContextTree`, `ActiveContextPanel`, `ActiveScopeChips`, `ActiveContextLayersPanel`, `ContradictionBanner`, `ClearContextButton`. (`ActiveScopePicker` / `DirectContextSelection` no longer exist.)
- Writes: `scopesService.setEntityScopes`; global state: `lib/redux/slices/appContextSlice.ts`.
- Demo lab: `/demos/scopes/context-lab`.

## Remaining work

1. **Wire the two stranded write sites.** Both still log-and-toast, waiting on a "ctx_associations migration" that effectively shipped as `platform.associations` — route them through `scopesService.setEntityScopes`:
   - `features/files/components/FileContextSection.tsx:13`
   - `features/scopes/components/context-assignment/UploadContextPrompt.tsx:85`
2. **Knowledge-graph deep integration** — direct scope↔node assignment / scope nodes in the graph. Design not started; the biggest-win item above.
3. **Notes local multi-scope FILTER UI** — the field's `filter` mode is built; `NoteSidebar` still filters via active context only. Mount the filter mode + bulk scope read for the orphan hint.
4. **Header-level context indicator** — blocked on Arman's direction (see Vision).

## Done

- Full component family + all nine surfaces wired — see `features/scopes/components/context-assignment/` and `features/scopes/FEATURE.md`.
- Storage migrated to `platform.associations`; `ctx_scope_assignments` graveyarded (FEATURE.md 2026-06-24/25).

## Decisions needed

**Active-context cardinality.**
Situation: The original build made active context true multi-scope ("one-per-type cardinality is GONE — do not reintroduce"), but current code enforces one scope per type (addActiveScope replaces same-type). Unclear if this reversal was your decision or an agent regression.
Decide: keep one-scope-per-type, or restore multi-scope.
