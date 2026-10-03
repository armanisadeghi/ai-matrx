-- chair-step: this CREATES two new read doors, custom.record_triggers(uuid, uuid) and custom.record_runs(uuid, uuid, integer) (STABLE SECURITY DEFINER, write nothing), declares both in platform.client_callable_door and GRANTs EXECUTE on each to `authenticated` (the one grant every signed-in store door carries). No existing function, table, column, index, policy or data row is touched.
-- lane: CHAIR-DOORS (asked by v6 lane 11 AUTOMATIONS-AND-PAGES, needs 1d-c and 1d-d)
--
-- WHAT RUNS ON A RECORD IS READ THROUGH TWO DOORS. The scheduler's "run an agent on change" triggers
-- (workflow.trigger, kind event, event_source.source = store) and the runs they and the row actions
-- leave (workflow.run; custom.record rows of data_class action_run since chairdoors4_c) had no
-- client-callable reader masked to what the reader may see; the pages read workflow.* through RLS,
-- which knows nothing of the record store's ladder.
--
--   custom.record_triggers(p_organization_id, p_table_id null)
--     -> table(trigger_id, name, definition_id, definition_name, table_id, event, operations, field_ids,
--              via, is_active, last_fired_at, fire_count, updated_at)
--     The organization is decided first (custom.assert_client_may_reach, 42501 by name); a Table named is
--     one the caller may know (custom.assert_may_know_table); then every store trigger of the
--     organization whose Table the caller sees (custom.tables_seen_among — the one ladder's viewer
--     answer, the same answer the data home gives) — a trigger on a Table she may not know is left out,
--     the same as if it did not exist. Never a webhook secret, never a default input.
--
--   custom.record_runs(p_organization_id, p_record_id, p_limit 50)
--     -> table(run_id, kind workflow|action, name, trigger_name, status, started_at, finished_at, steps,
--              says, ran_by)
--     The organization first, then THE RECORD ITSELF must be one the caller sees (custom.seen_among, the
--     one ladder's viewer answer); a record she may not see answers nothing, exactly as an invented id.
--     Then the workflow runs whose trigger change named the record (workflow.run.metadata.record_id,
--     the store-trigger input's record_id) and the row-action runs that listed it, newest first. Of a
--     run only its name, trigger, status, times, step count and the one sentence it stopped with
--     (metadata.stopped.says, else error.message) — never its input, output or checkpoints.
--
-- No index is added: workflow.run holds 1,867 rows on the clone and the record filter is a
-- sequential read of the organization's own runs (idx_wf_run_org); the action rows ride
-- record_data_idx (GIN, `@>`). When runs grow past a few hundred thousand, an index on
-- (organization_id, (metadata ->> 'record_id')) is the window item to raise.
-- Inverse: migrations/inverse/chairdoors4_d_what_runs_on_a_record_is_read_through_two_doors_down.sql

CREATE OR REPLACE FUNCTION custom.record_triggers(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(trigger_id uuid, name text, definition_id uuid, definition_name text, table_id uuid, event text, operations jsonb, field_ids jsonb, via jsonb, is_active boolean, last_fired_at timestamp with time zone, fire_count integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME: the organization wall, then the Table named.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_triggers');
  if v_me is null then
    return;
  end if;
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_triggers');
  end if;

  return query
    with tr as (
      select t.id, t.name, t.definition_id, t.event_source, t.is_active, t.last_fired_at, t.fire_count, t.updated_at,
             nullif(t.event_source ->> 'table_id', '')::uuid as tbl
        from workflow.trigger t
       where t.organization_id = p_organization_id
         and t.deleted_at is null
         and t.kind = 'event'
         and t.event_source ->> 'source' = 'store'
         and (p_table_id is null or nullif(t.event_source ->> 'table_id', '')::uuid = p_table_id)
    ), seen as (
      -- WHICH OF THOSE TABLES SHE SEES: the one ladder's viewer answer, asked once for the set.
      select s.id
        from custom.tables_seen_among(v_me, array[p_organization_id],
               array(select distinct tr.tbl from tr where tr.tbl is not null)) s
       where s.seen and s.organization_id = p_organization_id
    )
    select tr.id, tr.name, tr.definition_id, d.name, tr.tbl,
           tr.event_source ->> 'event',
           coalesce(tr.event_source -> 'operations', '[]'::jsonb),
           coalesce(tr.event_source -> 'field_ids', '[]'::jsonb),
           coalesce(tr.event_source -> 'via', '[]'::jsonb),
           tr.is_active, tr.last_fired_at, tr.fire_count, tr.updated_at
      from tr
      join seen on seen.id = tr.tbl
      left join workflow.definition d on d.id = tr.definition_id
     order by tr.updated_at desc, tr.id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.record_runs(p_organization_id uuid, p_record_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(run_id uuid, kind text, name text, trigger_name text, status text, started_at timestamp with time zone, finished_at timestamp with time zone, steps integer, says text, ran_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME: the organization wall.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_runs');
  if v_me is null or p_record_id is null then
    return;
  end if;
  -- THE RECORD ITSELF must be hers to see (the one ladder's viewer answer); otherwise this door answers
  -- exactly as it does for an invented id: nothing.
  if not exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = p_record_id)
     or not (p_record_id = any (coalesce(custom.seen_among(v_me, array[p_record_id]), '{}'::uuid[]))) then
    return;
  end if;

  return query
    (select r.id, 'workflow'::text, d.name, r.metadata ->> 'trigger_name', r.status,
            coalesce(r.started_at, r.created_at), r.completed_at, r.steps_executed,
            coalesce(r.metadata -> 'stopped' ->> 'says', r.error ->> 'message'), r.created_by
       from workflow.run r
       left join workflow.definition d on d.id = r.definition_id
      where r.organization_id = p_organization_id
        and r.deleted_at is null
        and coalesce(r.metadata ->> 'record_id', r.input #>> '{trigger,record_id}') = p_record_id::text)
    union all
    (select a.id, 'action'::text, a.data ->> 'action', null::text, a.data ->> 'outcome',
            nullif(a.data ->> 'ran_at', '')::timestamptz, nullif(a.data ->> 'ran_at', '')::timestamptz,
            nullif(a.data ->> 'ran', '')::integer, null::text, nullif(a.data ->> 'ran_by', '')::uuid
       from custom.record a
      where a.organization_id = p_organization_id
        and a.data_class = 'action_run'
        and a.deleted_at is null
        and a.data @> jsonb_build_object('record_ids', jsonb_build_array(p_record_id::text)))
    order by 6 desc nulls last, 1
    limit v_limit;
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'record_triggers', 'p_organization_id uuid, p_table_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'The scheduler''s run-on-change triggers of one organization, masked to the Tables the caller sees. p_organization_id is decided first by custom.assert_client_may_reach (42501 by name); p_table_id, when named, by custom.assert_may_know_table (a Table the caller may not know refuses as an invented one); then only store triggers (workflow.trigger, kind event, event_source.source = store) whose Table custom.tables_seen_among answers seen for the caller are listed. It returns the trigger id, name, definition id and name, Table, event, operations, field ids, via, on/off, last fired, fire count and last change — never a webhook secret or a default input. It writes nothing.',
   'chairdoors4_d_what_runs_on_a_record_is_read_through_two_doors.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1,
       'check', 'custom.assert_client_may_reach(arg1) before anything is read; a non-member is refused by name.',
       'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true)),
     'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2,
       'check', 'custom.assert_may_know_table(arg1, arg2) before anything is read; null = every Table the caller sees.',
       'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true))))),
  ('custom', 'record_runs', 'p_organization_id uuid, p_record_id uuid, p_limit integer',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'integer'::regtype::oid],
   'What ran on one record: the workflow runs whose trigger change named it and the row-action runs that listed it, newest first. p_organization_id is decided first by custom.assert_client_may_reach (42501 by name); p_record_id must be a record of that organization the caller sees (custom.seen_among, the one ladder''s viewer answer) or the door answers nothing, exactly as for an invented id. Of a run only its id, kind, name, trigger name, status, times, step count, the one sentence it stopped with and who started it — never its input, output or checkpoints. It writes nothing.',
   'chairdoors4_d_what_runs_on_a_record_is_read_through_two_doors.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1,
       'check', 'custom.assert_client_may_reach(arg1) before anything is read; a non-member is refused by name.',
       'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true)),
     'p_record_id', jsonb_build_object('type', 'uuid', 'position', 2,
       'check', 'must be a record of arg1 that custom.seen_among answers seen for the caller, before any run is read; otherwise zero rows.',
       'foreign', jsonb_build_object('bounded', true, 'same_as_invented', true)),
     'p_limit', jsonb_build_object('type', 'integer', 'position', 3, 'check', 'clamped to 1..200.'))));

grant execute on function custom.record_triggers(uuid, uuid) to authenticated;
grant execute on function custom.record_runs(uuid, uuid, integer) to authenticated;
