-- chair-step: puts back the thirteen bodies that printed a uuid where a name belongs, exactly as they were at 2026-09-21 05:10Z, and drops the two resolvers they were taught to call.
--
-- lane TAILS-2 · the inverse of `tails2_a_name_belongs_where_a_name_belongs.sql`.
-- Every body below is the verbatim `pg_get_functiondef` taken immediately before that file
-- ran. Running this restores the defect ON PURPOSE — it exists so the red twin can execute
-- the real bytes of the rollback rather than a description of one.

-- ─── custom.portal_record_title, as it was ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.portal_record_title(p_organization_id uuid, p_record_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(nullif(r.data ->> (t.data ->> 'title_field'), ''),
                  nullif(r.data ->> 'name', ''),
                  nullif(r.data ->> 'title', ''))
    from custom.record r
    left join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
$function$

;

-- ─── custom.share_subject_name, as it was ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.share_subject_name(p_organization_id uuid, p_type text, p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_name  text;
  v_row   custom.record;
  v_title text;
begin
  if p_id is null then return null; end if;

  -- Outside schema `custom` the platform's registry is the authority and this adds nothing.
  if p_type is distinct from 'record' then
    return coalesce(nullif(btrim(platform.entity_title(p_type, p_id)), ''), left(p_id::text, 8));
  end if;

  v_name := nullif(btrim(coalesce(platform.entity_title('record', p_id), '')), '');
  if v_name is not null then return v_name; end if;

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id;
  if not found then return left(p_id::text, 8); end if;

  -- The Table says which key holds the name. Asking the row for `title` when its Table calls
  -- it something else is how a screen ends up showing a uuid for a record that HAS a name.
  select nullif(btrim(coalesce(t.data ->> 'title_field', '')), '') into v_title
    from custom.record t
   where t.organization_id = p_organization_id and t.id = v_row.table_id;

  return coalesce(
    nullif(btrim(coalesce(v_row.data ->> v_title, '')), ''),
    nullif(btrim(coalesce(v_row.data ->> 'title', '')), ''),
    nullif(btrim(coalesce(v_row.data ->> 'name', '')), ''),
    left(p_id::text, 8));
end;
$function$

;

-- ─── platform.relation_label, as it was ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.relation_label(p_organization_id uuid, p_target_type text, p_target_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_title text;
  v_col   text;
  v_sch   text;
  v_tab   text;
  v_me    uuid;
begin
  -- REL-14. The label is READ, never stored on the edge.
  --
  -- THE FAR END OF A RELATION IS A DIFFERENT RECORD, IN A DIFFERENT TABLE, AND THE READER MAY
  -- NOT HOLD IT. Until now this function answered the title to anybody who could call it, so
  -- the reverse side of a shared record told a member the names of records nobody had shared
  -- with her. The access question is asked BEFORE the title is read, and a reader who may not
  -- open the target is told so in words — `platform.relation_withheld_label()` — never given
  -- the title and never handed the bare id.
  perform custom.assert_client_may_reach(p_organization_id, 'platform.relation_label');

  if p_target_type = 'record' then
    v_me := custom.query_principal();
    if v_me is not null
       and not custom.query_is_store_owner()
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = p_target_id)
       and not custom.has_visibility(v_me, 'record', p_target_id, 'viewer'::public.permission_level) then
      return platform.relation_withheld_label();
    end if;
    select r.data ->> (t.data ->> 'title_field') into v_title
      from custom.record r
      join custom.record t on t.id = r.table_id
     where r.id = p_target_id and r.deleted_at is null
       and (r.organization_id = p_organization_id or r.data_class = 'kernel')
     limit 1;
    if v_title is null then
      select l.cached_title into v_title
        from custom.external_link l
       where l.record_id = p_target_id and l.organization_id = p_organization_id
       limit 1;
    end if;
    return v_title;
  end if;

  select e.schema_name, e.table_name, nullif(e.title_column, '')
    into v_sch, v_tab, v_col
    from platform.entity_types e
   where e.token = p_target_type
   limit 1;
  if v_col is null or v_sch is null or v_tab is null then
    return null;
  end if;
  execute format('select %I::text from %I.%I where id = $1 limit 1', v_col, v_sch, v_tab)
    into v_title using p_target_id;
  return v_title;
end;
$function$

;

-- ─── custom.work_approval_request, as it was ───────────────────────────────────────────
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
  -- THE ORGANIZATION WALL, THE SWITCH, THEN THE RUNG - all three by name, all three on the one
  -- ladder, and all three before anything is read or written.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_request');
  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_request');

  -- ASKING IS NOT CHANGING, AND THE RUNG SAYS SO. This door writes nothing on the subject: it
  -- files a request. `custom.work_approval_decide` is what applies the change, later, as the
  -- person who approved it and through the store's own doors, and the authority to decide is
  -- asked there. So the rung to ASK is the PARTICIPATION rung - commenter - which is what Jira
  -- and ServiceNow require to raise a change request on an item: enough standing to take part,
  -- never enough to make the change. A viewer is told exactly that, by name, rather than being
  -- told they have no access to something they can plainly read.
  if not (custom.query_is_store_owner()
          or custom.has_visibility(v_me, 'record', p_subject_id, 'commenter'::public.permission_level)) then
    if custom.has_visibility(v_me, 'record', p_subject_id, 'viewer'::public.permission_level) then
      raise exception 'You can read this, but asking for a change to it is for the people who work on it.'
        using errcode = '42501',
              hint = 'Raising a change takes the commenter level or higher on it - the same level it takes to leave a comment. Ask somebody who holds it to raise the change, or to share it with you at that level.';
    end if;
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'Nothing reads or files against a record around the one ladder. Ask somebody who holds it to share it with you.';
  end if;

  if v_origin not in ('person', 'agent') then
    raise exception 'An approval comes from a person or from an agent, and "%" is neither.', p_origin
      using errcode = '22023';
  end if;
  if not (v_kind = any (custom.work_approval_kinds())) then
    raise exception 'This store can hold a change to a record''s values, new records in a table, a new column on a table, a record being removed or put back, and a new table in a home. It was asked to hold "%".',
                    coalesce(nullif(p_change ->> 'kind', ''), 'nothing')
      using errcode = '22023',
            hint = 'The kinds are ' || array_to_string(custom.work_approval_kinds(), ', ') ||
                   '. Anything else would be a change nobody could apply when they approved it.';
  end if;
  if v_kind = 'record_patch'
     and (jsonb_typeof(p_change -> 'patch') is distinct from 'object'
          or p_change -> 'patch' = '{}'::jsonb) then
    raise exception 'A change waiting for approval has to say what it would change.'
      using errcode = '22004';
  end if;
  -- A BATCH THAT CARRIES NO ROWS IS NOT A CHANGE. It would be approved and write nothing,
  -- which is the dead end in a smaller font.
  if v_kind = 'record_add'
     and (jsonb_typeof(p_change -> 'rows') is distinct from 'array'
          or jsonb_array_length(p_change -> 'rows') = 0) then
    raise exception 'Records waiting for approval have to say what would be written.'
      using errcode = '22004',
            hint = 'Send {"kind":"record_add","rows":[{...}]} with at least one record.';
  end if;
  if v_kind = 'field_add' and jsonb_typeof(p_change -> 'field') is distinct from 'object' then
    raise exception 'A new column waiting for approval has to carry the column it would add.'
      using errcode = '22004';
  end if;
  -- A NEW TABLE CARRIES THE WHOLE SPEC, and its fields with it. A card that said "a table
  -- called Invoices" would ask a person to sign for something they were never shown, and an
  -- approval that had to guess the spec back would create a different table than the one
  -- that was refused.
  if v_kind = 'table_add' then
    if jsonb_typeof(p_change -> 'table') is distinct from 'object'
       or nullif(p_change #>> '{table,name}', '') is null then
      raise exception 'A new table waiting for approval has to carry the table it would create.'
        using errcode = '22004',
              hint = 'Send {"kind":"table_add","table":{...the spec custom.table_declare takes...},"fields":[...]}.';
    end if;
    if p_change ? 'fields' and jsonb_typeof(p_change -> 'fields') is distinct from 'array' then
      raise exception 'The columns of a new table waiting for approval have to be a list, even an empty one.'
        using errcode = '22004';
    end if;
  end if;

  -- THE SUBJECT. A record being PUT BACK is deleted by definition, so that one kind looks for
  -- it among the deleted rows; every other kind still requires a live subject.
  if v_kind = 'record_restore' then
    select r.* into v_subject from custom.record r
     where r.organization_id = p_organization_id and r.id = p_subject_id and r.deleted_at is not null;
    if v_subject.id is null then
      raise exception 'There is no deleted record in this organization with that id, so there is nothing to put back.'
        using errcode = '02000',
              hint = 'A record that is still here does not need restoring; one that was never here cannot be.';
    end if;
  else
    select r.* into v_subject from custom.record r
     where r.organization_id = p_organization_id and r.id = p_subject_id and r.deleted_at is null;
    if v_subject.id is null then
      raise exception 'There is no such record in this organization, so there is nothing to approve.'
        using errcode = '02000';
    end if;
  end if;
  v_word := case when v_subject.table_id = custom.table_kernel_id() then 'table' else 'record' end;
  if v_kind = 'field_add' and v_word <> 'table' then
    raise exception 'A new column is added to a table, and this is a %.', v_word
      using errcode = '22023';
  end if;
  -- Records go IN a table. Filing them against a row would produce an approval whose yes
  -- nobody could carry out.
  if v_kind = 'record_add' and v_word <> 'table' then
    raise exception 'Records are added to a table, and this is a %.', v_word
      using errcode = '22023';
  end if;
  -- A DOCUMENT TEMPLATE IS THE TABLE'S OWN WORDING, so it waits on the TABLE, exactly as a
  -- new column does, and its approvers resolve on the same ladder. The card has to carry the
  -- whole template — name and body — because approving is `custom.doc_template_save` with
  -- these bytes and nothing re-derived: a person signs for the words they were shown.
  if v_kind = 'doc_template_add' then
    if v_word <> 'table' then
      raise exception 'A document template is written for a table, and this is a %.', v_word
        using errcode = '22023';
    end if;
    if jsonb_typeof(p_change -> 'template') is distinct from 'object'
       or nullif(p_change #>> '{template,name}', '') is null then
      raise exception 'A document template waiting for approval has to carry the template it would save.'
        using errcode = '22004',
              hint = 'Send {"kind":"doc_template_add","template":{"name":"…","body":"…","template_id":null}}.';
    end if;
  end if;
  -- A NEW TABLE HANGS ON ITS HOME, which is the record it would be made inside. That is what
  -- makes the wait answerable: `custom.work_approval_approvers` resolves the admins on that
  -- Home and then the organization's owners and admins, on the one ladder.
  if v_kind = 'table_add'
     and nullif(p_change #>> '{table,parent_id}', '') is distinct from p_subject_id::text then
    raise exception 'A new table waits on the home it would be made in, and this spec names a different one.'
      using errcode = '22023',
            hint = 'File the request against the record named by the spec''s parent_id.';
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
$function$

;

-- ─── custom.dashboard_stuck, as it was ───────────────────────────────────────────
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
    custom.page_size(p_organization_id, 'custom.dashboard_stuck', p_limit, 50, 500));

  return query execute v_sql;
end;
$function$

;

-- ─── custom.work_list, as it was ───────────────────────────────────────────
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
     limit custom.page_size(p_organization_id, 'custom.work_list', p_limit, 100, 500)
    offset greatest(0, coalesce(p_offset, 0));
end
$function$

;

-- ─── custom.work_whose_turn, as it was ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.work_whose_turn(p_organization_id uuid, p_table_id uuid, p_include_finished boolean DEFAULT false)
 RETURNS TABLE(record_id uuid, title text, assignee_id uuid, turn text, due_on timestamp with time zone, state text, status text, terminal boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid;
  v_pred text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_whose_turn');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.work_whose_turn');
  v_me   := custom.query_principal();
  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                         'viewer'::public.permission_level, 'r');
  return query execute format($q$
    select r.id,
           r.data ->> coalesce((select t.data ->> 'title_field'
                                  from custom.record t
                                 where t.organization_id = %1$L::uuid
                                   and t.id = %2$L::uuid), 'name'),
           nullif(r.data ->> 'assignee', '')::uuid,
           case when coalesce((s.data ->> 'terminal')::boolean, false) then 'nobody'
                when p.id is null then 'unassigned'
                else coalesce(nullif(p.data ->> 'name', ''), p.id::text) end,
           nullif(r.data ->> 'due_date', '')::timestamptz,
           case when coalesce((s.data ->> 'terminal')::boolean, false) then 'finished'
                when nullif(r.data ->> 'due_date', '') is null                        then 'undated'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) then 'overdue'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) + interval '1 day'
                                                                                      then 'due_today'
                else 'scheduled' end,
           s.data ->> 'name',
           coalesce((s.data ->> 'terminal')::boolean, false)
      from custom.record r
      left join custom.record p
        on p.organization_id = r.organization_id
       and p.id = nullif(r.data ->> 'assignee', '')::uuid
       and p.table_id = custom.person_kernel_id()
       and p.deleted_at is null
      left join custom.record s
        on s.organization_id = r.organization_id
       and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
       and s.deleted_at is null
     where r.organization_id = %1$L::uuid
       and r.table_id = %2$L::uuid
       and r.deleted_at is null
       and (%4$L::boolean or not coalesce((s.data ->> 'terminal')::boolean, false))
       and (%3$s)
     order by case when coalesce((s.data ->> 'terminal')::boolean, false) then 2
                   when nullif(r.data ->> 'due_date', '') is null then 1 else 0 end,
              nullif(r.data ->> 'due_date', '')::timestamptz nulls last,
              r.created_at
  $q$, p_organization_id, p_table_id, v_pred, coalesce(p_include_finished, false));
end
$function$

;

-- ─── custom.field_history, as it was ───────────────────────────────────────────
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
     limit custom.page_size(p_organization_id, 'custom.field_history', p_limit, 100, 500)
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$

;

-- ─── custom.comment_write, as it was ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.comment_write(p_organization_id uuid, p_record_id uuid, p_body text, p_anchor jsonb DEFAULT '{}'::jsonb, p_parent_comment_id uuid DEFAULT NULL::uuid, p_mentions uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user     uuid := custom.query_principal();
  v_ids      uuid[] := array(select distinct m from unnest(coalesce(p_mentions, array[]::uuid[])) m
                              where m is not null and m <> v_user);
  v_people   jsonb;
  v_comment  uuid;
  v_table    uuid;
  v_titlek   text;
  v_title    text;
  v_who      uuid;
  v_sent     integer := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.comment_write');

  -- EVERY MENTION IS JUDGED BEFORE THE COMMENT IS WRITTEN, so a refusal never leaves a
  -- half-sent thread behind: the whole statement is one transaction and a refusal here
  -- means nothing was said at all.
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    v_people := custom.history_people(p_organization_id, v_ids);
    foreach v_who in array v_ids loop
      if not (v_people ? v_who::text) then
        raise exception 'You can only mention people who are in this organization, and one of the people you named is not.'
          using errcode = '23503',
                hint = 'Pick the person from the list the box offers — it is this organization''s own members. Somebody outside it is reached by inviting them, not by naming them in a comment.';
      end if;
      -- THE DEAD END THIS REFUSES. Telling somebody they were mentioned on a record they
      -- cannot open is a notification whose only possible outcome is a refusal — and it
      -- also tells them the record exists.
      if not custom.has_visibility(v_who, 'record', p_record_id, 'viewer'::public.permission_level) then
        raise exception '% cannot see this record yet, so mentioning them here would send them somewhere they cannot go.',
                        coalesce(v_people -> v_who::text ->> 'name', 'That person')
          using errcode = '42501',
                hint = 'Share the record with them first — viewer is enough to read a thread — and then mention them. Sharing is on this same screen.';
      end if;
    end loop;
  end if;

  -- THE ONE WRITER. Every check that has ever guarded a comment still runs, in its own body.
  v_comment := custom.io_comment_write(
                 p_organization_id, p_record_id, p_body,
                 coalesce(p_anchor, '{}'::jsonb)
                   || case when coalesce(array_length(v_ids, 1), 0) = 0 then '{}'::jsonb
                           else jsonb_build_object('mentions', to_jsonb(v_ids)) end,
                 p_parent_comment_id);

  if coalesce(array_length(v_ids, 1), 0) > 0 then
    select c.table_id into v_table
      from custom.io_comment c
     where c.organization_id = p_organization_id and c.id = v_comment;
    select nullif(t.data ->> 'title_field', '') into v_titlek
      from custom.record t
     where t.organization_id = p_organization_id and t.id = v_table
       and t.table_id = custom.table_kernel_id();
    if v_titlek is not null then
      v_title := custom.read_record(p_organization_id, p_record_id, true) ->> v_titlek;
    end if;

    foreach v_who in array v_ids loop
      if custom.comment_mention_deliver(
           p_organization_id, p_record_id, v_table, v_comment, v_who,
           coalesce(custom.history_people(p_organization_id, array[v_user]) -> v_user::text ->> 'name',
                    'Somebody'),
           v_title, p_body) is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object('comment_id', v_comment,
                            'mentioned', to_jsonb(v_ids),
                            -- Said out loud, because "I mentioned three people" and "three
                            -- people were told" are different facts and a screen that
                            -- conflates them is lying quietly.
                            'notified', v_sent);
end;
$function$

;

-- ─── custom.relation_own, as it was ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.relation_own(p_organization_id uuid, p_owner_id uuid, p_target_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id     uuid;
  v_parent uuid;
  v_name   text;
  v_found  boolean := false;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_own');
  perform custom.assert_client_may_change(p_organization_id, p_target_id, 'custom.relation_own', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.relation_own');
  if p_organization_id is null or p_owner_id is null or p_target_id is null then
    raise exception 'custom.relation_own: the organization, the owner and the target are all required'
      using errcode = '22004';
  end if;

  -- REC-7, BEFORE ANYTHING IS WRITTEN. A record has zero or one parent, never two — so a
  -- second call with a different owner is a REQUEST FOR A SECOND PARENT, and the only two
  -- honest answers are "refused" and "that is a move, ask for a move". It used to be neither:
  -- the old parent was overwritten in silence.
  select true, custom.containment_parent(r.data)
    into v_found, v_parent
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_target_id and r.deleted_at is null;
  if not coalesce(v_found, false) then
    raise exception 'that record is not in this organization'
      using errcode = '23503';
  end if;

  if v_parent is not null and v_parent = p_owner_id then
    raise exception 'That record is already inside this one.'
      using errcode = '23505',
            hint = 'REC-7: a record is inside one record, once. Nothing was written and nothing moved.';
  end if;

  if v_parent is not null then
    select coalesce(nullif(r.data ->> (t.data ->> 'title_field'), ''),
                    nullif(r.data ->> 'name', ''), nullif(r.data ->> 'title', ''), r.id::text)
      into v_name
      from custom.record r
      left join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
     where r.organization_id = p_organization_id and r.id = v_parent;
    raise exception 'That record is already inside "%", and a record is inside one record at a time — so nothing was moved.',
      coalesce(v_name, v_parent::text)
      using errcode = '23514',
            hint = format(
              'REC-7 / T3: a Record has zero or one parent, never two. To MOVE it out of "%s" and into this one, ask for the move — custom.record_reparent, or custom.migrate_reparent, which records it so it can be undone. To leave it where it is and ALSO make it reachable from this one, link the two instead: custom.relation_carry, a carrying link, which is the way T3 names to get a record into both places.',
              coalesce(v_name, v_parent::text));
  end if;

  -- REC-10: an owned relation MAKES ITS TARGET CONTAINED. The containment edge and the
  -- relation are written in one transaction, so the target cannot be owned without being
  -- contained. Every REC-7 / REC-8 / REC-N-4 refusal applies, because the edge goes in
  -- through custom._containment_guard like any other write.
  update custom.record r
     set data = r.data || jsonb_build_object('parent_id', p_owner_id::text)
   where r.organization_id = p_organization_id and r.id = p_target_id;
  if not found then
    raise exception 'that record is not in this organization'
      using errcode = '23503';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'relation',
          jsonb_build_object('kind', 'owned', 'carrying', true,
                             'from', p_owner_id, 'to', p_target_id))
  returning id into v_id;
  return v_id;
end;
$function$

;

-- ─── iam.discoverable_card, as it was ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION iam.discoverable_card(p_resource_type text, p_resource_id uuid)
 RETURNS TABLE(resource_type text, resource_id uuid, title text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.resource_type, c.resource_id,
         coalesce(r.data ->> 'title', r.data ->> 'name', 'Untitled')
    from iam.content_lane c
    left join custom.record r on r.id = c.resource_id
   where c.resource_type = p_resource_type
     and c.resource_id = p_resource_id
     and c.discoverable;
$function$

;

-- ─── custom._card_words, as it was ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._card_words(p_organization_id uuid, p_value text, p_noun text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_other uuid;
  v_title text;
begin
  if nullif(btrim(coalesce(p_value, '')), '') is null then
    return 'an untitled ' || p_noun;
  end if;
  -- Not a uuid at all: it is already the words somebody typed.
  begin
    v_other := p_value::uuid;
  exception when invalid_text_representation then
    return p_value;
  end;
  select coalesce(nullif(o.data ->> (t.data ->> 'title_field'), ''),
                  nullif(o.data ->> 'name', ''),
                  nullif(o.data ->> 'title', ''))
    into v_title
    from custom.record o
    left join custom.record t on t.organization_id = o.organization_id and t.id = o.table_id
   where o.organization_id = p_organization_id and o.id = v_other and o.deleted_at is null;
  -- The hop landed on another id, or on nothing: say so rather than print either.
  if v_title is null or v_title ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return 'an untitled ' || p_noun;
  end if;
  return v_title;
end;
$function$

;

-- ─── and the two the fix added ───────────────────────────────────────────
drop function if exists custom.record_words(uuid, uuid, text);
drop function if exists custom._first_words(jsonb);
