-- sch_event_trigger_matcher_race_loser_is_not_an_event_failure
--
-- Two simultaneous matching activity rows can both observe no active run.
-- The partial unique index must decide that race without turning its loser
-- into a failure of the activity write that fired this AFTER INSERT trigger.
--
-- based-on: scheduler.sch_match_event() f85bf946d93ce0c18fac37fd91e741c36b899de4027a1a47e10723a094ded799

create or replace function scheduler.sch_match_event()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_trigger record;
  v_changed jsonb := coalesce(new.metadata -> 'changed_fields', '[]'::jsonb);
  v_event jsonb;
  v_run_task uuid;
  v_inserted_run uuid;
begin
  -- Nearly every spine row has no subscriber: answer that in one indexed probe.
  if not exists (
    select 1 from scheduler.sch_trigger t
    where t.type = 'event' and t.enabled and t.deleted_at is null
      and t.organization_id = new.organization_id
      and t.config ->> 'entity_type' = new.entity_type
  ) then
    return null;
  end if;

  -- Loop guard: a run's own lifecycle event must not re-fire the task it ran.
  if new.entity_type = 'sch_run' then
    select task_id into v_run_task from scheduler.sch_run where id = new.entity_id;
  end if;

  v_event := jsonb_build_object(
    'activity_id', new.id,
    'entity_type', new.entity_type,
    'entity_id', new.entity_id,
    'action', new.action,
    'actor_id', new.actor_id,
    'occurred_at', new.occurred_at,
    'metadata', coalesce(new.metadata, '{}'::jsonb)
  );

  for v_trigger in
    select t.id as trigger_id, t.task_id, t.config, k.user_id, k.organization_id
    from scheduler.sch_trigger t
    join scheduler.sch_task k on k.id = t.task_id
    where t.type = 'event' and t.enabled and t.deleted_at is null
      and k.enabled and k.deleted_at is null
      and t.organization_id = new.organization_id
      and k.organization_id = new.organization_id
      and t.config ->> 'entity_type' = new.entity_type
      and (
        t.config -> 'actions' is null
        or jsonb_typeof(t.config -> 'actions') <> 'array'
        or jsonb_array_length(t.config -> 'actions') = 0
        or t.config -> 'actions' ? new.action
      )
      and (
        t.config ->> 'table_id' is null
        or t.config ->> 'table_id' = new.metadata ->> 'table_id'
      )
      and (
        t.config -> 'changed_fields' is null
        or jsonb_typeof(t.config -> 'changed_fields') <> 'array'
        or jsonb_array_length(t.config -> 'changed_fields') = 0
        or exists (
          select 1 from jsonb_array_elements_text(t.config -> 'changed_fields') want(f)
          where v_changed ? want.f
        )
      )
  loop
    if v_run_task is not null and v_run_task = v_trigger.task_id then
      continue;
    end if;
    if v_trigger.user_id is null or v_trigger.organization_id is null then
      continue;
    end if;

    -- The partial unique index is the atomic authority. A simultaneous event
    -- that loses this race is an ordinary no-op, not a reason to abort the
    -- platform.activity_log insert that invoked this trigger.
    v_inserted_run := null;
    insert into scheduler.sch_run
      (task_id, trigger_id, user_id, status, surface, queue, due_at, organization_id, metadata)
    values
      (v_trigger.task_id, v_trigger.trigger_id, v_trigger.user_id, 'queued', null, 'default', now(),
       v_trigger.organization_id, jsonb_build_object('event', v_event))
    on conflict (task_id) where status in ('queued', 'claimed', 'running')
      do nothing
    returning id into v_inserted_run;

    if v_inserted_run is null then
      continue;
    end if;

    update scheduler.sch_trigger set last_fired_at = now() where id = v_trigger.trigger_id;
  end loop;

  return null;
end;
$function$;

comment on function scheduler.sch_match_event() is
  'AFTER INSERT on platform.activity_log: atomically enqueues at most one queued sch_run per task for matching event triggers. A concurrent race loser is ignored without aborting the activity write; last_fired_at advances only for the trigger that enqueued the run.';
