-- additive: yes
-- lane: CHAIR-ENTITY-BLOCKS-3
-- based-on: platform._drill_lookup_words(text, text, text[], jsonb, text, text, integer) 056a559c72f12fdc728e7abe02f91254dbc6b3121d42831703a2d6b6a7887f00
-- based-on: custom.entity_row_write(uuid, text, uuid, jsonb, jsonb, integer, boolean) 8c54c40b074f2972da8e64171934e510ecedc6674ba9185eea792f5495b4df53
-- LOCKS: one row of platform.feature_knob (table_api/standard_tables), two function bodies
-- (CREATE OR REPLACE keeps their grants) and one new SECURITY DEFINER function
-- (platform._drill_person_words, platform's default function grants). No table, trigger, grant or policy is touched; nothing is tightened.
--
-- 1. PERSON AND LINK COLUMNS READ AS NAMES. The drill doors' presentation (chairblk_a:
--    platform._drill_present / _drill_present_rows / _drill_words_in) turns every `lookups` entry of
--    table_api/standard_tables into a column read as the word its id names, AS THE PERSON. task,
--    project and crm_deal still showed bare ids for their people (assignee, owner, created by,
--    updated by, published by) and a task's parent task. Each gains a lookup: a parent task reads as
--    its title; a person (token `user`, iam.users, which has no name column of its own) reads as her
--    name through platform._drill_person_words — for the people who share an organization with the
--    reader, and herself, exactly the names public.get_organization_members_with_users already
--    answers any member (full name, else profile name, else email). users.profiles' own row rule
--    shows a member only her own profile, so a person read through it was blank for everyone else. A change by an id
--    still passes straight through (_drill_word_ids). organization_id stays an id (the Table API's
--    Row carries it as one); hr_employee's shown link columns already read as names.
-- 2. A NEW TASK OR PROJECT IS ONE INSERT AS HER. custom.entity_row_write with no record id refused
--    every token ("not created through this API yet"). For a token whose API facts say
--    create_via = 'insert' it now inserts the row AS THE PERSON — organization_id the call names (one
--    she acts in), created_by her sign-in, only the API's writable columns, a name required where the
--    registry names a title column — so the table's own insert rule decides. task and project move
--    to create_via 'insert'; every other token still refuses exactly as before.
-- Inverse: migrations/inverse/chairblk3_a_person_and_link_columns_read_as_names_and_a_new_task_or_project_is_one_insert_down.sql.

set local lock_timeout = '3s';

update platform.feature_knob
   set value = value
     || jsonb_build_object('task', (value -> 'task') || jsonb_build_object(
          'create_via', 'insert',
          'lookups', coalesce(value #> '{task,lookups}', '[]'::jsonb) || $l$[
            {"via": "assignee_id", "token": "user", "column": "name", "name": "Assignee"},
            {"via": "parent_task_id", "token": "task", "column": "title", "name": "Parent task"},
            {"via": "created_by", "token": "user", "column": "name", "name": "Created by"},
            {"via": "updated_by", "token": "user", "column": "name", "name": "Updated by"},
            {"via": "published_to_web_by", "token": "user", "column": "name", "name": "Published by"}
          ]$l$::jsonb))
     || jsonb_build_object('project', (value -> 'project') || jsonb_build_object(
          'create_via', 'insert',
          'lookups', coalesce(value #> '{project,lookups}', '[]'::jsonb) || $l$[
            {"via": "created_by", "token": "user", "column": "name", "name": "Created by"},
            {"via": "updated_by", "token": "user", "column": "name", "name": "Updated by"},
            {"via": "published_to_web_by", "token": "user", "column": "name", "name": "Published by"}
          ]$l$::jsonb))
     || jsonb_build_object('crm_deal', (value -> 'crm_deal') || jsonb_build_object(
          'lookups', coalesce(value #> '{crm_deal,lookups}', '[]'::jsonb) || $l$[
            {"via": "assigned_to", "token": "user", "column": "name", "name": "Assigned to"},
            {"via": "created_by", "token": "user", "column": "name", "name": "Created by"},
            {"via": "updated_by", "token": "user", "column": "name", "name": "Updated by"},
            {"via": "published_to_web_by", "token": "user", "column": "name", "name": "Published by"}
          ]$l$::jsonb)),
       updated_at = now()
 where feature = 'table_api' and key = 'standard_tables'
   and jsonb_typeof(value -> 'task') = 'object' and jsonb_typeof(value -> 'project') = 'object' and jsonb_typeof(value -> 'crm_deal') = 'object'
   and (value #> '{task,lookups}' @> '[{"via": "assignee_id"}]') is not true;

-- a person's name, for the people who share an organization with the reader (and herself)
create or replace function platform._drill_person_words(p_ids text[] default null, p_word text default null, p_limit integer default 500)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with peers as (
    select om.user_id from iam.organization_member om
     where om.organization_id in (select mine.organization_id from iam.organization_member mine where mine.user_id = auth.uid())
    union
    select auth.uid() where auth.uid() is not null
  ), named as (
    select u.id::text as id,
           coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(btrim(p.display_name), ''), nullif(btrim(u.email::text), '')) as w,
           u.email::text as email
      from auth.users u left join users.profiles p on p.id = u.id
     where u.id in (select peers.user_id from peers)
       and (p_ids is null or u.id::text = any (p_ids))
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'word', x.w) order by x.w, x.id), '[]'::jsonb)
    from (select named.id, named.w from named
           where named.w is not null
             and (p_word is null or lower(named.w) = lower(btrim(p_word)) or lower(named.email) = lower(btrim(p_word)))
           order by named.w, named.id
           limit greatest(coalesce(p_limit, 500), 1)) x;
$function$;
comment on function platform._drill_person_words(text[], text, integer) is
  'id -> name pairs of people who share an organization with the reader (and herself): full name, else profile name, else email — what get_organization_members_with_users answers a member. A lookup to token user reads through it. CHAIR-ENTITY-BLOCKS-3.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'platform', '_drill_person_words', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/chairblk3_a_person_and_link_columns_read_as_names_and_a_new_task_or_project_is_one_insert.sql (lane CHAIR-ENTITY-BLOCKS-3)',
       'Names of people only: answers id -> name for users who share an organization with auth.uid() (iam.organization_member) and for the caller herself; p_ids (user ids) outside that set, invented ids and a NULL session answer nothing. The same names public.get_organization_members_with_users answers any member. Called by the SECURITY INVOKER platform._drill_lookup_words, so the signed-in caller needs EXECUTE.',
       true
  from pg_proc p where p.oid = 'platform._drill_person_words(text[], text, integer)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;
grant execute on function platform._drill_person_words(text[], text, integer) to authenticated;

create or replace function platform._drill_lookup_words(p_token text, p_column text, p_ids text[] DEFAULT NULL::text[], p_where jsonb DEFAULT NULL::jsonb, p_word text DEFAULT NULL::text, p_sort text DEFAULT NULL::text, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s       record;
  v_conds text[] := '{}';
  k       text;
  v       jsonb;
  v_out   jsonb;
begin
  -- CHAIR-ENTITY-BLOCKS-3: A PERSON (token `user`) reads as her name, among the people she shares an
  -- organization with (platform._drill_person_words); iam.users has no name column to read as her.
  if p_token = 'user' then
    return platform._drill_person_words(p_ids, p_word, p_limit);
  end if;
  -- the token's table through the registry's own door (custom.entity_table): the registry rows are not
  -- readable by a signed-in person directly, so platform.entity_read_source answered nothing as her
  select et.schema_name, et.table_name into s from custom.entity_table(p_token) et;
  if s.table_name is null
     or not has_table_privilege(current_user, format('%I.%I', s.schema_name, s.table_name), 'select')
     or not has_column_privilege(current_user, format('%I.%I', s.schema_name, s.table_name), p_column, 'select') then
    return '[]'::jsonb;
  end if;
  if p_ids is not null then
    v_conds := v_conds || format('t.id::text = any (%L::text[])', p_ids);
  elsif platform._drill_column(s.schema_name, s.table_name, 'deleted_at') is not null then
    v_conds := v_conds || 't.deleted_at is null'::text;   -- a choice list offers live rows only
  end if;
  if p_word is not null then
    v_conds := v_conds || format('(t.%I::text = %L or lower(t.%I::text) = lower(%L))', p_column, p_word, p_column, p_word);
  end if;
  for k, v in select e.key, e.value from jsonb_each(coalesce(p_where, '{}'::jsonb)) e loop
    if v = 'null'::jsonb then
      v_conds := v_conds || format('t.%I is null', k);
    elsif jsonb_typeof(v) = 'object' and v ? 'empty' then
      v_conds := v_conds || format('t.%I is %s null', k, case when (v ->> 'empty')::boolean then '' else 'not' end);
    else
      v_conds := v_conds || format('t.%I::text = %L', k, v #>> '{}');
    end if;
  end loop;
  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''id'', x.id, ''word'', x.w) order by x.o), ''[]'') from ('
    || 'select t.id::text as id, t.%I::text as w, row_number() over (order by %s) as o from %I.%I t%s order by %s limit %s'
    || ') x where x.w is not null',
    p_column,
    case when p_sort is not null then format('t.%I nulls last, t.id', p_sort) else 't.id' end,
    s.schema_name, s.table_name,
    case when cardinality(v_conds) > 0 then ' where ' || array_to_string(v_conds, ' and ') else '' end,
    case when p_sort is not null then format('t.%I nulls last, t.id', p_sort) else 't.id' end,
    greatest(coalesce(p_limit, 500), 1))
    into v_out;
  return v_out;
end
$function$;

create or replace function custom.entity_row_write(p_organization_id uuid, p_token text, p_record_id uuid, p_columns jsonb DEFAULT '{}'::jsonb, p_custom jsonb DEFAULT '{}'::jsonb, p_expected_version integer DEFAULT NULL::integer, p_archive boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  t        record;
  v_reg    record;
  v_row    jsonb;
  v_org    uuid;
  v_sets   text[] := '{}';
  v_args   jsonb := '[]'::jsonb;
  v_key    text;
  v_clear  text[] := '{}';
  v_patch  jsonb := '{}'::jsonb;
  v_n      int;
  v_where  text;
  v_has_ver boolean;
  v_cols   jsonb := coalesce(p_columns, '{}'::jsonb);
  v_custom jsonb := coalesce(p_custom, '{}'::jsonb);
  v_cf     jsonb;
  v_same   boolean := true;
  v_level  public.permission_level;
  v_mask   jsonb;
  v_vis    text[];
  v_decl   text[];
  v_out    jsonb;
  v_title  text;
  v_ins_cols text[];
  v_ins_vals text[];
  v_new    uuid;
begin
  -- the client wall is asked of an organization the call names; a change by id needs none
  if p_organization_id is not null or p_record_id is null then
    perform custom.assert_entity_door(p_organization_id, 'custom.entity_row_write');
  end if;
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);
  select f.api_reach, f.api_writable_columns, f.create_via into v_reg from platform.api_facts(p_token) f;

  -- (How far the Table API reaches a table is the API's own question, answered before it calls
  -- this door. This door is the store's: the app's Custom fields section writes through it too.)
  if jsonb_typeof(v_cols) <> 'object' or jsonb_typeof(v_custom) <> 'object' then
    raise exception 'A write names its columns and values as {"name": value}.' using errcode = '22023';
  end if;
  -- CHAIR-ENTITY-BLOCKS: a lookup column (table_api/standard_tables) is changed by its word — a deal's
  -- stage by its name — and kept as the id that word names, read as the person.
  v_cols := platform._drill_words_in(p_token, v_cols, 'values');
  if p_record_id is null then
    if coalesce(v_reg.create_via, 'refuse') <> 'insert' then
      raise exception 'New % records are added in AI Matrx, which checks for duplicates.', t.label
        using errcode = '0A000', hint = 'This API changes records that already exist.';
    end if;
    -- CHAIR-ENTITY-BLOCKS-3: A NEW ROW OF A TOKEN WHOSE API FACTS SAY create_via = 'insert' is ONE
    -- INSERT AS HER, so the table's own insert rule decides (created_by is her sign-in, the
    -- organization is the one the call names and one she acts in). Only the API's writable columns.
    if auth.uid() is null then
      raise exception 'A new % needs a signed-in person.', t.label using errcode = '42501';
    end if;
    if p_organization_id is null then
      raise exception 'Name the organization this new % belongs to.', t.label using errcode = '22004';
    end if;
    if not iam.has_org_access(p_organization_id) then
      raise exception 'That is not an organization you can add a % to.', t.label using errcode = '42501';
    end if;
    v_title := (select e.title_column from platform.entity_types e where e.token = p_token);
    if v_title is not null and btrim(coalesce(v_cols ->> v_title, '')) = '' then
      raise exception 'A new % needs a name.', t.label using errcode = '22004',
        hint = format('Send "%s".', v_title);
    end if;
    v_ins_cols := array['organization_id'];
    v_ins_vals := array['$1'];
    if platform._drill_column(t.schema_name, t.table_name, 'created_by') is not null then
      v_ins_cols := v_ins_cols || 'created_by'::text;
      v_ins_vals := v_ins_vals || 'auth.uid()'::text;
    end if;
    for v_key in select k from jsonb_object_keys(v_cols) k loop
      if not (v_key = any (coalesce(v_reg.api_writable_columns, '{}'::text[]))) then
        raise exception '"%" cannot be set through the API.', v_key
          using errcode = '42501', hint = 'Set it in AI Matrx. Nothing was written.';
      end if;
      continue when jsonb_typeof(v_cols -> v_key) = 'null';
      v_ins_cols := v_ins_cols || v_key;
      v_ins_vals := v_ins_vals || format('($2->>%L)::%s', v_key,
                      (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
                        where a.attrelid = format('%I.%I', t.schema_name, t.table_name)::regclass and a.attname = v_key));
    end loop;
    select coalesce(jsonb_object_agg(k, v_custom -> k), '{}'::jsonb) into v_patch
      from jsonb_object_keys(v_custom) k where jsonb_typeof(v_custom -> k) <> 'null';
    if exists (select 1 from jsonb_object_keys(v_patch) k where left(k, 1) = '_') then
      raise exception 'A key starting with "_" is kept by the store itself, so it cannot be written. Nothing was written.'
        using errcode = '22023';
    end if;
    if v_patch <> '{}'::jsonb then
      v_ins_cols := v_ins_cols || 'custom_fields'::text;
      v_ins_vals := v_ins_vals || '$3'::text;
    end if;
    execute format('insert into %I.%I (%s) values (%s) returning id', t.schema_name, t.table_name,
                   (select string_agg(format('%I', c), ', ' order by o) from unnest(v_ins_cols) with ordinality u(c, o)),
                   array_to_string(v_ins_vals, ', '))
      into v_new using p_organization_id, v_cols, v_patch;
    return jsonb_build_object('id', v_new, 'organization_id', p_organization_id, 'token', t.token, 'created', true);
  end if;

  -- the row, as she may read it: its own organization, never one a caller supplies
  execute format('select to_jsonb(x) from %I.%I x where x.id = $1', t.schema_name, t.table_name)
    into v_row using p_record_id;
  v_cf := case when jsonb_typeof(v_row -> 'custom_fields') = 'object' then v_row -> 'custom_fields' else '{}'::jsonb end;
  v_row := v_row - 'custom_fields';
  if v_row is null then
    raise exception 'There is no % you can open with that id.', t.label using errcode = '02000';
  end if;
  v_org := (v_row ->> 'organization_id')::uuid;
  if p_organization_id is not null and v_org is distinct from p_organization_id then
    raise exception 'This % belongs to another organization, not to the one this call names.', t.label
      using errcode = '42501', hint = 'Leave the organization out, or name the one the record belongs to.';
  end if;

  -- real columns: only the ones the registry lists for the API
  for v_key in select k from jsonb_object_keys(v_cols) k loop
    if not (v_key = any (coalesce(v_reg.api_writable_columns, '{}'::text[]))) then
      raise exception '"%" cannot be changed through the API.', v_key
        using errcode = '42501', hint = 'Change it in AI Matrx. Nothing was written.';
    end if;
    v_sets := v_sets || format('%I = ($2->>%s)::%s', v_key, jsonb_array_length(v_args),
                               (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
                                 where a.attrelid = format('%I.%I', t.schema_name, t.table_name)::regclass and a.attname = v_key));
    v_args := v_args || jsonb_build_array(v_cols -> v_key);
  end loop;

  -- custom values: a key set to null clears it (and its envelope); the author is the session's
  select string_agg(format('"%s"', k), ', ' order by k) into v_key
    from jsonb_object_keys(v_custom) k where left(k, 1) = '_';
  if v_key is not null then
    raise exception '% % kept by the store itself, so it cannot be written. Nothing was written.', v_key,
      case when position(',' in v_key) > 0 then 'are' else 'is' end
      using errcode = '22023', hint = 'Who changed a value comes from your sign-in; send only the fields you are setting.';
  end if;
  for v_key in select k from jsonb_object_keys(v_custom) k loop
    if jsonb_typeof(v_custom -> v_key) = 'null' then
      v_clear := v_clear || v_key;
    else
      v_patch := v_patch || jsonb_build_object(v_key, v_custom -> v_key);
    end if;
  end loop;
  if cardinality(v_clear) > 0 or v_patch <> '{}'::jsonb then
    v_sets := v_sets || ('custom_fields = (case when cardinality($3::text[]) > 0 then jsonb_set(coalesce(case when jsonb_typeof(custom_fields) = ''object'' then custom_fields end, ''{}''::jsonb) - $3::text[], ''{_values}'', coalesce(custom_fields -> ''_values'', ''{}''::jsonb) - $3::text[]) '
                         || 'else coalesce(case when jsonb_typeof(custom_fields) = ''object'' then custom_fields end, ''{}''::jsonb) end) || $4');
  end if;

  if p_archive is not null then
    if not t.has_deleted_at then
      raise exception '% records are never archived.', t.label using errcode = '0A000';
    end if;
    v_sets := v_sets || case when p_archive then 'deleted_at = coalesce(deleted_at, now())' else 'deleted_at = null' end;
  end if;
  if cardinality(v_sets) = 0 then
    raise exception 'Send at least one value to change.' using errcode = '22023';
  end if;

  v_has_ver := v_row ? 'version';
  if p_expected_version is not null and v_has_ver and (v_row ->> 'version')::integer is distinct from p_expected_version then
    raise exception 'Someone changed this % since you read it (it is at version %, and you sent %). Nothing was written.',
      t.label, v_row ->> 'version', p_expected_version
      using errcode = 'PT409', hint = 'Read it again, then send your change with the new version.';
  end if;
  -- A CHANGE THAT CHANGES NOTHING WRITES NOTHING: the version does not move and no history is made.
  select v_same and coalesce(bool_and((v_cf -> k) is not distinct from (v_patch -> k)), true) into v_same from jsonb_object_keys(v_patch) k;
  select v_same and coalesce(bool_and(not (v_cf ? k)), true) into v_same from unnest(v_clear) k;
  select v_same and coalesce(bool_and((v_row -> k) is not distinct from (v_cols -> k)), true) into v_same from jsonb_object_keys(v_cols) k;
  if p_archive is not null and ((v_row ->> 'deleted_at') is not null) is distinct from p_archive then
    v_same := false;
  end if;
  if not v_same then
  v_where := 'x.id = $1';
  if p_expected_version is not null then
    if not v_has_ver then
      raise exception '% records carry no version, so expected_version cannot be checked.', t.label using errcode = '22023';
    end if;
    v_where := v_where || ' and x.version = $5';
  end if;
  -- LANE7-W4B[h1]: AN HR ROW is changed through HR's own edit rule — the write gate that gates
  -- hr_employee_update today asks the signed-in person and arms this statement; with no subject
  -- employee nothing is armed and HR's guard refuses exactly as before.
  if t.schema_name = 'hr' then
    perform hr.custom_fields_write_gate(v_org, p_token, p_record_id);
  end if;
  execute format('update %I.%I x set %s where %s', t.schema_name, t.table_name, array_to_string(v_sets, ', '), v_where)
    using p_record_id, v_args, v_clear, v_patch, p_expected_version;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    if p_expected_version is not null and (v_row ->> 'version')::integer is distinct from p_expected_version then
      raise exception 'Someone changed this % since you read it (it is at version %, and you sent %). Nothing was written.',
        t.label, v_row ->> 'version', p_expected_version
        using errcode = 'PT409', hint = 'Read it again, then send your change with the new version.';
    end if;
    raise exception 'You can see this %, but it is not yours to change.', t.label
      using errcode = '42501', hint = 'It takes edit access, or a share of this record with you. Nothing was written.';
  end if;
  end if;   -- (a change that changes nothing skipped the UPDATE above)

  -- WHAT THIS DOOR ANSWERS: the row and its custom values AS SHE MAY READ THEM — through
  -- custom.entity_read_mask and custom.mask_document, exactly as custom.entity_record_read
  -- answers (a field she may not read is null, with its withheld notice). The mask is asked in
  -- the row's own organization; for a row shared with her from an organization she is not a
  -- member of, that door has no answer for her, so no values are returned (`custom` absent) and
  -- the caller reads the row back through a read door.
  v_out := jsonb_build_object('id', p_record_id, 'organization_id', v_org, 'token', t.token)
           || case when v_same then '{"unchanged": true}'::jsonb else '{}'::jsonb end;
  if v_org is not null and iam.has_org_access(v_org) then
    execute format('select x.custom_fields from %I.%I x where x.id = $1', t.schema_name, t.table_name)
      into v_cf using p_record_id;
    if v_cf is null or jsonb_typeof(v_cf) <> 'object' then v_cf := '{}'::jsonb; end if;
    v_level := custom.entity_seat_level(v_org, p_token, p_record_id);
    v_mask  := custom.entity_read_mask(v_org, p_token, v_level, 'read');
    select coalesce(array_agg(x), '{}'::text[]) into v_vis  from jsonb_array_elements_text(v_mask -> 'visible') x;
    select coalesce(array_agg(x), '{}'::text[]) into v_decl from jsonb_array_elements_text(v_mask -> 'declared') x;
    v_out := v_out || jsonb_build_object('custom',
      custom.mask_document(v_cf - '_values' - '_retired', v_vis, v_mask -> 'notices', false, '{}'::jsonb, v_decl));
  end if;
  return v_out;
end
$function$;

do $$
declare v jsonb;
begin
  select value into v from platform.feature_knob where feature = 'table_api' and key = 'standard_tables';
  if (v #> '{task,lookups}' @> '[{"via": "assignee_id", "token": "user"}]') is not true
     or (v #> '{crm_deal,lookups}' @> '[{"via": "assigned_to"}]') is not true
     or v #>> '{task,create_via}' is distinct from 'insert' or v #>> '{project,create_via}' is distinct from 'insert'
     or v #>> '{crm_deal,create_via}' is distinct from 'refuse' or v #>> '{hr_employee,create_via}' is distinct from 'refuse'
     or jsonb_array_length(v #> '{task,lookups}') is distinct from 6 then
    raise exception 'chairblk3_a: table_api/standard_tables does not carry the new lookups and create_via';
  end if;
  if position('CHAIR-ENTITY-BLOCKS-3: A PERSON' in pg_get_functiondef('platform._drill_lookup_words(text,text,text[],jsonb,text,text,integer)'::regprocedure)) = 0 then
    raise exception 'chairblk3_a: platform._drill_lookup_words was not replaced';
  end if;
  if position('CHAIR-ENTITY-BLOCKS-3: A NEW ROW' in pg_get_functiondef('custom.entity_row_write(uuid,text,uuid,jsonb,jsonb,integer,boolean)'::regprocedure)) = 0 then
    raise exception 'chairblk3_a: custom.entity_row_write was not replaced';
  end if;
end $$;
