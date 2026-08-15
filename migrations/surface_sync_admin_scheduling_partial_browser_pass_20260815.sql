-- Idempotent manifest mirror refresh for matrx-admin/scheduling.
-- The full SQL was emitted with:
--   pnpm tsx scripts/emit-surface-sync-sql.ts --surface matrx-admin/scheduling
-- Values, write targets, groups, URL pattern, and intro already match live;
-- only the code-owned readiness note changed in this pass.

UPDATE ui.ui_surface
SET readiness = 'partial',
    readiness_note = 'All seven emitters are wired, the manifest mirrors are synchronized, and every declared page value now has a data-surface-value Locate anchor. Browser verification is still incomplete: Overview opened Surface Context with `contract honored`; Tasks loaded real rows and emitted active_tab + task_row_count; Runs loaded its real empty result, but its Context window plus Orphan leases, Cron tester, Scanner health, and Templates still need to be observed before promotion. The Cron tester''s two write targets were previously verified with real agent runs (apply, decline, undeclared-target refusal, and invalid-value throws). Templates remains deliberately undeclared page data because it is a hardcoded in-file SEEDS array pending a sch_template table + read RPC.',
    updated_at = now()
WHERE name = 'matrx-admin/scheduling';
