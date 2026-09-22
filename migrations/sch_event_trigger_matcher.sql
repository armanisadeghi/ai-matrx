-- ============================================================================
-- sch_event_trigger_matcher — an "event" schedule fires from the event spine
-- ============================================================================
-- The scheduler has declared an `event` trigger type since v1 with nothing
-- feeding it. The platform's ONE event spine (platform.activity_log) now
-- carries data-table row changes (udt_row_change_events.sql) beside runs,
-- files and permissions. This is the consumer: an AFTER INSERT trigger on the
-- spine that, for every enabled `event` trigger whose config matches the
-- event, enqueues ONE queued sch_run for the trigger's task — exactly the row
-- sch_enqueue_manual_run writes, so every online scanner (server, extension,
-- desktop) picks it up through the claim protocol it already has. No new
-- executor, no polling, no second path.
--
-- trigger.config (jsonb), written by the schedule form:
--   { "entity_type": "user_table_row",            required — what kind of thing
--     "actions": ["row.updated", "row.created"],  optional — any of; absent = every action
--     "table_id": "<uuid>",                        optional — only this table (metadata.table_id)
--     "changed_fields": ["status"] }               optional — only when one of these columns changed
--
-- The run carries the event under sch_run.metadata.event, and the server
-- runner hands it to the agent as the `event` variable, so the agent knows
-- which table, which row and which columns changed without reading the spine.
--
-- Rules honoured: the event and the trigger must belong to the SAME
-- organization (no cross-tenant firing); a task with an active run is skipped
-- (the partial unique index sch_run_unique_active_per_task would refuse the
-- insert — the matcher checks first so one hot table cannot error the spine
-- write); a run's own completion event never re-fires its own task (the loop
-- guard); everything is additive.
-- ============================================================================

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
    -- One active run per task (sch_run_unique_active_per_task): a task already
    -- queued or running is not enqueued again; the running agent reads the
    -- latest state of the table when it looks.
    if exists (
      select 1 from scheduler.sch_run r
      where r.task_id = v_trigger.task_id and r.status in ('queued', 'claimed', 'running')
    ) then
      continue;
    end if;

    insert into scheduler.sch_run
      (task_id, trigger_id, user_id, status, surface, queue, due_at, organization_id, metadata)
    values
      (v_trigger.task_id, v_trigger.trigger_id, v_trigger.user_id, 'queued', null, 'default', now(),
       v_trigger.organization_id, jsonb_build_object('event', v_event));

    update scheduler.sch_trigger set last_fired_at = now() where id = v_trigger.trigger_id;
  end loop;

  return null;
end;
$function$;

comment on function scheduler.sch_match_event() is
  'AFTER INSERT on platform.activity_log: enqueues one queued sch_run per enabled event trigger (same organization, config.entity_type / actions / table_id / changed_fields match), event under sch_run.metadata.event. Skips a task with an active run; never re-fires a task from its own run event.';

create trigger sch_match_event_on_activity
  after insert on platform.activity_log
  for each row execute function scheduler.sch_match_event();

-- The probe every spine write makes must be an index hit, not a scan.
create index if not exists sch_trigger_event_subscribers_idx
  on scheduler.sch_trigger (organization_id, (config ->> 'entity_type'))
  where type = 'event' and enabled and deleted_at is null;
