-- target: branch
--
-- THE INVERSE of `migrations/campaign/workdoors_four_doors_name_the_wall.sql`: the four bodies
-- exactly as they stood at 04:22Z on 2026-09-20, before each gained its explicit
-- `custom.assert_client_may_reach` line. Running it is what makes census 1 of
-- `pnpm check:store-doors-decide` name all four again.

CREATE OR REPLACE FUNCTION custom.work_approval_request(p_organization_id uuid, p_subject_id uuid, p_change jsonb, p_note text DEFAULT NULL::text, p_approver_id uuid DEFAULT NULL::uuid, p_origin text DEFAULT 'person'::text, p_conversation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_kind    text := lower(coalesce(p_change ->> 'kind', ''));
  v_origin  text := lower(coalesce(nullif(btrim(p_origin), ''), 'person'));
  v_me      uuid := custom.query_principal();
  v_subject custom.record;
  v_word    text;
  v_id      uuid;
  v_who     jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_request');
  perform custom.assert_client_may_open(p_organization_id, p_subject_id,
                                        'custom.work_approval_request',
                                        'viewer'::public.permission_level, 'record');

  if v_origin not in ('person', 'agent') then
    raise exception 'An approval comes from a person or from an agent, and "%" is neither.', p_origin
      using errcode = '22023';
  end if;
  if v_kind not in ('record_patch', 'field_add') then
    raise exception 'This store can hold two kinds of pending change: a change to a record''s values, and a new column on a table. It was asked to hold "%".',
                    coalesce(nullif(p_change ->> 'kind', ''), 'nothing')
      using errcode = '22023',
            hint = 'Send {"kind":"record_patch","patch":{...}} or {"kind":"field_add","field":{...}}. Anything else would be a change nobody could apply when they approved it.';
  end if;
  if v_kind = 'record_patch'
     and (jsonb_typeof(p_change -> 'patch') is distinct from 'object'
          or p_change -> 'patch' = '{}'::jsonb) then
    raise exception 'A change waiting for approval has to say what it would change.'
      using errcode = '22004';
  end if;
  if v_kind = 'field_add' and jsonb_typeof(p_change -> 'field') is distinct from 'object' then
    raise exception 'A new column waiting for approval has to carry the column it would add.'
      using errcode = '22004';
  end if;

  select r.* into v_subject from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id and r.deleted_at is null;
  if v_subject.id is null then
    raise exception 'There is no such record in this organization, so there is nothing to approve.'
      using errcode = '02000';
  end if;
  v_word := case when v_subject.table_id = custom.table_kernel_id() then 'table' else 'record' end;
  if v_kind = 'field_add' and v_word <> 'table' then
    raise exception 'A new column is added to a table, and this is a %.', v_word
      using errcode = '22023';
  end if;

  if p_approver_id is not null
     and not exists (select 1 from iam.organization_member m
                      where m.organization_id = p_organization_id and m.user_id = p_approver_id) then
    raise exception 'That person is not in this organization, so they cannot be asked to approve anything here.'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', a.name, 'why', a.why)), '[]'::jsonb)
    into v_who
    from custom.work_approval_approvers(p_organization_id, p_subject_id, p_approver_id) a;

  if jsonb_array_length(v_who) = 0 then
    raise exception 'Nobody in this organization could approve that, so asking would leave it waiting forever.'
      using errcode = '42501',
            hint = 'Name an approver, or ask an owner of the organization to give somebody admin on it. A request nobody can answer is worse than no request.';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'work_approval', jsonb_strip_nulls(jsonb_build_object(
    'subject_id',      p_subject_id::text,
    'subject_kind',    v_word,
    'subject_table_id', v_subject.table_id::text,
    'subject_title',   coalesce(v_subject.data ->> 'name', v_subject.data ->> 'title'),
    'change',          p_change,
    'origin',          v_origin,
    'note',            nullif(btrim(coalesce(p_note, '')), ''),
    'approver_id',     p_approver_id::text,
    'conversation_id', p_conversation_id::text,
    'requested_by',    v_me::text,
    'requested_at',    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'state',           'pending')))
  returning id into v_id;

  -- THE APPROVERS CAN OPEN WHAT THEY ARE BEING ASKED ABOUT. Without this the queue would
  -- hand somebody a decision and refuse them the row it is about.
  if p_approver_id is not null and not custom.query_is_store_owner() then
    perform custom.share_grant(p_organization_id, v_id, 'person', p_approver_id,
                               'admin'::public.permission_level);
  end if;

  return jsonb_build_object(
    'approval_id', v_id,
    'state',       'pending',
    'subject_id',  p_subject_id,
    'subject_kind', v_word,
    'origin',      v_origin,
    'approvers',   v_who,
    'message',     format('This is waiting for %s.',
                     case when jsonb_array_length(v_who) = 1
                          then coalesce(v_who -> 0 ->> 'name', 'somebody')
                          else format('%s people who can approve it', jsonb_array_length(v_who)) end));
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_instantiation_shape(p_organization_id uuid, p_instantiation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_open(p_organization_id, p_instantiation_id,
                                        'custom.work_instantiation_shape',
                                        'viewer'::public.permission_level, 'instantiation');
  return (
    with l as (select r.data as d from custom.record r
                where r.organization_id = p_organization_id and r.id = p_instantiation_id
                  and r.data_class = 'work_instantiation'),
    n as (select rec.id, rec.table_id as tbl
            from l, jsonb_array_elements_text(l.d -> 'records') x
            join custom.record rec
              on rec.organization_id = p_organization_id and rec.id = x::uuid),
    e as (select (select tbl from n where n.id = (er.data ->> 'from')::uuid) as src,
                 (select tbl from n where n.id = (er.data ->> 'to')::uuid)   as dst,
                 er.data ->> 'kind' as kind
            from l, jsonb_array_elements_text(l.d -> 'relations') y
            join custom.record er
              on er.organization_id = p_organization_id and er.id = y::uuid)
    select jsonb_build_object(
      'tables', coalesce((select jsonb_agg(x order by x ->> 'table')
                            from (select jsonb_build_object('table', tbl::text, 'records', count(*)) x
                                    from n group by tbl) t), '[]'::jsonb),
      'edges',  coalesce((select jsonb_agg(x order by x ->> 'from', x ->> 'to')
                            from (select jsonb_build_object('from', src::text, 'to', dst::text,
                                                            'kind', kind, 'n', count(*)) x
                                    from e group by src, dst, kind) t), '[]'::jsonb)));
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_record_states(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(state_id uuid, name text, sort integer, terminal boolean, is_current boolean, allowed boolean, refusal text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record;
  v_states  uuid;
  v_current uuid;
begin
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.work_record_states',
                                        'viewer'::public.permission_level, 'record');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such record in this organization.' using errcode = '02000';
  end if;
  v_current := nullif(v_row.data ->> 'status', '')::uuid;

  select f.data #>> '{config,options_table_id}' into v_states
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = v_row.table_id
     and f.data ->> 'key' = 'status'
   limit 1;
  if v_states is null then
    return;
  end if;

  return query
    select s.id,
           s.data ->> 'name',
           coalesce((s.data ->> 'sort')::integer, 0),
           coalesce((s.data ->> 'terminal')::boolean, false),
           s.id = v_current,
           v_current is null
             or s.id = v_current
             or (select c.data -> 'next' ? (s.data ->> 'name')
                   from custom.record c
                  where c.organization_id = p_organization_id and c.id = v_current),
           case when v_current is null or s.id = v_current then null
                else custom.work_transition_refusal(p_organization_id, v_current, s.id) end
      from custom.record s
     where s.organization_id = p_organization_id
       and s.table_id = v_states
       and s.deleted_at is null
     order by coalesce((s.data ->> 'sort')::integer, 0);
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_template_shape(p_organization_id uuid, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_open(p_organization_id, p_template_id,
                                        'custom.work_template_shape',
                                        'viewer'::public.permission_level, 'template');
  return (
    with g as (select r.data -> 'graph' as graph from custom.record r
                where r.organization_id = p_organization_id and r.id = p_template_id
                  and r.data_class = 'work_template'),
    n as (select e ->> 'ref' as ref, (e ->> 'table')::uuid as tbl
            from g, jsonb_array_elements(g.graph -> 'nodes') e),
    e as (select (select tbl from n where n.ref = r ->> 'from') as src,
                 (select tbl from n where n.ref = r ->> 'to')   as dst,
                 coalesce(r ->> 'kind', 'owned') as kind
            from g, jsonb_array_elements(coalesce(g.graph -> 'relations', '[]'::jsonb)) r)
    select jsonb_build_object(
      'tables', coalesce((select jsonb_agg(x order by x ->> 'table')
                            from (select jsonb_build_object('table', tbl::text, 'records', count(*)) x
                                    from n group by tbl) t), '[]'::jsonb),
      'edges',  coalesce((select jsonb_agg(x order by x ->> 'from', x ->> 'to')
                            from (select jsonb_build_object('from', src::text, 'to', dst::text,
                                                            'kind', kind, 'n', count(*)) x
                                    from e group by src, dst, kind) t), '[]'::jsonb)));
end
$function$;

