---
name: component-consolidation
description: Safely consolidate duplicate or redundant components by auditing for unique logic before deletion, updating all consumers, and cleaning up exports/indexes. Use when asked to remove a component in favor of another, eliminate duplicates, reduce two versions of something to one, or clean up redundant UI components.
---

# Component Consolidation

Workflow for safely removing a redundant component when a preferred replacement already exists.

## Phase 1: Read Both Components Fully

Read both the component being kept and the one being removed before touching anything.

**For the component being removed, audit for:**
- Logic that is NOT already present in the keeper
- Unique state management (selectors, local state, computed values)
- Unique props or features that callers depend on
- Unique sub-components, helper functions, or constants defined locally
- Edge case handling (empty states, error states, loading states)
- CSS classes, color maps, or style constants unique to it
- Any behavior the keeper silently omits

**For the component being kept, verify:**
- It already covers everything valuable in the removed component
- Its props/API is compatible (or can be adapted) for all existing callers

Document your findings explicitly — even if the answer is "nothing unique found." This prevents skipping the audit under time pressure.

## Phase 2: Find All Usages

Search broadly — not just direct imports:

```
- Direct imports: `import { ComponentName }` and `from "...ComponentName"`
- Dynamic imports: `dynamic(() => import("...ComponentName"))`
- Index re-exports: `export { ComponentName } from "./ComponentName"`
- String references: Redux slice keys, overlay IDs, config objects
- Documentation: README.md, MODULE_README.md files that reference the file path
```

Categorize each usage as one of:
- **Replace**: swap the old component for the keeper
- **Remove**: caller already uses both side-by-side — just remove the old one
- **Adapt**: keeper has a different API — props need mapping

## Phase 3: Preserve Unique Logic (if any)

If the audit found anything unique in the removed component:

1. Decide where it belongs: into the keeper, into a shared utility, or into each caller
2. Make those changes first, before deleting anything
3. Confirm the logic is live in its new home before proceeding

If nothing unique was found, state that explicitly and move on.

## Phase 4: Update All Consumers

For each usage found in Phase 2:

- **Replace**: update the import path and component name; adapt props if needed
- **Remove**: delete the unused import/render
- **Dynamic imports**: update the import path and the `.then(m => m.ComponentName)` accessor
- **Index/barrel files**: remove the re-export line
- **Redux-dispatched overlays**: update the component rendered by the controller for that overlay key

## Phase 5: Delete the File

Only delete after all consumers are updated. Confirm no live import references remain before deleting.

## Phase 6: Verify No Dangling References

After deletion, search for the removed component's name across the codebase:

- Any remaining imports → fix them (these are bugs)
- Documentation references → note them (stale docs, not bugs)
- Internal variable/function names that echo the old name → rename if confusing, otherwise acceptable

## Callout: Same-Name Components in Different Features

Before treating "find all usages" results as a single set, verify each hit is actually the same component. It is common to have two files with identical names in different feature directories (e.g. `features/agents/.../StreamDebugOverlay.tsx` vs `features/research/.../StreamDebugOverlay.tsx`). These are unrelated — only touch the one being consolidated.

## Output Format

State your findings clearly at each phase:

```
Phase 1 — Audit findings:
  Unique logic in removed component: [list or "none"]
  Keeper already has: [confirm coverage]

Phase 2 — Usages found: N
  - path/to/file.tsx → [Replace / Remove / Adapt]
  - ...

Phase 3 — Logic preserved: [where it went, or "nothing to preserve"]

Phase 4 — Consumers updated: [list of files changed]

Phase 5 — File deleted: path/to/OldComponent.tsx

Phase 6 — Remaining references: [imports: 0 | docs: list]
```
