-- chair-step: it restores the byte-exact bodies of the three checklist writing doors as they
--   stood at 15:26 UTC on 2026-09-20, with the switch asked before the wall, so the red twin
--   can plant the real pre-fix bytes and show the sentence a stranger used to be told.
--
-- CHECKLISTS — the inverse of `checklists_the_wall_is_the_first_answer.sql`.

set lock_timeout = '45s';

create or replace function custom.checklist_declare(p_organization_id uuid, p_spec jsonb, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_why    text;
  v_id     uuid;
  v_spec   jsonb;
  v_steps  uuid;
  v_about  uuid;
  v_trigt  uuid;
  v_t0     timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.checklist_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_declare');
  if p_organization_id is null then
    raise exception 'custom.checklist_declare: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  v_spec := coalesce(p_spec, '{}'::jsonb);
  v_why := custom.checklist_refusal(v_spec);
  if v_why is not null then
    raise exception '%', v_why
      using errcode = '23514',
            hint = 'PRODUCTS row 13: a checklist is judged when it is written, so a run of it cannot be half a checklist.';
  end if;

  v_about := (v_spec ->> 'about_table_id')::uuid;
  -- Writing a checklist that runs against a table is a change to how that table is worked, so
  -- it asks the rung a change to that table asks.
  perform custom.assert_client_may_change(p_organization_id, v_about, 'custom.checklist_declare',
                                          'editor'::public.permission_level, 'table');
  if not exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_about
                    and r.table_id = custom.table_kernel_id() and r.deleted_at is null) then
    raise exception 'That table is not in this organization, so a checklist cannot be about it.'
      using errcode = '23503';
  end if;

  v_steps := custom.checklist_steps_table(p_organization_id);

  v_trigt := nullif(v_spec #>> '{trigger,table_id}', '')::uuid;
  if v_trigt is not null then
    if v_trigt = v_steps then
      raise exception 'A checklist cannot watch the table its own steps live in — every step it made would start another run of it.'
        using errcode = '23514';
    end if;
    perform custom.assert_client_may_change(p_organization_id, v_trigt, 'custom.checklist_declare',
                                            'editor'::public.permission_level, 'table');
    if not exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = v_trigt
                      and r.table_id = custom.table_kernel_id() and r.deleted_at is null) then
      raise exception 'That table is not in this organization, so a checklist cannot watch it.'
        using errcode = '23503';
    end if;
  end if;

  if p_template_id is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, null, 'checklist_template', v_spec)
    returning id into v_id;
  else
    perform custom.assert_client_may_change(p_organization_id, p_template_id,
                                            'custom.checklist_declare',
                                            'editor'::public.permission_level, 'checklist');
    if not exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = p_template_id
                      and r.data_class = 'checklist_template' and r.deleted_at is null) then
      raise exception 'There is no such checklist in this organization.' using errcode = '02000';
    end if;
    v_id := p_template_id;
    perform custom.record_update(p_organization_id, p_template_id, v_spec, null);
  end if;

  return jsonb_build_object(
    'template_id',    v_id,
    'name',           v_spec ->> 'name',
    'about_table_id', v_about,
    'steps_table_id', v_steps,
    'steps',          jsonb_array_length(v_spec -> 'steps'),
    'roles',          jsonb_array_length(coalesce(v_spec -> 'roles', '[]'::jsonb)),
    'trigger',        coalesce(v_spec -> 'trigger', jsonb_build_object('kind', 'manual')),
    'created',        p_template_id is null,
    'message',        format('%s has %s step%s, and it %s.',
                             v_spec ->> 'name',
                             jsonb_array_length(v_spec -> 'steps'),
                             case when jsonb_array_length(v_spec -> 'steps') = 1 then '' else 's' end,
                             case coalesce(v_spec #>> '{trigger,kind}', 'manual')
                               when 'record_created'  then 'starts on its own whenever a new record arrives'
                               when 'status_reached'  then format('starts on its own when a record reaches %s',
                                                                  v_spec #>> '{trigger,status}')
                               else 'is started by hand' end),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$function$;
create or replace function custom.checklist_start(p_organization_id uuid, p_template_id uuid, p_about_record_id uuid DEFAULT NULL::uuid, p_roles jsonb DEFAULT '{}'::jsonb, p_starting_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.checklist_start');
  -- THE WALL, BY NAME, FIRST. Somebody in another organization is told THAT, not that they
  -- cannot open a checklist they were never allowed to know exists.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_start');
  perform custom.assert_client_may_open(p_organization_id, p_template_id,
                                        'custom.checklist_start',
                                        'viewer'::public.permission_level, 'checklist');
  return custom._checklist_instantiate(p_organization_id, p_template_id, p_about_record_id,
                                       p_roles, p_starting_at, 'person');
end
$function$;
create or replace function custom.checklist_step_complete(p_organization_id uuid, p_step_id uuid, p_evidence jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row   custom.record;
  v_ev    jsonb;
  v_why   text;
  v_done  uuid;
  v_run   uuid;
  v_left  integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.checklist_step_complete');
  perform custom.assert_client_may_change(p_organization_id, p_step_id,
                                          'custom.checklist_step_complete',
                                          'editor'::public.permission_level, 'step');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_step_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such step in this organization.' using errcode = '02000';
  end if;
  if nullif(v_row.data ->> 'run_id', '') is null then
    raise exception 'That is not a checklist step, so it cannot be ticked off one.'
      using errcode = '0A000',
            hint = 'A checklist step is a record made by custom.checklist_start; an ordinary record is finished with custom.work_set_state.';
  end if;
  if custom._checklist_finished(p_organization_id, v_row.table_id, v_row.data ->> 'status') then
    return jsonb_build_object('step_id', p_step_id, 'completed', false,
                              'message', format('%s was already done.', v_row.data ->> 'title'));
  end if;

  v_ev := coalesce(v_row.data -> 'evidence', '{}'::jsonb) || coalesce(p_evidence, '{}'::jsonb);

  -- ASKED BEFORE ANYTHING IS WRITTEN, so a person is told what is missing rather than left
  -- with half a tick. The same rule the BEFORE trigger enforces, asked here to be kind.
  v_why := custom._checklist_refusal_for(p_organization_id, p_step_id,
                                        v_row.data || jsonb_build_object('evidence', v_ev));
  if v_why is not null then
    raise exception '%', v_why
      using errcode = '23514',
            hint = 'PRODUCTS row 13: a checklist step is finished when what it asks for is there and what it waits for is done.';
  end if;

  perform custom.record_update(p_organization_id, p_step_id,
                               jsonb_build_object('evidence', v_ev), null);

  select s.id into v_done from custom.record s
   where s.organization_id = p_organization_id and s.table_id = (
           select w.data #>> '{config,options_table_id}' from custom.record w
            where w.organization_id = p_organization_id
              and w.table_id = custom.field_kernel_id()
              and w.deleted_at is null
              and nullif(w.data ->> 'entity_definition_id', '')::uuid = v_row.table_id
              and w.data ->> 'key' = 'status' limit 1)::uuid
     and s.data ->> 'name' = 'Done' and s.deleted_at is null limit 1;

  perform custom.work_set_state(p_organization_id, p_step_id, v_done);

  v_run := nullif(v_row.data ->> 'run_id', '')::uuid;
  select count(*)::integer into v_left
    from custom.record s
   where s.organization_id = p_organization_id
     and s.deleted_at is null
     and s.data_class = 'record'
     and nullif(s.data ->> 'run_id', '')::uuid = v_run
     and not custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status');

  return jsonb_build_object(
    'step_id',   p_step_id,
    'run_id',    v_run,
    'completed', true,
    'evidence',  v_ev,
    'steps_left', v_left,
    'run_closed', v_left = 0,
    'message',   case when v_left = 0
                      then format('%s is done, and that was the last step — this checklist is finished.',
                                  v_row.data ->> 'title')
                      else format('%s is done. %s step%s to go.', v_row.data ->> 'title', v_left,
                                  case when v_left = 1 then '' else 's' end) end);
end
$function$;