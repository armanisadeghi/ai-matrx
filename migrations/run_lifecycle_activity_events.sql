-- run_lifecycle_activity_events.sql
--
-- Phase 1 of the event spine: run/job tables emit lifecycle events to
-- platform.activity_log on status change, so the webhook pipeline (and a
-- future in-app Realtime transport) can push "your long job finished" instead
-- of the FE polling for it.
--
-- Applied to the run tables that are already canonical (organization_id +
-- user_id + status). Tables still missing org/owner are tracked in
-- KNOWN_DEFECTS D19 and get the same trigger once the DB changeover retrofits
-- them — just add another `create trigger ... emit_run_lifecycle()` line.
--
-- Idempotent: safe to re-apply.

-- 1. Canonical emit path, with an explicit actor. The base log_activity stamps
--    actor_id = auth.uid(), which is NULL when a background job / trigger fires
--    it — so run events would not match owner-scoped webhooks. This additive
--    overload lets trigger-context callers pass the row's owner. Existing
--    5-arg callers (file audit) are untouched.
create or replace function platform.log_activity(
  p_org uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_metadata jsonb, p_actor uuid
) returns bigint language sql security definer set search_path = public as $fn$
  insert into platform.activity_log (organization_id, action, entity_type, entity_id, actor_id, metadata)
  values (p_org, p_action, p_entity_type, p_entity_id, coalesce(p_actor, (select auth.uid())), p_metadata)
  returning id;
$fn$;

-- 2. Generic lifecycle trigger. Fires on a terminal status transition and emits
--    run.completed / run.failed with actor = the run owner. Reads the canonical
--    columns (status, organization_id, user_id, id) present on every retrofitted
--    run table, so ONE function serves all of them.
create or replace function platform.emit_run_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_action text;
begin
  if NEW.status is not distinct from OLD.status then return NEW; end if;
  v_action := case
    when lower(NEW.status) in ('completed','complete','succeeded','success','done','ready') then 'run.completed'
    when lower(NEW.status) in ('failed','error','errored','cancelled','canceled','abandoned','timeout') then 'run.failed'
    else null end;
  if v_action is null or NEW.organization_id is null then return NEW; end if;
  perform platform.log_activity(
    NEW.organization_id, v_action, TG_TABLE_NAME, NEW.id,
    jsonb_build_object('status', NEW.status, 'run_type', TG_TABLE_NAME),
    NEW.user_id);
  return NEW;
end;
$fn$;

-- 3. Attach to the canonical-ready run tables whose `status` is a JOB lifecycle
--    (pending/processing/completed/failed/…). NOT ai_runs — its `status` is
--    active/archived/deleted (record state, not job progress), so it is not a
--    run-lifecycle producer.
drop trigger if exists emit_run_lifecycle on files.file_rag_jobs;
create trigger emit_run_lifecycle after update of status on files.file_rag_jobs
  for each row execute function platform.emit_run_lifecycle();

drop trigger if exists emit_run_lifecycle on public.kg_sweep_run;
create trigger emit_run_lifecycle after update of status on public.kg_sweep_run
  for each row execute function platform.emit_run_lifecycle();

-- ai_runs: intentionally excluded (status = active/archived/deleted is record
-- state, not job progress). If a previous apply attached the trigger, drop it.
drop trigger if exists emit_run_lifecycle on public.ai_runs;
