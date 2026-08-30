# Database administration hub

`/administration/database` is the compact entry point for the database admin
tool family. The shell-owned admin breadcrumb is the page title; the body starts
with operational status and the categorized tool registry.

## Source of truth

- `database-tools.ts` is the one registry for the hub cards and database-local
  navigation. Every card is a real route door, including the relationship and
  data-integrity control planes promised by the surface intro.
- `DatabaseHubLanding.tsx` renders the registry and emits the hub half of
  `matrx-admin/database` through `createAdminDatabaseScope`.
- `features/surfaces/manifests/admin-database.manifest.ts` owns the surface
  vocabulary. The SQL workbench is the only mount with a write handler, and it
  may stage editor text only; it never executes SQL.

## Surface contract

- One `NonEditableContextMenu` wraps the hub pane and receives the live scope at
  trigger time. The hub is raw catalogue content, not an attachable entity.
- Tool count, default schema, catalogue, and console section have Locate
  anchors. No credentials or connection material enter the scope.
- Navigation keeps 44px targets below `lg`; desktop resumes compact admin
  density. Route changes use `useTransition` and identify the destination while
  pending.
- The hub has no editable state and registers no write handlers. SQL staging is
  available only on `/administration/database/sql-queries`.

## Change log

- 2026-08-30 — Surface certification repair: canonical context menu, Locate
  anchors, contextual navigation loading, compact one-title hierarchy, and the
  shared mobile/tablet touch floor; restored the two catalogue doors declared
  by the surface contract.
