---
status: active
updated: 2026-08-30
repos: [matrx-frontend]
scope: program
feature: Matrx Data Table
vision: []
---

# Matrx table mobile consumer cleanup

**What this is:** the bounded follow-up program for page-specific table and toolbar defects that a shared primitive cannot decide safely.
**Scope:** Program
**Feature:** Matrx Data Table
**Vision:** VISION MISSING

## Resources

- Shared table: `components/official/matrx-data-table/MatrxDataTable.tsx`
- Bespoke-table mobile recipe: `components/official/mobile-table/mobileTable.ts`
- Shared contract: `components/official/matrx-data-table/FEATURE.md`
- Mobile skill: `.claude/skills/ios-mobile-first/SKILL.md`
- Existing copy fleet: `docs/handoffs/agent-copy-everywhere.md`
- Patrol: P3 in `../common-docs/systems/improvement/pattern-patrols/PATROL_REGISTRY.md`
- Representative route: `/marketing/brands` at 390x844

## Remaining work

1. **Remove the historical frozen-table API names.** Fifty-three consuming files still import one or more `MOBILE_TABLE_FROZEN*` exports. The shared values no longer contain sticky positioning, so split the mechanical rename/removal into independently certified batches; never reintroduce `sticky` or `left-0` below `sm`/`lg`.
2. **Repair the three direct sticky implementations.** `features/agent-shortcuts/components/ShortcutDirectory.tsx`, `features/page-extraction/data-review/ExtractionCatalogClient.tsx`, and `features/tool-call-visualization/renderers/workbook/WorkbookGrid.tsx` still hand-author `max-sm:sticky` + `max-sm:left-0` outside the shared recipe. Revalidate each live surface, remove phone pinning, and preserve its one horizontal scroll owner.
3. **Classify mobile toolbar actions per surface.** The current structural scan finds 34 files where a `MatrxDataTable` toolbar supplies actions. Keep one primary action visible beside flexible search, make its label icon-only below `sm`, and move only genuinely secondary families into the surface's existing drawer/menu. The primitive cannot infer action priority from arbitrary React nodes.
4. **Audit duplicate whole-view copy placement.** The first heuristic pass found 11 production components containing both page-level `CopyButtons` and `MatrxDataTable`. Inspect rather than bulk-delete: the table toolbar owns view copy by default; a genuine composed page header may instead set `copy.showToolbar: false`. Coordinate with `docs/handoffs/agent-copy-everywhere.md`.
5. **Canonicalize consumer row actions.** Fifty-three files currently supply `rowActions`. Verify icon actions use `Button`/tap-target primitives, row-specific accessible names, and `h-11 w-11 lg:h-5 lg:w-5`; preserve domain menus and write behavior.
6. **Bound consumer-owned identity cells.** Audit the 133 production files mounting `MatrxDataTable` for first-cell renderers that declare only `min-w-*` or allow long content to set intrinsic width. Add a real `w-*`/`max-w-*` boundary where the product hierarchy supports truncation, and use `mobileHidden` or `mobileCards` only after deciding which values earn phone width.
7. **Groom stale documentation after its owning work is taken.** Active handoffs including `header-conformance-campaign.md` and `war-room-list-and-room-conformance.md`, plus feature docs such as Directive Catalog, still describe mobile frozen columns as canonical. Update them through their owning handoff/feature workflow; do not leave instructions that can resurrect the removed behavior.

## Done

- Shared `MatrxDataTable` scrolls the whole phone row, keeps its persistent toolbar on one line, and hides over-data chevrons below `sm` — see `components/official/matrx-data-table/`.
- Shared bespoke-table recipe contains no phone/tablet sticky positioning, including through the historical `MOBILE_TABLE_FROZEN*` exports — see `components/official/mobile-table/mobileTable.ts`.
- Brands removes duplicate header copy, bounds the identity cell, compresses Add on phones, and uses canonical row-action buttons — see `features/marketing/components/brands/BrandsPortfolio.tsx`.
- Local Browser proof at 390×844 measured Search and Add on the same 44 px row, a 224 px rendered identity cell, 359 px of usable horizontal table travel, static first header/body cells, hidden mobile edge controls, and reachable Status/Actions after scrolling. Desktop 1440×900 retained the full Add label and a non-overflowing table; the console stayed error-free.
