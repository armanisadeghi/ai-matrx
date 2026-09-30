-- chair-step: this puts custom.checklist_runs, custom.checklist_run, custom.checklist_step_complete and custom.checklist_step_refusal back to their bodies before datahome2_j (no organization named = refused). Signatures, grants and door rows unchanged; no data row is touched.
-- lane: DATA-HOME-2
-- based-on: custom.checklist_runs(uuid, uuid, uuid, boolean, integer) 85e651833e09bba273427db49ee7984467a658dd573657af2073431d08ef1744
-- based-on: custom.checklist_run(uuid, uuid) 25922f65b8a2d8017ed6861035bd2a71df47d7cee1b6c86eda2c43f09feab7fd
-- based-on: custom.checklist_step_complete(uuid, uuid, jsonb) b08dfbd451f008970ef433b8b84af9cd92b1f47ed16f6377996bf4dafefa67ef
-- based-on: custom.checklist_step_refusal(uuid, uuid) 205f3deb8bbca4325e17a7befc2f9d283a2d219ebae79b6fe823a67e9d706e9c

CREATE OR REPLACE FUNCTION custom.checklist_runs(p_organization_id uuid, p_about_table_id uuid DEFAULT NULL::uuid, p_about_record_id uuid DEFAULT NULL::uuid, p_include_closed boolean DEFAULT true, p_limit integer DEFAULT 100)
 RETURNS TABLE(run_id uuid, name text, template_id uuid, template text, about_record_id uuid, about text, about_table_id uuid, started_at timestamp with time zone, started_by uuid, origin text, step_count integer, done integer, overdue integer, next_step text, next_due timestamp with time zone, closed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_runs');
  return query
    with runs as (
      select r.id, r.data as d
        from custom.record r
       where r.organization_id = p_organization_id
         and r.data_class = 'checklist_run'
         and r.deleted_at is null
         and (p_about_table_id is null
              or nullif(r.data ->> 'about_table_id', '')::uuid = p_about_table_id)
         and (p_about_record_id is null
              or nullif(r.data ->> 'about_record_id', '')::uuid = p_about_record_id)
         and (coalesce(p_include_closed, true) or nullif(r.data ->> 'closed_at', '') is null)
         -- THE ONE LADDER, row by row, exactly as custom.checklist_run asks it.
         and custom._checklist_run_visible(p_organization_id, r.id, r.data)
    ), steps as (
      select nullif(s.data ->> 'run_id', '')::uuid as run_id,
             count(*)::integer as n,
             count(*) filter (where custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status'))::integer as done,
             count(*) filter (where not custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status')
                                and nullif(s.data ->> 'due_date', '')::timestamptz < date_trunc('day', now()))::integer as overdue,
             (array_agg(s.data ->> 'title' order by
                          custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status'),
                          coalesce((s.data ->> 'position')::integer, 0)))[1] as next_step,
             min(nullif(s.data ->> 'due_date', '')::timestamptz)
               filter (where not custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status')) as next_due
        from custom.record s
       where s.organization_id = p_organization_id
         and s.deleted_at is null
         and s.data_class = 'record'
         and nullif(s.data ->> 'run_id', '') is not null
         and nullif(s.data ->> 'run_id', '')::uuid in (select id from runs)
       group by 1
    )
    select r.id,
           r.d ->> 'name',
           nullif(r.d ->> 'template_id', '')::uuid,
           r.d ->> 'template',
           nullif(r.d ->> 'about_record_id', '')::uuid,
           r.d ->> 'about',
           nullif(r.d ->> 'about_table_id', '')::uuid,
           nullif(r.d ->> 'started_at', '')::timestamptz,
           nullif(r.d ->> 'started_by', '')::uuid,
           coalesce(r.d ->> 'origin', 'person'),
           coalesce(s.n, 0),
           coalesce(s.done, 0),
           coalesce(s.overdue, 0),
           case when nullif(r.d ->> 'closed_at', '') is not null then null else s.next_step end,
           s.next_due,
           nullif(r.d ->> 'closed_at', '')::timestamptz
      from runs r
      left join steps s on s.run_id = r.id
     order by nullif(r.d ->> 'started_at', '')::timestamptz desc nulls last
     limit custom.page_size(p_organization_id, 'custom.checklist_runs', p_limit, 100, 200);
end
$function$;

CREATE OR REPLACE FUNCTION custom.checklist_run(p_organization_id uuid, p_run_id uuid)
 RETURNS TABLE(step_id uuid, step_order integer, ref text, title text, role text, assignee_name text, assignee_user_id uuid, due_on timestamp with time zone, due_state text, status text, finished boolean, requires text, requires_key text, requires_label text, requires_id uuid, evidence jsonb, blocked_by text[], may_complete boolean, refusal text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me  uuid := custom.query_principal();
  v_run custom.record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_run');
  select r.* into v_run from custom.record r
   where r.organization_id = p_organization_id and r.id = p_run_id
     and r.data_class = 'checklist_run' and r.deleted_at is null;
  if v_run.id is null then
    raise exception 'There is no such checklist run in this organization.' using errcode = '02000';
  end if;
  -- THE ONE LADDER. A run is yours when you hold it, hold a step of it, or hold the record it
  -- is about. Being given a step is what puts the checklist in front of you.
  if not custom._checklist_run_visible(p_organization_id, p_run_id, v_run.data) then
    raise exception 'You do not have any part of this checklist, so custom.checklist_run has nothing to show you.'
      using errcode = '42501',
            hint = 'DOOR-1: a run is readable by the people in it — whoever holds a step, whoever holds the record it is about, and whoever the run itself was shared with. Ask for a step, or ask an owner to share it.';
  end if;

  return query
    select s.id,
           coalesce((s.data ->> 'position')::integer, 0),
           s.data ->> 'ref',
           s.data ->> 'title',
           s.data ->> 'role',
           p.data ->> 'name',
           nullif(p.data ->> 'user_id', '')::uuid,
           nullif(s.data ->> 'due_date', '')::timestamptz,
           case when custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status') then 'finished'
                when nullif(s.data ->> 'due_date', '') is null                        then 'undated'
                when (s.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) then 'overdue'
                when (s.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) + interval '1 day'
                                                                                      then 'due_today'
                else 'scheduled' end,
           st.data ->> 'name',
           custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status'),
           coalesce(s.data #>> '{requires,kind}', 'none'),
           nullif(s.data #>> '{requires,key}', ''),
           nullif(coalesce(s.data #>> '{requires,label}', s.data #>> '{requires,key}'), ''),
           coalesce(nullif(s.data #>> '{requires,form_id}', ''),
                    nullif(s.data #>> '{requires,template_id}', ''))::uuid,
           coalesce(s.data -> 'evidence', '{}'::jsonb),
           (select coalesce(array_agg(d.data ->> 'title' order by (d.data ->> 'position')::integer), '{}')
              from jsonb_array_elements(coalesce(s.data -> 'depends_on_ids', '[]'::jsonb)) e
              join custom.record d
                on d.organization_id = p_organization_id
               and d.id = (e #>> '{}')::uuid
               and d.deleted_at is null
               and not custom._checklist_finished(p_organization_id, d.table_id, d.data ->> 'status')),
           custom.query_is_store_owner()
             or custom.has_visibility(v_me, 'record', s.id, 'editor'::public.permission_level),
           case when custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status')
                then null
                else custom._checklist_refusal_for(p_organization_id, s.id, s.data) end
      from custom.record s
      left join custom.record p
        on p.organization_id = s.organization_id
       and p.id = nullif(s.data ->> 'assignee', '')::uuid
      left join custom.record st
        on st.organization_id = s.organization_id
       and st.id = custom.work_state_id(s.organization_id, s.table_id, s.data ->> 'status')
       and st.deleted_at is null
     where s.organization_id = p_organization_id
       and s.deleted_at is null
       and s.data_class = 'record'
       and nullif(s.data ->> 'run_id', '')::uuid = p_run_id
     order by coalesce((s.data ->> 'position')::integer, 0);
end
$function$;

CREATE OR REPLACE FUNCTION custom.checklist_step_complete(p_organization_id uuid, p_step_id uuid, p_evidence jsonb DEFAULT '{}'::jsonb)
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
  -- THE WALL FIRST, THEN THE SWITCH, THEN THE ROW.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_step_complete');
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

CREATE OR REPLACE FUNCTION custom.checklist_step_refusal(p_organization_id uuid, p_step_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row custom.record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_step_refusal');
  perform custom.assert_client_may_open(p_organization_id, p_step_id,
                                        'custom.checklist_step_refusal',
                                        'viewer'::public.permission_level, 'step');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_step_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such step in this organization.' using errcode = '02000';
  end if;
  if custom._checklist_finished(p_organization_id, v_row.table_id, v_row.data ->> 'status') then
    return null;
  end if;
  return custom._checklist_refusal_for(p_organization_id, p_step_id, v_row.data);
end
$function$;
