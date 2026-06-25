-- aga_entities_retrofit.sql
-- DB changeover, Wave 3 — ADDITIVE base-retrofit (Step 1 ONLY) for the aga_* (Agent Apps) tables.
-- ADDITIVE / non-breaking: no RLS flips, no drops, no NOT NULL. Idempotent / re-runnable.
--
-- Scope decisions (see docs/db_rebuild/CHANGEOVER_PROGRESS.md "agx / aga" detail):
--   aga_apps        Base-1 ENTITY (personal org). THE ONLY table retrofitted here.
--                   owner=user_id (70 rows, 0 null user_id, 69 null org backfilled to each
--                   owner's personal org). Existing `version` is a standard INTEGER already
--                   maintained by the bespoke snapshot trigger (snapshot_aga_version ->
--                   aga_versions); it is reused (not re-added). Legacy updated_at trigger
--                   trg_aga_apps_updated_at is dropped by the routine; _touch_row + _stamp_actor
--                   attached. Business triggers PRESERVED (search_tsv, version snapshots, url guard).
--   aga_versions    Base-3 LOG (app version history, changed_at) -> SKIP (ledger pass later).
--   aga_executions  Base-3 LOG (execution events, created_at) -> SKIP. NOTE its task_id is an
--                   execution-task FK, NOT project/task association litter — leave it.
--   aga_errors      Base-3 LOG (error events, created_at) -> SKIP.
--   aga_rate_limits Base-3 LOG/counter (per-ip/fingerprint counter) -> SKIP.
--   aga_categories  lookup (text PK, no org, no owner; -> platform.categories later) -> SKIP.
--
-- ============================================================================
-- DOUBLE-BUMP FOLLOW-UP (identical to agx_agent_templates; see tracker change-log):
--   aga_apps carries a bespoke BEFORE UPDATE trigger trg_aga_apps_snapshot_version
--   (snapshot_aga_version) that, on a CONTENT-changing update, sets
--   NEW.version := MAX(aga_versions.version_number)+1 and snapshots the row into aga_versions.
--   platform._touch_row also sets NEW.version := OLD.version+1 on every UPDATE.
--   BEFORE-ROW triggers fire alphabetically: _stamp_actor, _touch_row, then
--   trg_aga_apps_snapshot_version. On content updates the snapshot trigger runs LAST and
--   overwrites version with the snapshot-derived value (correct, stays in lock-step with
--   aga_versions). On NON-content updates only _touch_row fires, so version counts all updates
--   rather than only content revisions until reconciled. This does NOT corrupt data and is
--   deferred to the Base-3 aga_versions pass (when the version-snapshot vs _touch_row ownership
--   of `version` is reconciled across the whole agx/aga apps family) — exactly the open
--   follow-up already logged for agx_agent / agx_agent_templates / prompt_apps / prompt_builtins.
--   NOTE: aga_apps.version is INTEGER (not the VARCHAR-semver case of skl_definitions, decision
--   #10), so _touch_row is SAFE to attach here; the sibling agx precedent attaches it too.
-- ============================================================================
--
-- DEFERRED to separate, gated steps (NOT in this migration):
--   * history capture (platform._version_capture) — bespoke version-snapshot trigger left untouched
--   * org-first RLS flip (iam.apply_rls(...,'entity') + drop legacy policies)
--   * organization_id NOT NULL (after a fresh 0-null verify)
--   * add deleted_at (soft-delete) — not present today; added in the gated pass
--   * DROP project_id / task_id litter on aga_apps (after consumer repoint + PITR)

-- == APPLIED ==
-- Result expected: retrofit_entity(aga_apps) OK — orgcol=organization_id strategy=personal null_org=0
SELECT platform.retrofit_entity('aga_apps', 'agent_app', 'personal', 'user_id', NULL, NULL, 'trg_aga_apps_updated_at');

-- Self-verify: 0 null org, both shared triggers attached, business triggers PRESERVED.
DO $verify$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.aga_apps WHERE organization_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'aga_apps: % null-org rows remain', n; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='_touch_row'   AND tgrelid='public.aga_apps'::regclass) THEN
    RAISE EXCEPTION 'aga_apps: _touch_row not attached'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='_stamp_actor' AND tgrelid='public.aga_apps'::regclass) THEN
    RAISE EXCEPTION 'aga_apps: _stamp_actor not attached'; END IF;

  -- business triggers must survive the retrofit
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_aga_apps_snapshot_version' AND tgrelid='public.aga_apps'::regclass) THEN
    RAISE EXCEPTION 'aga_apps: trg_aga_apps_snapshot_version (version snapshot) was lost'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_aga_apps_seed_v1' AND tgrelid='public.aga_apps'::regclass) THEN
    RAISE EXCEPTION 'aga_apps: trg_aga_apps_seed_v1 (insert snapshot) was lost'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_aga_apps_search_tsv' AND tgrelid='public.aga_apps'::regclass) THEN
    RAISE EXCEPTION 'aga_apps: trg_aga_apps_search_tsv was lost'; END IF;
END $verify$;
