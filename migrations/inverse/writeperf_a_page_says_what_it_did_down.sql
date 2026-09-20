-- inverse of writeperf_a_page_says_what_it_did.sql
-- WHAT THIS DOES NOT UNDO, AND WHY: nothing. Every one of the twenty-two bodies below is the
-- byte-for-byte live body read out of the catalogue on 2026-09-20 before the file was applied,
-- so running this puts the store back to substituting page sizes in silence. The two knob rows
-- and the client-door row are removed with it. No data was written by the file, so none is lost.

-- ── custom.read_records (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.read_records(p_organization_id uuid, p_table_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_set      record;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records');
  if p_limit is null or p_limit < 1 or p_limit > 1000 then p_limit := 200; end if;

  -- STEP 2, once per table per request: which fields this caller may see, at which level.
  -- The level used for the field question is the caller's level on the TABLE, so a page of
  -- a hundred records asks the field question once, not a hundred times (DOOR-10's shape).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  -- Only the fields that are actually hidden get a notice.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- STEP 1, ONCE: Visibility. `custom.visible_set` asks the ONE ladder a bounded number of
  -- times — once per visibility class, once per granted id, once per container — and hands back
  -- a predicate the planner can drive an index with. The comment this door used to carry is now
  -- true of the code under it (VIS-N-1; DOOR-10: filtered INSIDE the query, never post-filtered).
  v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where custom.has_visibility(v_me, 'record', r.id, 'viewer')
         and r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;

  elsif v_set.o_all_visible then
    -- THE ORDINARY PAGE. Every live row of this Table is this caller's to see, so the scan
    -- carries no visibility predicate at all and the LIMIT stops it at p_limit rows.
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;

  elsif coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
    -- A CLASS THIS CALLER HOLDS, WITH EXCEPTIONS. A granted id is never answered by its class:
    -- a grant addressed to this person on that record replaces what membership confers (VIS-19),
    -- so it is excluded from the class arm and admitted only by its own answer. Containment is a
    -- separate arm and only ever adds (VIS-6).
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;

  else
    -- NOTHING THIS CALLER HOLDS BY CLASS — `shared_only`, or a Table nobody shared with them.
    -- What is left is small and named: the rows this person made, the rows somebody gave them,
    -- and the rows a container they reach carries.
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;
  end if;
end;
$function$;

-- ── custom.record_history (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.record_history(p_organization_id uuid, p_record_id uuid, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(version integer, occurred_at timestamp with time zone, operation text, operation_label text, actor jsonb, changes jsonb, migration_id uuid, undoable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table  uuid;
  v_people jsonb;
  v_mask   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_history');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.record_history',
                                        'viewer'::public.permission_level, 'record');

  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  v_mask := custom.read_mask(p_organization_id, p_record_id, 'read');

  select custom.history_people(
           p_organization_id,
           array(select distinct a.id from (
                   select v.actor_id as id
                     from history.record_versions(p_organization_id, p_record_id) v
                   union
                   select (e.value ->> 'on_behalf_of')::uuid
                     from history.record_versions(p_organization_id, p_record_id) v,
                          lateral jsonb_each(
                            case when jsonb_typeof(v.row_data -> 'data' -> '_values') = 'object'
                                 then v.row_data -> 'data' -> '_values' else '{}'::jsonb end) e
                    where (e.value ->> 'on_behalf_of') is not null) a
                  where a.id is not null))
    into v_people;

  return query
    select w.version,
           w.occurred_at,
           coalesce(w.operation_name, lower(w.operation)) as operation,
           case
             when w.operation_name is not null then
               w.operation_name || case w.operation
                                     when 'SOFT_DELETE' then ' (record removed)'
                                     when 'RESTORE'     then ' (record restored)'
                                     when 'INSERT'      then ' (record created)'
                                     else '' end
             when w.operation = 'INSERT'      then 'created'
             when w.operation = 'UPDATE'      then 'edited'
             when w.operation = 'SOFT_DELETE' then 'deleted'
             when w.operation = 'RESTORE'     then 'restored'
             else lower(w.operation)
           end as operation_label,
           custom.history_actor(w.actor_tier, w.row_data -> 'data', w.actor_id, v_people),
           -- THE MASK. A change to a field this reader may not see is still a CHANGE — the
           -- panel says "Tax ID was edited" and who edited it, which is the audit trail — but
           -- the before and the after do not leave, and the entry says why.
           coalesce((select jsonb_agg(
                              case when custom.mask_says_withheld(v_mask, c ->> 'key')
                                   then (c - 'before' - 'after' - 'alternates')
                                        || custom.withheld_marker(v_mask, c ->> 'key')
                                   else c end
                              order by ord)
                       from jsonb_array_elements(
                              custom.history_changes(p_organization_id, v_table,
                                                     coalesce(w.previous_data, '{}'::jsonb),
                                                     coalesce(w.row_data -> 'data', '{}'::jsonb)))
                              with ordinality as e(c, ord)),
                    '[]'::jsonb),
           w.migration_id,
           (w.migration_id is not null
            and exists (select 1 from history.migration_log m
                         where m.id = w.migration_id
                           and m.organization_id = p_organization_id
                           and m.undone_at is null)) as undoable
      from (select v.*,
                   lag(v.row_data -> 'data') over (order by v.version) as previous_data
              from (select rv.version, rv.operation, rv.occurred_at, rv.actor_id,
                           rv.row_data, rv.migration_id, rv.operation_name,
                           hv.actor_tier
                      from history.record_versions(p_organization_id, p_record_id) rv
                      left join lateral (
                        select h.actor_tier
                          from history.row_versions h
                         where h.entity_type = 'custom.record'
                           and h.organization_id = p_organization_id
                           and h.row_id = p_record_id
                           and h.version = rv.version
                           and h.occurred_at = rv.occurred_at
                         limit 1) hv on true) v) w
     order by w.version desc, w.occurred_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;

-- ── custom.field_history (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.field_history(p_organization_id uuid, p_table_id uuid, p_field_key text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_record_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(record_id uuid, record_title text, version integer, occurred_at timestamp with time zone, operation_label text, actor jsonb, before jsonb, after jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_people jsonb;
  v_titlek text;
  v_sql    text;
  v_ids    uuid[];
  v_me     uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_history');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.field_history');

  if coalesce(btrim(coalesce(p_field_key, '')), '') = '' then
    raise exception 'custom.field_history: name the column whose history you want.'
      using errcode = '22004',
            hint = 'custom.applicable_fields(organization, table, null) lists this table''s columns with their keys.';
  end if;

  if not exists (select 1
                   from custom.applicable_fields(p_organization_id, p_table_id, null) f
                  where (f.data ->> 'key') = p_field_key) then
    raise exception 'This table has no column called "%", so there is no history of it.', p_field_key
      using errcode = '22023',
            hint = 'Check the column''s name on the table''s own settings panel — the history is kept per column key, and a renamed column keeps the key it was declared with.';
  end if;

  select nullif(t.data ->> 'title_field', '') into v_titlek
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id();

  v_sql := format(
    'select array_agg(r.id) from custom.record r
      where r.organization_id = %L::uuid and r.table_id = %L::uuid and %s %s',
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    case when p_record_id is null then ''
         else format('and r.id = %L::uuid', p_record_id) end);
  execute v_sql into v_ids;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return;
  end if;

  select custom.history_people(
           p_organization_id,
           array(select distinct h.actor_id
                   from history.row_versions h
                  where h.entity_type = 'custom.record'
                    and h.organization_id = p_organization_id
                    and h.row_id = any (v_ids)
                    and h.actor_id is not null))
    into v_people;

  return query
  with masks as (
    -- ONE mask per record this person may see, and nothing more: the id set is already the
    -- read door's own answer, so this adds the FIELD question to the ROW question.
    select i.id as row_id, custom.read_mask(p_organization_id, i.id, 'read') as m
      from unnest(v_ids) i(id)
  )
    select w.row_id,
           coalesce(nullif(btrim(coalesce(
                      case when v_titlek is null then null
                           else w.row_data -> 'data' ->> v_titlek end, '')), ''),
                    'Untitled'),
           w.version,
           w.occurred_at,
           case
             when w.operation_name is not null then w.operation_name
             when w.operation = 'INSERT'      then 'created'
             when w.operation = 'SOFT_DELETE' then 'deleted'
             when w.operation = 'RESTORE'     then 'restored'
             else 'edited'
           end,
           custom.history_actor(w.actor_tier, w.row_data -> 'data', w.actor_id, v_people),
           case when custom.mask_says_withheld(mk.m, p_field_key)
                then custom.withheld_marker(mk.m, p_field_key)
                else w.previous_data -> p_field_key end,
           case when custom.mask_says_withheld(mk.m, p_field_key)
                then custom.withheld_marker(mk.m, p_field_key)
                else w.row_data -> 'data' -> p_field_key end
      from (select h.row_id, h.version, h.operation, h.operation_name, h.occurred_at,
                   h.actor_id, h.actor_tier, h.row_data,
                   lag(h.row_data -> 'data') over (partition by h.row_id order by h.version)
                     as previous_data
              from history.row_versions h
             where h.entity_type = 'custom.record'
               and h.organization_id = p_organization_id
               and h.row_id = any (v_ids)) w
      join masks mk on mk.row_id = w.row_id
     where (coalesce(w.previous_data, '{}'::jsonb) -> p_field_key)
             is distinct from (coalesce(w.row_data -> 'data', '{}'::jsonb) -> p_field_key)
     order by w.occurred_at desc, w.row_id, w.version desc
     limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;

-- ── custom.work_list (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.work_list(p_organization_id uuid, p_flavour text DEFAULT 'mine'::text, p_include_finished boolean DEFAULT false, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(record_id uuid, table_id uuid, table_name text, title text, assignee_id uuid, assignee_name text, assignee_user_id uuid, due_on timestamp with time zone, due_state text, status text, terminal boolean, assigned_by uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid;
  v_person uuid;
  v_flav   text := lower(coalesce(nullif(btrim(p_flavour), ''), 'mine'));
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_list');
  if v_flav not in ('mine', 'assigned', 'unassigned') then
    raise exception 'There are three work lists: mine, assigned and unassigned, and "%" is none of them.', p_flavour
      using errcode = '22023',
            hint = '`mine` is what is waiting on you, `assigned` is what you gave to other people, `unassigned` is what is waiting on somebody being chosen.';
  end if;
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;
  v_person := custom.work_person(p_organization_id, v_me, false);
  if v_flav = 'mine' and v_person is null then
    return;
  end if;

  return query
    select r.id,
           r.table_id,
           t.data ->> 'name',
           r.data ->> coalesce(t.data ->> 'title_field', 'name'),
           p.id,
           p.data ->> 'name',
           nullif(p.data ->> 'user_id', '')::uuid,
           nullif(r.data ->> 'due_date', '')::timestamptz,
           case when coalesce((s.data ->> 'terminal')::boolean, false) then 'finished'
                when nullif(r.data ->> 'due_date', '') is null                        then 'undated'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) then 'overdue'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) + interval '1 day'
                                                                                      then 'due_today'
                else 'scheduled' end,
           s.data ->> 'name',
           coalesce((s.data ->> 'terminal')::boolean, false),
           r.updated_by,
           r.updated_at
      from custom.record r
      join custom.record t
        on t.organization_id = r.organization_id
       and t.id = r.table_id
       and t.table_id = custom.table_kernel_id()
      left join custom.record p
        on p.organization_id = r.organization_id
       and p.id = nullif(r.data ->> 'assignee', '')::uuid
       and p.table_id = custom.person_kernel_id()
      left join custom.record s
        on s.organization_id = r.organization_id
       and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
       and s.deleted_at is null
     where r.organization_id = p_organization_id
       and r.deleted_at is null
       and r.data_class = 'record'
       and (coalesce(p_include_finished, false)
            or not coalesce((s.data ->> 'terminal')::boolean, false))
       and case v_flav
             when 'mine'       then nullif(r.data ->> 'assignee', '')::uuid = v_person
             when 'unassigned' then nullif(r.data ->> 'assignee', '') is null
                                and r.data ? 'status'
             else                   nullif(r.data ->> 'assignee', '') is not null
                                and nullif(r.data ->> 'assignee', '')::uuid is distinct from v_person
                                and r.updated_by = v_me
           end
       -- THE ONE LADDER, row by row. The candidate set is already narrow (one person's work
       -- inside one organization), so the per-row question is the honest one to ask here.
       and (custom.query_is_store_owner()
            or custom.has_visibility(v_me, 'record', r.id, 'viewer'::public.permission_level))
     order by case when coalesce((s.data ->> 'terminal')::boolean, false) then 2
                   when nullif(r.data ->> 'due_date', '') is null then 1 else 0 end,
              nullif(r.data ->> 'due_date', '')::timestamptz nulls last,
              r.updated_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end
$function$;

-- ── custom.work_inbox (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.work_inbox(p_organization_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_decided boolean DEFAULT false)
 RETURNS TABLE(item_id uuid, kind text, origin text, title text, subject_id uuid, subject_kind text, summary text, state text, due_on timestamp with time zone, due_state text, actionable boolean, requested_by uuid, requested_by_name text, at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_inbox');
  if v_me is null and not custom.query_is_store_owner() then
    return;
  end if;

  return query
  with approvals as (
    select r.id, r.data as d, r.created_at, r.updated_at
      from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'work_approval'
       and r.deleted_at is null
       and (coalesce(p_include_decided, false) or coalesce(r.data ->> 'state', 'pending') = 'pending')
       and custom.work_approval_may_decide(p_organization_id, r.id)
  )
  select a.id,
         case when coalesce(a.d ->> 'origin', 'person') = 'agent' then 'proposal' else 'approval' end,
         coalesce(a.d ->> 'origin', 'person'),
         case when (a.d -> 'change') ->> 'kind' = 'field_add'
              then format('Add %s to %s',
                          coalesce(nullif(a.d #>> '{change,field,label}', ''),
                                   nullif(a.d #>> '{change,field,key}', ''), 'a column'),
                          coalesce(a.d ->> 'subject_title', 'a table'))
              else format('Change %s', coalesce(a.d ->> 'subject_title', 'a record')) end,
         nullif(a.d ->> 'subject_id', '')::uuid,
         coalesce(a.d ->> 'subject_kind', 'record'),
         coalesce(nullif(a.d ->> 'note', ''),
                  case when (a.d -> 'change') ->> 'kind' = 'field_add'
                       then 'A new column on a table that already existed.'
                       else (select string_agg(k, ', ' order by k)
                               from jsonb_object_keys(a.d #> '{change,patch}') k) end),
         coalesce(a.d ->> 'state', 'pending'),
         null::timestamptz,
         null::text,
         coalesce(a.d ->> 'state', 'pending') = 'pending',
         nullif(a.d ->> 'requested_by', '')::uuid,
         (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                          nullif(u.raw_user_meta_data ->> 'full_name', ''),
                          split_part(u.email::text, '@', 1))::text
            from auth.users u where u.id = nullif(a.d ->> 'requested_by', '')::uuid),
         a.created_at
    from approvals a
  union all
  select w.record_id, 'assignment', 'person',
         coalesce(w.title, 'Untitled'), w.record_id, 'record',
         format('%s · %s', coalesce(w.table_name, 'a table'), coalesce(w.status, 'no state')),
         coalesce(w.status, 'open'), w.due_on, w.due_state, true,
         w.assigned_by,
         (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                          nullif(u.raw_user_meta_data ->> 'full_name', ''),
                          split_part(u.email::text, '@', 1))::text
            from auth.users u where u.id = w.assigned_by),
         w.updated_at
    from custom.work_list(p_organization_id, 'mine', coalesce(p_include_decided, false), 500, 0) w
   order by 11 desc, 8 nulls last, 14 desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end
$function$;

-- ── custom.anon_submissions (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.anon_submissions(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_state text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, form_id uuid, inbound_id uuid, table_id uuid, source text, state text, payload jsonb, raw_payload jsonb, client_key text, record_id uuid, remote_origin text, rejection_reason text, created_at timestamp with time zone, cleared_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_submissions');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.anon_submissions');
  if p_table_id is not null then
    perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.anon_submissions',
                                          'admin'::public.permission_level, 'record');
  end if;
  v_me := custom.query_principal();

  return query
    select s.id, s.form_id, s.inbound_id, s.table_id, s.source, s.state, s.payload,
           s.raw_payload, s.client_key, s.record_id, s.remote_origin, s.rejection_reason,
           s.created_at, s.cleared_at
      from custom.anon_submission s
     where s.organization_id = p_organization_id
       and s.deleted_at is null
       and (p_table_id is null or s.table_id = p_table_id)
       and (p_state is null or s.state = p_state)
       -- EVERY ROW ON THE ONE LADDER, at ADMIN. What a stranger sent is not a value of the
       -- Table yet and it is not shown to everybody who may read the Table's records.
       and (v_me is null
            or custom.has_visibility(v_me, 'record', s.table_id, 'admin'::public.permission_level))
     order by s.created_at desc, s.id desc
     limit greatest(least(coalesce(p_limit, 100), 500), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

-- ── custom.query_across_homes (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.query_across_homes(p_organization_id uuid, p_table_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, home_record_id uuid, data jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_across_homes');
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.query_across_homes: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  return query execute format($q$
  with homes as (select h from custom.query_table_homes($1, $2) h)
  select r.id,
         -- The record's own Home: the nearest ancestor in its containment chain that is one
         -- of this Table's Homes. A record directly under a Home has depth 1; a record three
         -- containers down still reports the Home it ultimately sits in.
         (select c.ancestor_id
            from custom.containment_chain($1, r.id) c
            join homes on homes.h = c.ancestor_id
           order by c.depth
           limit 1),
         custom.choice_render($1, $2, r.data),
         r.created_at
    from custom.record r
   where r.organization_id = $1
     and r.table_id = $2
     and r.deleted_at is null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and %s
   order by r.created_at desc, r.id
   limit $3 offset $4
  $q$, custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                    p_required::public.permission_level, 'r'))
  using p_organization_id, p_table_id,
        greatest(coalesce(p_limit, 50), 0), greatest(coalesce(p_offset, 0), 0);
end;
$function$;

-- ── custom.query_by_coordinates (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.query_by_coordinates(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_coordinates jsonb DEFAULT '[]'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, table_id uuid, data jsonb, coordinates_matched integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_n integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_by_coordinates');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.query_by_coordinates');
  end if;
  if p_organization_id is null then
    raise exception 'custom.query_by_coordinates: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if jsonb_typeof(coalesce(p_coordinates, '[]'::jsonb)) <> 'array' then
    raise exception 'custom.query_by_coordinates: p_coordinates is a JSON ARRAY of coordinates, one object per relation end; got %',
                    jsonb_typeof(p_coordinates)
      using errcode = '22023',
            hint = 'e.g. [{"role":"client","target_id":"…"},{"role":"project","target_id":"…","direction":"to"}]. An empty array means no coordinate constraint, which is the whole Table.';
  end if;

  select count(*) into v_n from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb));

  return query execute format($q$
  with coord as (
    select ord                                        as n,
           c ->> 'role'                               as role,
           (c ->> 'target_id')::uuid                  as target_id,
           coalesce(c ->> 'direction', 'from')        as direction
      from jsonb_array_elements(coalesce($1, '[]'::jsonb))
           with ordinality as t(c, ord)
  ),
  -- ONE pass over the edges: every record that satisfies at least one coordinate, with the
  -- count of DISTINCT coordinates it satisfies. Two edges answering the same coordinate count
  -- once, which is why `distinct co.n` and not `count(*)`.
  hit as (
    select case when co.direction = 'to' then a.source_id else a.target_id end as other_id,
           case when co.direction = 'to' then a.target_id else a.source_id end as rec_id,
           co.n
      from coord co
      join platform.associations a
        on a.organization_id = $2
       and a.deleted_at is null
       and a.relation_field_id is not null
       and (co.role is null or a.role = co.role)
       and ((co.direction = 'from' and a.source_type = 'record'
             and a.target_id = co.target_id)
         or (co.direction = 'to'
             and a.source_id = co.target_id))
  ),
  satisfied as (
    select rec_id, count(distinct n)::integer as matched
      from hit
     group by rec_id
    having count(distinct n) = $3
  )
  select r.id, r.table_id, custom.choice_render($2, r.table_id, r.data), coalesce(s.matched, 0)
    from custom.record r
    left join satisfied s on s.rec_id = r.id
   where r.organization_id = $2
     and ($4::uuid is null or r.table_id = $4::uuid)
     and r.deleted_at is null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and %s
     and ($3 = 0 or s.rec_id is not null)
   order by r.created_at desc, r.id
   limit $5 offset $6
  $q$, custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                    p_required::public.permission_level, 'r'))
  using coalesce(p_coordinates, '[]'::jsonb), p_organization_id, v_n, p_table_id,
        greatest(coalesce(p_limit, 50), 0), greatest(coalesce(p_offset, 0), 0);
end;
$function$;

-- ── custom.query_table_as_of (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.query_table_as_of(p_organization_id uuid, p_table_id uuid, p_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_world_on date DEFAULT NULL::date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, data jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_table_as_of');
  return query
select v, custom.query_record_as_of(p_organization_id, v, p_recorded_at, p_world_on, p_required)
    from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
    join custom.record r on r.organization_id = p_organization_id and r.id = v
   order by r.created_at desc, r.id
   limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

-- ── custom.io_export (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.io_export(p_organization_id uuid, p_table_id uuid, p_columns text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10000, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols   text[];
  v_token  text;
  v_rows   jsonb;
  v_held   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_export');
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  v_cols := coalesce(p_columns,
    (select array_agg(f.data ->> 'key' order by coalesce((f.data ->> 'sort')::int, 0),
                                                 f.data ->> 'key')
       from custom.applicable_fields(p_organization_id, p_table_id, null) f),
    (select array_agg(k order by k)
       from (select distinct jsonb_object_keys(r.data) k
               from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = p_table_id
                and r.deleted_at is null) ks
      where left(k, 1) <> '_'),
    array[]::text[]);

  -- THE READ DOOR DECIDES BOTH QUESTIONS NOW: which rows, and which cells of them.
  -- `custom.read_records` already choice-renders and already carries `_hidden`.
  select coalesce(jsonb_agg(x.doc order by x.ord), '[]'::jsonb),
         coalesce(jsonb_object_agg(h.key, h.value), '{}'::jsonb)
    into v_rows, v_held
    from (select row_number() over () as ord,
                 (select coalesce(jsonb_object_agg(c, coalesce(rr.document -> c, 'null'::jsonb)),
                                  '{}'::jsonb)
                    from unnest(v_cols) c) as doc,
                 rr.document -> '_hidden' as hidden
            from custom.read_records(p_organization_id, p_table_id, false,
                                     greatest(1, least(coalesce(p_limit, 10000), 100000)), 0) rr) x
    left join lateral jsonb_each(coalesce(x.hidden, '{}'::jsonb)) h on true;

  -- NOTHING FAILS SILENTLY: a column the store withheld from this reader is named with the
  -- store's own reason, beside an export whose cells for it read `null`.
  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows,
                            'withheld', v_held,
                            'choices', custom.choice_field_map(p_organization_id, p_table_id));
end;
$function$;

-- ── custom.io_import_report (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.io_import_report(p_organization_id uuid, p_import_id uuid, p_state text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_keep constant integer := 500;
  v_run  custom.io_import;
  v_kept integer;
  v_all  integer;
  v_rows jsonb;
  v_lim  integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_off  integer := greatest(coalesce(p_offset, 0), 0);
  v_what text := lower(coalesce(nullif(btrim(coalesce(p_state, '')), ''), 'refused'));
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_report');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'There is no import run here.' using errcode = '23503';
  end if;
  perform custom.assert_may_know_table(p_organization_id, v_run.table_id, 'custom.io_import_report');

  if v_what not in ('refused', 'duplicate') then
    raise exception 'The rows this can show you are the ones that were refused and the ones that were already here, not "%".', v_what
      using errcode = '22023',
            hint = 'The rows that landed are records of the table — open the table to see them.';
  end if;

  if v_what = 'refused' then
    v_all  := v_run.rows_seen - v_run.rows_written - v_run.rows_duplicate;
    v_kept := jsonb_array_length(coalesce(v_run.refusals, '[]'::jsonb));
    select coalesce(jsonb_agg(value), '[]'::jsonb) into v_rows
      from (select value from jsonb_array_elements(coalesce(v_run.refusals, '[]'::jsonb))
             offset v_off limit v_lim) s;
  else
    v_all  := v_run.rows_duplicate;
    v_kept := jsonb_array_length(coalesce(v_run.duplicates, '[]'::jsonb));
    select coalesce(jsonb_agg(value), '[]'::jsonb) into v_rows
      from (select value from jsonb_array_elements(coalesce(v_run.duplicates, '[]'::jsonb))
             offset v_off limit v_lim) s;
  end if;

  return jsonb_build_object(
    'import_id',  p_import_id,
    'table_id',   v_run.table_id,
    'state',      v_what,
    'rows',       v_rows,
    'kept',       v_kept,
    'total',      v_all,
    -- THE CAP, SAID OUT LOUD. A number with nothing behind it is the failure this closes; a
    -- number that says which part it can show is honest.
    'capped',     v_kept >= c_keep and v_all > v_kept,
    'note',       case when v_kept >= c_keep and v_all > v_kept
                       then format('This run kept the first %s of %s. The other %s were counted, not kept — re-run the file against the same table to see them, or fix these first.',
                                   v_kept, v_all, v_all - v_kept)
                       else null end);
end;
$function$;

-- ── custom.io_imports (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.io_imports(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_imports');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_imports');
  end if;
  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.opened_at desc), '[]'::jsonb) into v_out
    from (
      select i.id as import_id, i.table_id, i.format, i.source_name, i.file_hash,
             i.dedupe_key, i.policy, i.state, i.rows_seen, i.rows_written, i.rows_duplicate,
             i.rows_seen - i.rows_written - i.rows_duplicate as rows_refused,
             jsonb_array_length(coalesce(i.proposals, '[]'::jsonb)) as columns_offered,
             i.created_at as opened_at, i.finished_at, i.created_by
        from custom.io_import i
       where i.organization_id = p_organization_id
         and i.deleted_at is null
         and (p_table_id is null or i.table_id = p_table_id)
         -- A RUN IS ON A TABLE, so who may know about the run is who may know about the
         -- table. Listing every organization's runs to any member would name Tables they
         -- cannot open (T10).
         and custom.table_is_live(p_organization_id, i.table_id)
       order by i.created_at desc
       limit least(greatest(coalesce(p_limit, 25), 1), 200)) s;
  return v_out;
end;
$function$;

-- ── custom.entity_records_find (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.entity_records_find(p_organization_id uuid, p_token text, p_key text, p_value jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  t      record;
  v_rows jsonb;
  v_lim  int := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  perform custom.assert_entity_door(p_organization_id, 'custom.entity_records_find');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);

  if not exists (select 1 from custom.entity_fields(p_organization_id, p_token) f
                  where f.data ->> 'key' = p_key) then
    raise exception '% has no custom field called "%" in this organization.', t.label, p_key
      using errcode = '23514',
            hint = 'REC-40 / FLD-8: filtering by a field nobody declared would quietly return nothing and look like an empty result. Declare it first, or ask for the fields this table has.';
  end if;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object('
    || '''id'', x.id, ''title'', %s, ''value'', x.custom_fields -> $1) order by x.id), ''[]''::jsonb) '
    || 'from (select * from %I.%I y where y.organization_id = $2 '
    ||       'and y.custom_fields ? $1 '
    ||       'and ($3::jsonb is null or y.custom_fields -> $1 = $3) '
    ||       '%s order by y.id limit $4 offset $5) x',
    case when t.title_column is null then 'null::text' else format('x.%I::text', t.title_column) end,
    t.schema_name, t.table_name,
    case when t.has_deleted_at then 'and y.deleted_at is null' else '' end)
    into v_rows using p_key, p_organization_id, p_value, v_lim, greatest(coalesce(p_offset, 0), 0);

  return jsonb_build_object('token', t.token, 'label', t.label, 'key', p_key,
                            'value', p_value, 'rows', v_rows,
                            'count', jsonb_array_length(v_rows));
end
$function$;

-- ── custom.migrations (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.migrations(p_organization_id uuid, p_target_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, verb text, target_kind text, target_id uuid, note text, applied_at timestamp with time zone, applied_by uuid, undone_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrations');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrations');
  if p_target_id is not null then
    perform custom.assert_client_may_open(p_organization_id, p_target_id, 'custom.migrations',
                                          'viewer'::public.permission_level, 'record');
  end if;
  v_me := custom.query_principal();

  return query
    select m.id, m.verb, m.target_kind, m.target_id, m.note, m.applied_at, m.applied_by, m.undone_at
      from history.migration_log m
     where m.organization_id = p_organization_id
       and (p_target_id is null or m.target_id = p_target_id)
       -- EVERY ROW ON THE ONE LADDER. A migration is about a thing; if you may not open the
       -- thing you are not told what happened to it. A row whose target is already gone is
       -- shown to a member of the organization, because there is nothing left to decide and
       -- hiding the record of a deletion is how a history stops being one.
       and (v_me is null
            or custom.has_visibility(v_me, 'record', m.target_id, 'viewer'::public.permission_level)
            or not exists (select 1 from custom.record r
                            where r.organization_id = p_organization_id and r.id = m.target_id))
     order by m.applied_at desc, m.id desc
     limit greatest(least(coalesce(p_limit, 100), 500), 1);
end;
$function$;

-- ── custom.share_people (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.share_people(p_organization_id uuid, p_subject_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 25)
 RETURNS TABLE(user_id uuid, email text, display_name text, membership text, already_at permission_level, already_why text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row custom.record;
begin
  -- The organization wall first, exactly as every other door in this store. A picker that
  -- listed another organization's people would BE the leak.
  perform custom.assert_client_may_reach(p_organization_id, 'share_people');

  -- And if a record is named, the same one ladder decides whether this caller may be told
  -- anything about who reaches it — the picker is part of the share surface, not beside it.
  if p_subject_id is not null then
    perform custom.assert_client_may_open(p_organization_id, p_subject_id, 'share_people',
                                          'viewer'::public.permission_level, 'record');
    select r.* into v_row from custom.record r
     where r.organization_id = p_organization_id and r.id = p_subject_id;
    if not found then
      raise exception 'That record is not in this organization.' using errcode = '02000';
    end if;
  end if;

  return query
  select m.user_id,
         u.email::text,
         coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                  nullif(u.raw_user_meta_data ->> 'full_name', ''),
                  split_part(u.email::text, '@', 1))::text,
         m.role::text,
         case when p_subject_id is null then null
              else custom.effective_level(m.user_id, p_organization_id, p_subject_id, 'record') end,
         case when p_subject_id is null then null
              when m.user_id = v_row.created_by then 'Created it'
              when exists (select 1 from iam.permissions p
                            where p.resource_type = 'record' and p.resource_id = p_subject_id
                              and p.granted_to_user_id = m.user_id
                              and p.status <> 'rejected'
                              and (p.expires_at is null or p.expires_at > now()))
                then 'Shared with them directly'
              when custom.effective_level(m.user_id, p_organization_id, p_subject_id, 'record') is not null
                then 'Reaches it another way — see who has access'
              else null end
    from iam.organization_member m
    join auth.users u on u.id = m.user_id
   where m.organization_id = p_organization_id
     and (p_query is null or btrim(p_query) = ''
          or u.email::text ilike '%' || btrim(p_query) || '%'
          or coalesce(u.raw_user_meta_data ->> 'display_name', '') ilike '%' || btrim(p_query) || '%'
          or coalesce(u.raw_user_meta_data ->> 'full_name', '')   ilike '%' || btrim(p_query) || '%')
   order by 3
   limit greatest(1, least(coalesce(p_limit, 25), 200));
end;
$function$;

-- ── custom.checklist_runs (restored) ─────────────────────────────────────
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
     limit greatest(1, least(coalesce(p_limit, 100), 200));
end
$function$;

-- ── custom.checklist_templates (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.checklist_templates(p_organization_id uuid, p_about_table_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(template_id uuid, name text, about_table_id uuid, about_table text, steps integer, roles integer, trigger_kind text, trigger_status text, open_runs integer, total_runs integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_templates');
  return query
    select c.id,
           c.data ->> 'name',
           nullif(c.data ->> 'about_table_id', '')::uuid,
           t.data ->> 'name',
           jsonb_array_length(coalesce(c.data -> 'steps', '[]'::jsonb)),
           jsonb_array_length(coalesce(c.data -> 'roles', '[]'::jsonb)),
           coalesce(c.data #>> '{trigger,kind}', 'manual'),
           nullif(c.data #>> '{trigger,status}', ''),
           (select count(*)::integer from custom.record run
             where run.organization_id = p_organization_id
               and run.data_class = 'checklist_run'
               and run.deleted_at is null
               and nullif(run.data ->> 'template_id', '')::uuid = c.id
               and nullif(run.data ->> 'closed_at', '') is null),
           (select count(*)::integer from custom.record run
             where run.organization_id = p_organization_id
               and run.data_class = 'checklist_run'
               and run.deleted_at is null
               and nullif(run.data ->> 'template_id', '')::uuid = c.id),
           c.updated_at
      from custom.record c
      left join custom.record t
        on t.organization_id = c.organization_id
       and t.id = nullif(c.data ->> 'about_table_id', '')::uuid
     where c.organization_id = p_organization_id
       and c.data_class = 'checklist_template'
       and c.deleted_at is null
       and (p_about_table_id is null
            or nullif(c.data ->> 'about_table_id', '')::uuid = p_about_table_id)
       and (custom.query_is_store_owner()
            or custom.has_visibility(custom.query_principal(), 'record', c.id,
                                     'viewer'::public.permission_level))
     order by c.updated_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 200));
end
$function$;

-- ── custom.work_templates (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.work_templates(p_organization_id uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(template_id uuid, name text, nodes integer, relations integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_me uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_templates');
  v_me := custom.query_principal();
  return query
    select r.id,
           r.data ->> 'name',
           coalesce(jsonb_array_length(r.data #> '{graph,nodes}'), 0),
           coalesce(jsonb_array_length(r.data #> '{graph,relations}'), 0),
           r.created_at
      from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'work_template'
       and r.deleted_at is null
       and (custom.query_is_store_owner()
            or v_me is null
            or custom.has_visibility(v_me, 'record', r.id, 'viewer'::public.permission_level))
     order by r.created_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end
$function$;

-- ── custom.dashboard_stuck (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.dashboard_stuck(p_organization_id uuid, p_table_id uuid, p_state_key text, p_days integer DEFAULT 14, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, title text, state text, last_changed_at timestamp with time zone, days_unchanged numeric, measured_from text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key     text;
  v_state   text;
  v_title   text;
  v_when    text;
  v_from    text;
  v_where   text[] := '{}';
  v_sql     text;
  v_titlek  text;
  v_days    integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_stuck');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.dashboard_stuck');

  v_key  := custom.agg_assert_key(p_state_key);
  v_days := greatest(coalesce(p_days, 14), 1);

  -- The state as a person reads it — through the same value reader every other door uses,
  -- so a Value envelope is unwrapped exactly once in this store and not twice.
  v_state := custom.agg_value_sql(v_key);

  -- WHEN IT LAST MOVED, and where that moment came from.
  v_when := format(
    'coalesce(nullif(r.data -> ''_values'' -> %L ->> ''at'', '''')::timestamptz, r.updated_at)',
    v_key);
  v_from := format(
    'case when nullif(r.data -> ''_values'' -> %L ->> ''at'', '''') is null '
    'then ''the record''''s own last change'' else ''the moment this field was last written'' end',
    v_key);

  -- The title the Table itself declares, so the list reads like the grid does. A Table with
  -- no title_field has rows with no name, and the list says null rather than inventing one.
  select nullif(t.data ->> 'title_field', '') into v_titlek
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id();
  v_title := case when v_titlek is null then 'null::text' else custom.agg_value_sql(v_titlek) end;

  -- The same filter vocabulary the aggregate door takes: a scalar is an equality, an object
  -- is a window. One reading of a filter on this platform, not two.
  if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
    for v_key in select k from jsonb_object_keys(p_filter) k loop
      if jsonb_typeof(p_filter -> v_key) = 'object' then
        v_where := array_append(v_where, custom.dashboard_window_sql(v_key, p_filter -> v_key));
      else
        v_where := array_append(v_where,
          format('%s = %L', custom.agg_value_sql(v_key), p_filter ->> v_key));
      end if;
    end loop;
  end if;

  -- ONE STATEMENT, and Visibility is a predicate in its own WHERE — the same shape
  -- custom.agg_sql builds, for the same reason (DOOR-10, READ-PERF): the rows this person
  -- may not see are never fetched, so they cannot be listed and then hidden.
  v_sql := format($q$
    select r.id,
           (%s)::text as title,
           (%s)::text as state,
           (%s) as last_changed_at,
           round(extract(epoch from (now() - (%s))) / 86400.0, 1)::numeric as days_unchanged,
           (%s)::text as measured_from
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and (%s) < (now() - make_interval(days => %s))
       %s
     order by (%s) asc
     limit %s
  $q$,
    v_title, v_state, v_when, v_when, v_from,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 p_required::public.permission_level, 'r'),
    v_when, v_days,
    case when cardinality(v_where) = 0 then '' else 'and ' || array_to_string(v_where, ' and ') end,
    v_when,
    greatest(least(coalesce(p_limit, 50), 500), 1));

  return query execute v_sql;
end;
$function$;

-- ── custom.enrich_runs (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.enrich_runs(p_organization_id uuid, p_field_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(run_id uuid, field_id uuid, field_key text, model text, trigger_word text, rows_seen integer, rows_written integer, rows_absent integer, rows_below_floor integer, rows_pinned integer, rows_refused integer, cost_cents numeric, cost_per_row_cents numeric, ran_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrich_runs');
  return query
    select x.id,
           nullif(x.data ->> 'field_id', '')::uuid,
           x.data ->> 'field_key',
           x.data ->> 'model',
           x.data ->> 'trigger',
           coalesce((x.data ->> 'rows_seen')::integer, 0),
           coalesce((x.data ->> 'rows_written')::integer, 0),
           coalesce((x.data ->> 'rows_absent')::integer, 0),
           coalesce((x.data ->> 'rows_below_floor')::integer, 0),
           coalesce((x.data ->> 'rows_pinned')::integer, 0),
           coalesce((x.data ->> 'rows_refused')::integer, 0),
           coalesce((x.data ->> 'cost_cents')::numeric, 0),
           nullif(x.data ->> 'cost_per_row_cents', '')::numeric,
           x.created_at
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = custom.organization_kernel_id()
       and x.data_class = custom.enrich_run_class()
       and x.deleted_at is null
       and (p_field_id is null or nullif(x.data ->> 'field_id', '')::uuid = p_field_id)
       -- ONLY OVER TABLES THIS CALLER CAN OPEN (VIS-5). A run names a Table and a column, so
       -- a list of runs is a list of Tables to anybody who can read it.
       and nullif(x.data ->> 'table_id', '')::uuid
             in (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
     order by x.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$function$;

-- ── custom.io_outbox_drain (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.io_outbox_drain(p_organization_id uuid, p_consumer text, p_limit integer DEFAULT 100, p_event_key text DEFAULT 'records.changed'::text)
 RETURNS TABLE(outbox_id uuid, record_id uuid, table_id uuid, operation text, changed_field_ids jsonb, actor jsonb, occurred_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_outbox_drain');
  -- THE MEMBERSHIP DECISION, before anything is claimed. A definer door applies no row-level
  -- security, so this is the only thing standing between a signed-in caller and another
  -- organization's outbox. Same helper the write doors use (w4_door_the_write_doors_are_client_callable.sql).
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_outbox_drain');
  if coalesce(btrim(p_consumer), '') = '' then
    raise exception 'custom.io_outbox_drain: name the consumer. Two consumers draining one organization must be tellable apart, and an unnamed claim is an unrecoverable one.'
      using errcode = '22004';
  end if;

  -- THE CLAIM IS THE READ. One statement, so two consumers running at the same instant split
  -- the queue rather than both taking the same rows: `for update skip locked` inside the
  -- subselect is what makes that true, and `consumed_at is null` is what makes a redelivery
  -- to a crashed consumer impossible without an explicit release.
  return query
  update custom.io_outbox o
     set consumed_at = now(), consumer = p_consumer
   where o.id in (
           select c.id from custom.io_outbox c
            where c.organization_id = p_organization_id
              and c.consumed_at is null
              and c.deleted_at is null
              and c.event_key = p_event_key
            order by c.created_at, c.id
            limit greatest(1, least(coalesce(p_limit, 100), 1000))
            for update skip locked)
  returning o.id, o.record_id, o.table_id, o.operation, o.changed_field_ids, o.actor, o.created_at;
end;
$function$;

-- ── custom.agg_sql (restored) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_group_sel  text[] := '{}';
  v_group_lbl  text[] := '{}';
  v_meas_sel   text[] := '{}';
  v_where      text[] := '{}';
  v_key        text;
  v_op         text;
  v_by         text;
  m            jsonb;
  v_sql        text;
  v_i          integer := 0;
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  -- ── the groups ──────────────────────────────────────────────────────────────
  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    -- `array_append`, never `||`: `anyarray || anycompatible` and `anyarray || anyarray` are
    -- both candidates for `text[] || text`, and PostgreSQL resolves it to the SECOND, casting
    -- the string to text[] and raising `malformed array literal` on the first expression that
    -- contains a comma. Named here because the failure is at run time and reads like a bug in
    -- the caller's data.
    v_group_sel := array_append(v_group_sel, custom.agg_value_sql(v_key));
    v_group_lbl := array_append(v_group_lbl, quote_literal(custom.agg_assert_key(v_key)));
  end loop;

  -- ── the bucket, which is a group whose expression is a date_trunc ───────────
  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_key := custom.agg_assert_key(p_bucket ->> 'key');
    v_by  := lower(coalesce(p_bucket ->> 'by', 'month'));
    if not (v_by = any (custom.agg_buckets())) then
      raise exception 'custom.record_aggregate: "%" is not a bucket', v_by
        using errcode = '22023',
              hint = format('Legal buckets: %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    -- `created_at` is a real column; anything else is a Field read out of the document. Both
    -- are cast to timestamptz, and a value that is not a date makes the ROW absent from the
    -- bucket rather than making the whole answer fail.
    if v_key = 'created_at' then
      v_group_sel := array_append(v_group_sel, format('date_trunc(%L, r.created_at)::text', v_by));
    else
      v_group_sel := array_append(v_group_sel,
        format('date_trunc(%L, (nullif(%s, '''')::timestamptz))::text', v_by, custom.agg_value_sql(v_key)));
    end if;
    v_group_lbl := array_append(v_group_lbl, quote_literal(v_key || '_' || v_by));
  end if;

  -- ── the measures ────────────────────────────────────────────────────────────
  for m in select e from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) e loop
    v_op := lower(coalesce(m ->> 'op', 'count'));
    if not (v_op = any (custom.agg_operations())) then
      raise exception 'custom.record_aggregate: "%" is not a measure', v_op
        using errcode = '22023',
              hint = format('Legal measures: %s.', array_to_string(custom.agg_operations(), ', '));
    end if;
    if v_op = 'count' then
      v_meas_sel := array_append(v_meas_sel, quote_literal('count') || ', count(*)::numeric');
    else
      v_key := custom.agg_assert_key(m ->> 'key');
      v_meas_sel := array_append(v_meas_sel,
        quote_literal(v_op || '_' || v_key) || ', ' ||
        format('%s(nullif(%s, '''')::numeric)::numeric', v_op, custom.agg_value_sql(v_key)));
    end if;
  end loop;
  if cardinality(v_meas_sel) = 0 then
    v_meas_sel := array[quote_literal('count') || ', count(*)::numeric'];
  end if;

  -- ── the filter, in the same WHERE as Visibility ─────────────────────────────
  --
  -- A SCALAR IS AN EQUALITY, exactly as it always was. AN OBJECT IS A WINDOW — the one new
  -- shape this file adds, so that the eighth verb can answer "this month" without either
  -- reading every month ever or letting a browser do the filtering (DOOR-10).
  if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
    for v_key in select k from jsonb_object_keys(p_filter) k loop
      if jsonb_typeof(p_filter -> v_key) = 'object' then
        v_where := array_append(v_where, custom.dashboard_window_sql(v_key, p_filter -> v_key));
      else
        v_where := array_append(v_where,
          format('%s = %L', custom.agg_value_sql(v_key), p_filter ->> v_key));
      end if;
    end loop;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ONE STATEMENT, and Visibility is a PREDICATE in its own WHERE rather than a list of
  -- ids joined back — which is what AGT-N-8's "inside the read door's own query" and
  -- DOOR-10's "never post-filtered" actually ask for, and what lets the planner prune the
  -- partition and drive the index instead of probing the primary key once per visible id.
  -- The aggregate is still computed over exactly the rows this principal may see, and the
  -- rows they may not see are still never fetched at all (READ-PERF).
  -- ══════════════════════════════════════════════════════════════════════════
  v_sql := format($q$
    select %s as groups,
           jsonb_build_object(%s) as measures,
           count(*)::bigint as row_count
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
     %s
     %s
     order by count(*) desc
     limit %s
  $q$,
    case when cardinality(v_group_sel) = 0 then '''{}''::jsonb'
         else 'jsonb_build_object(' ||
              (select string_agg(v_group_lbl[i] || ', ' || v_group_sel[i], ', ')
                 from generate_subscripts(v_group_sel, 1) i) || ')' end,
    array_to_string(v_meas_sel, ', '),
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 p_required::public.permission_level, 'r'),
    case when cardinality(v_where) = 0 then '' else 'and ' || array_to_string(v_where, ' and ') end,
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    greatest(coalesce(p_limit, 200), 1));

  return v_sql;
end;
$function$;


drop function if exists custom.silent_page_doors();
drop function if exists custom.page_contract(uuid);
drop function if exists custom.page_size(uuid, text, integer, integer, integer);
drop function if exists custom.export_ceiling(uuid);
drop function if exists custom.page_ceiling(uuid);
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'page_contract';
delete from platform.feature_knob
 where feature = 'custom' and key in ('page_size_ceiling', 'export_rows_ceiling');
