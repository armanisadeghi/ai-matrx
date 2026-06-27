-- run_lifecycle_activity_events.sql
--
-- Phase 1 of the event spine: run/job tables emit lifecycle events to
-- platform.activity_log on a terminal status transition, so the webhook
-- pipeline (and a future in-app Realtime transport) can push "your long job
-- finished" instead of the FE polling for it.
--
-- Applied to every run table that exposes the canonical lifecycle contract
-- `id / organization_id / status / <owner>` (owner = user_id OR triggered_by).
-- The trigger reads those fields from `to_jsonb(NEW)` by NAME, so one function
-- serves every table regardless of which owner column it uses, and a new run
-- table needs only a one-line `create trigger ... emit_run_lifecycle()`.
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

-- 2. Generic lifecycle trigger. Reads canonical fields by name from the row
--    jsonb (never a static NEW.<col>, so it can't fail on a table that uses a
--    different owner column). owner = coalesce(user_id, triggered_by).
create or replace function platform.emit_run_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  j          jsonb := to_jsonb(NEW);
  v_status   text  := j->>'status';
  v_old      text  := to_jsonb(OLD)->>'status';
  v_org      uuid  := nullif(j->>'organization_id','')::uuid;
  v_actor    uuid  := coalesce(nullif(j->>'user_id','')::uuid, nullif(j->>'triggered_by','')::uuid);
  v_id       uuid  := nullif(j->>'id','')::uuid;
  v_action   text;
begin
  if v_status is not distinct from v_old then return NEW; end if;
  v_action := case
    when lower(v_status) in ('completed','complete','succeeded','success','done','ready') then 'run.completed'
    when lower(v_status) in ('failed','error','errored','cancelled','canceled','abandoned','timeout') then 'run.failed'
    else null end;
  if v_action is null or v_org is null or v_id is null then return NEW; end if;
  perform platform.log_activity(
    v_org, v_action, TG_TABLE_NAME, v_id,
    jsonb_build_object('status', v_status, 'run_type', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA),
    v_actor);
  return NEW;
end;
$fn$;

-- 3. Attach to every canonical run table whose `status` is a JOB lifecycle.
--    (NOT public.ai_runs — its status is active/archived/deleted = record
--    state, not job progress.)
do $each$
declare r record;
begin
  for r in
    select * from (values
      ('files','file_rag_jobs'), ('public','kg_sweep_run'),
      ('public','agent_run'), ('public','pc_studio_runs'), ('public','sch_run'),
      ('public','scrape_cycle_run'), ('scraper','crawl_runs'), ('public','studio_runs'),
      ('public','page_extraction_runs'), ('public','page_extraction_page_runs'),
      ('public','derive_runs'), ('legal','ingest_runs')
    ) as v(sch, tbl)
  loop
    execute format('drop trigger if exists emit_run_lifecycle on %I.%I', r.sch, r.tbl);
    execute format(
      'create trigger emit_run_lifecycle after update of status on %I.%I '
      || 'for each row execute function platform.emit_run_lifecycle()', r.sch, r.tbl);
  end loop;
end
$each$;

-- ai_runs: intentionally excluded (status = active/archived/deleted is record
-- state, not job progress). Drop the trigger if a previous apply attached it.
drop trigger if exists emit_run_lifecycle on public.ai_runs;
