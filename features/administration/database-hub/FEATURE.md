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
  trigger time. Its `content` is the complete labelled route catalogue, so
  Copy, AI, and export actions remain real without using the DOM fallback. The
  hub is raw catalogue content, not an attachable entity.
- Tool count, default schema, catalogue, and console section have Locate
  anchors. No credentials or connection material enter the scope.
- Navigation keeps 44px targets below `lg`; desktop resumes compact admin
  density. Route changes use `useTransition` and identify the destination while
  pending.
- The hub has no editable state and registers no write handlers. SQL staging is
  available only on `/administration/database/sql-queries`.
- SQL execution stays pending until the privileged Server Action returns. The
  editor exposes no client-only Cancel or timeout claim because neither aborts
  the PostgreSQL statement.
- **One SQL execution path:** the enhanced editor and legacy dashboard call
  `useDatabaseAdmin.executeQuery`; the notebook calls the same
  `executeSqlQuery` Server Action directly. Only that action invokes
  `execute_admin_query`. The surface contract test censuses all three callers
  and rejects direct client RPCs plus the retired timer/cancel path.
- Browser storage entering the notebook is reconstructed only after its blocks,
  variables, and merge configuration pass runtime shape checks. Query result
  rows are narrowed as plain objects, and saved query history is reconstructed
  record by record; no assertion promotes unknown data.

## Change log

- 2026-08-31 — The SQL workbench leaves derivations and event handlers to the
  React Compiler; the surface contract guards every workbench file against
  manual `useMemo` / `useCallback` regressions.
- 2026-08-30 — Rule 2026-08-30.2 static recheck: censused all three SQL
  execution callers onto the terminal Server Action, pinned the retired
  cancel/timeout path absent, corrected stale catalogue claims, and replaced
  assertion-based browser/result/history parsing with runtime narrowing.
- 2026-08-30 — Removed false client-only SQL cancellation and timeout states;
  execution now reaches its real terminal server result before the UI unlocks.
- 2026-08-30 — Surface certification repair: canonical context menu, Locate
  anchors, contextual navigation loading, compact one-title hierarchy, and the
  shared mobile/tablet touch floor; restored the two catalogue doors declared
  by the surface contract and supplied resolvable catalogue content so the
  menu cannot open inert.
