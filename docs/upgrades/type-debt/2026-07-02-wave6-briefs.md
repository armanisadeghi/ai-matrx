# Wave 6 fleet decision briefs — 2026-07-02 (wf_46d63e4a-b8d)

### BRIEF 1: features/scraper/utils/json-path-navigation-util.ts:19 — duplicate-type-shape
**data:** PathBookmark shape for saved/imported JSON-path bookmarks
**producedBy:** createPathBookmark, importBookmarks in features/scraper/utils/json-path-navigation-util.ts
**consumedBy:** features/scraper/parts/BookmarkViewer.tsx (hand-declares its own local `PathBookmark` interface: {path, segments: {type:string;value:string}[], name, description?} — missing id/createdAt)
**conflict:** Two independent PathBookmark type declarations for the same runtime object; the canonical one's index-segment value is numeric while the consumer's local copy assumes value:string. Kept both compiling by loosening the canonical segments field to `{type:string; value:string}[]` and giving getValueByBookmark a minimal `{path:string}` parameter type instead of the full PathBookmark.
**decisionNeeded:** Should BookmarkViewer.tsx's local PathBookmark be deleted and replaced with an import of the canonical PathBookmark from json-path-navigation-util.ts (now exported)? That would also let importBookmarks's return type be trusted directly instead of assigned into a structurally-similar-but-distinct local type.
**Status:** PENDING

### BRIEF 2: features/scraper/utils/json-path-navigation-util.ts:201 — unvalidated-external-data
**data:** importBookmarks(jsonString) parses arbitrary user-pasted JSON text and returns it typed as PathBookmark[] via a plain `as PathBookmark[]` cast, with zero runtime shape validation
**producedBy:** user paste box in features/scraper/parts/BookmarkViewer.tsx (handleImport)
**consumedBy:** setBookmarks(imported) in BookmarkViewer.tsx, then rendered directly (bookmark.name, bookmark.path, bookmark.segments) and passed to getValueByBookmark
**conflict:** Pre-existing behavior (not introduced by this wave) trusts unvalidated pasted JSON as a typed bookmark array; a malformed paste (e.g. array of strings, or objects missing `path`) will render blank/garbled instead of failing loudly.
**decisionNeeded:** Should importBookmarks add a real runtime shape check (each entry has string path/name, array segments) and drop entries that fail, surfacing a toast/error count instead of silently rendering broken bookmark cards? Left as-is (behavior preserved) since fixing requires touching BookmarkViewer.tsx, outside this file bundle.
**Status:** PENDING

### BRIEF 3: components/ui/samples/accordion.tsx:172 — dead-callsite/no-op-animation
**data:** props['data-state'] read inside MatrxAccordionTrigger to drive a framer-motion rotate animation on the trigger icon
**producedBy:** Radix's AccordionPrimitive.Trigger, which sets data-state as a DOM attribute on the rendered element (used only for CSS selectors like data-[state=open]:...) — it is not exposed back to the React consumer via props.
**consumedBy:** motion.div animate={{ rotate: props['data-state'] === 'open' ? 90/180 : 0 }} inside MatrxAccordionTrigger
**conflict:** No caller anywhere in the repo renders MatrxAccordionTrigger (zero importers of components/ui/samples/accordion.tsx), and even if one did, nothing ever passes a `data-state` prop into it — Radix sets that attribute on the DOM node it renders, not as an incoming prop consumers can read. So props['data-state'] is always undefined and the chevron rotation animation is permanently dead (icon never actually rotates open/closed).
**decisionNeeded:** I widened the trigger's prop type to accept an optional 'data-state' so the TS7053 index error is now type-honest, but I did not fix the underlying dead animation (no live caller to verify against, and the correct fix requires wiring real open/closed state from AccordionPrimitive.Item context, which is a design change beyond an implicit-any pass). Decide whether to wire real state tracking or delete this unused sample component.
**Status:** PENDING

### BRIEF 4: features/applet/constants/field-constants.tsx:576 — incomplete-coverage-table
**data:** componentCompatibility: Partial<Record<ComponentType, string[]>> only defines 24 of the 34 ComponentType variants (missing buttonSelection, buttonColumn, draggableTable, draggableEditableTable, dragEditModifyTable, dragTableRowAndColumn, numberInput, stepperNumber, multiSearchableSelect, conceptBrokerOptions)
**producedBy:** features/applet/constants/field-constants.tsx (hand-authored table)
**consumedBy:** getRelevantComponentProps / getVisiblePropsForComponentType in the same file — currently ZERO importers repo-wide (dead code)
**conflict:** if these two functions are ever wired up, any of the 10 missing component types silently gets an empty compatible-props list via the `|| []` fallback instead of a real list
**decisionNeeded:** since both consuming functions are unused today, no runtime impact — decide whether to (a) leave as Partial (honest, ships today) until someone wires the functions up and fills the gaps, or (b) backfill the missing 10 entries now as part of finishing this dead scaffolding. I left it as (a): typed honestly as Partial, deleted the one invalid `button` key (not a ComponentType member, was dead/unreachable data).
**Status:** PENDING

### BRIEF 5: config/ui/density.tsx:1 — dead-code
**data:** Entire file: globalDensitySettings/componentSettings/layoutSettings/DensityProvider/useDensity/ExampleCard/ExampleComponent/getMergedSettings/densityConfig
**producedBy:** Authored 2024-11-21, never modified since except by tooling
**consumedBy:** grep across the full repo (import specifiers, string paths, useDensity/DensityProvider/ExampleCard identifiers) finds zero external importers
**conflict:** This looks like fully dead reference/scratch code (a config file that's really just data plus example components that are never rendered anywhere), but it does not live under a path containing backup/, untested/, deprecated/, or -dev/, so it falls outside the letter of my standing deletion authority for this wave.
**decisionNeeded:** Confirm whether config/ui/density.tsx should be deleted (zero importers, verified via repo-wide grep) or kept as intentional reference/scratch material — I typed it correctly in place rather than unilaterally deleting given the path doesn't match the explicit deletion-authority markers.
**Status:** PENDING
