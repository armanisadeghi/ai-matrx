# Parked: Pages screens (v6 lane 11, 2026-10-03)

Not compiled (`.parked`). They import `PageScreen` from `@ai-matrx/records-ui`, which is committed in aidream
(4ca062ddf8) but not yet on npm (npm: 0.93.153). Once records-ui 0.95.x is published:

1. `PagesHome.tsx.parked`, `PageRoute.tsx.parked` → `features/unified-data/pages/*.tsx`
2. `app__core__data-v2__pages__page.tsx.parked` → `app/(core)/data-v2/pages/page.tsx`
3. `app__core__data-v2__pages__pageId__page.tsx.parked` → `app/(core)/data-v2/pages/[pageId]/page.tsx`
4. `git apply data-home-capabilities.patch` (names pages in the data home)
5. Type-check, delete this folder, commit, then walk "Today's intake" (handoff Q3 in common-docs
   v6/PROGRESS-AUTOMATIONS-AND-PAGES.md).
