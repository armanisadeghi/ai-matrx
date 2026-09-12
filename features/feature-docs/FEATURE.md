# Feature Docs

**Status:** active  
**Tier:** 2  
**Last updated:** 2026-09-12

## Purpose

Super-admin documentation routes browse the active feature-document registry without changing its source records.

## Entry points

- `/administration/documentation/feature-docs/codebase` — repository markdown outside `docs/` and configured dot-directories.
- `/administration/documentation/feature-docs/docs` — markdown under `docs/`.
- `/administration/documentation/feature-docs/dotdirs/[slug]` — markdown in one configured tooling directory.
- `features/feature-docs/service.ts` — `listFeatureDocs()` reads the complete active `admin.feature_docs` list in path-ordered chunks.

## Key flows

1. `FeatureDocsTable` loads the full source list through `listFeatureDocs()` and displays any error above the table.
2. It applies zone and dot-directory restriction before include/exclude glob rules, title, area, slug, sync-state, and version filters.
3. `MatrxDataTable` applies local sorting and filtering to the complete loaded source, then renders its standard 25-row page. Its page-size control remains available; large tooling directories do not mount thousands of rows by default.
4. The explicit **Open** action resolves `featureDocViewHref(path)` and opens the document viewer in a new tab.

## Invariants

- Source paging belongs only to `listFeatureDocs`; the renderer does not add remote pagination or scroll fetching.
- Zone/dot-directory restriction is evaluated before every local filter, so one route cannot expose another route's documents.
- The explicit document door remains available on desktop and mobile cards.
- `pnpm sync:feature-docs` requires `--organization-id <UUID>` before it loads credentials, reads rows, or changes rows. The current system catalog uses `39c38960-d30c-4840-b0c1-c9960de95582` as an explicit initiating value; it is never inferred by the command or database.
- The sync captures that organization once and scopes every `admin.feature_docs` read, insert, update, and soft-delete to it.

## Doctrine compliance

- Components: `@ai-matrx/design-system/data-table` owns canonical table layout, sorting, and responsive cards; existing `Input`, `Select`, `Button`, and `Badge` provide the route-specific filter controls.
- Services: `listFeatureDocs()` remains the sole list source.
- No new platform primitive was introduced.

## Change log

- 2026-09-12: Restored the canonical 25-row rendering default after the live .claude view exposed 5,215 records; local search and filters still cover the complete source.
- 2026-09-12: Made the documentation sync command admit only an explicit organization and use the captured value for every database operation, preparing the catalog for retirement of its database organization default.
- 2026-09-12: Replaced the bespoke Feature Docs renderer with `MatrxDataTable`, preserving full-list local filtering, sorting, refresh/error behavior, mobile presentation, and document navigation.
