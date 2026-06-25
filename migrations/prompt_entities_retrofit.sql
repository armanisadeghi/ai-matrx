-- prompt_entities_retrofit.sql
-- Wave 3 (DB changeover) — ADDITIVE Step-1 retrofit for the prompt_* Base-1 entity tables.
-- Scope: additive ONLY — standard columns + org/actor backfill + _touch_row/_stamp_actor.
--        No RLS flip, no NOT NULL, no drops, no history attach (those are later, gated waves).
--
-- Driven by the validated registry routine platform.retrofit_entity(...). Idempotent:
-- the routine ADDs columns IF NOT EXISTS and backfills only ... IS NULL rows, and DROP TRIGGER
-- IF EXISTS / CREATE TRIGGER are safe to re-run. Each call self-verifies 0 null-org (RAISEs otherwise).
--
-- Classification of all 12 public.prompt_* base tables (see CHANGEOVER_PROGRESS prompt group):
--   Base-1 entity (retrofitted here):
--     prompt_actions   (owner user_id,           org backfill: personal)
--     prompt_apps      (owner user_id,           org backfill: personal; has version — reused)
--     prompt_builtins  (owner created_by_user_id, org backfill: personal; has version — reused)
--     prompt_shortcuts (owner created_by_user_id, org backfill: personal)
--     prompt_templates (owner created_by_user_id, org backfill: personal)
--   Base-3 log/event/version-history (SKIPPED — ledger pass later):
--     prompt_versions, prompt_app_versions, prompt_builtin_versions,
--     prompt_app_executions, prompt_app_errors, prompt_app_rate_limits
--   Lookup (SKIPPED — text PK, no org/owner; consolidate -> platform.categories later):
--     prompt_app_categories
--
-- No created_by collisions (none of the 5 had a pre-existing created_by column) -> no RENAME needed.
-- Legacy BEFORE-UPDATE *_updated_at triggers are dropped by the routine (passed per-table below) so
-- _touch_row owns updated_at. Bespoke version-snapshot triggers on prompt_apps / prompt_builtins are
-- content-guarded (early RETURN NEW when no content col changes), so the org/actor backfill does NOT
-- spuriously snapshot or bump version.
--
-- FOLLOW-UP (not in additive scope): prompt_apps + prompt_builtins each keep a bespoke version-snapshot
-- BEFORE-UPDATE trigger that bumps NEW.version; _touch_row also bumps version on UPDATE -> reconcile the
-- double-bump when the prompt_*_versions tables get their Base-3 treatment (same as the agx_version note).

select platform.retrofit_entity('prompt_actions',   'prompt_action',   'personal', 'user_id',            null, null, 'trigger_prompt_actions_updated_at');
select platform.retrofit_entity('prompt_apps',      'prompt_app',      'personal', 'user_id',            null, null, 'update_prompt_apps_updated_at');
select platform.retrofit_entity('prompt_builtins',  'prompt_builtin',  'personal', 'created_by_user_id', null, null, 'set_prompt_builtins_updated_at');
select platform.retrofit_entity('prompt_shortcuts', 'prompt_shortcut', 'personal', 'created_by_user_id', null, null, 'set_updated_at');
select platform.retrofit_entity('prompt_templates', 'prompt_template', 'personal', 'created_by_user_id', null, null, 'set_updated_at');
