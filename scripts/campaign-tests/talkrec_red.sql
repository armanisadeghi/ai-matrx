-- TALK-TO-RECORD — THE RED TWIN of `talkrec_green.sql`.
--
-- It puts the PRE-LANE bodies back inside a transaction that ends in ROLLBACK, and asserts
-- that every block the green suite passes goes RED against them. A guard you cannot
-- demonstrate failing is not a guard.
--
-- RUN IT exactly like the green one:
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/talkrec_red.sql
--
-- PART 0 takes the seat, for the same reason the green suite does: four of the six leaks
-- below are INVISIBLE from the role that owns `custom.record`.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'talkrec_red.sql'
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- THE PRE-LANE BODIES. Restored here and nowhere else; the ROLLBACK at the bottom is what
-- keeps this file from being a migration.
-- ══════════════════════════════════════════════════════════════════════════════════════════

create or replace function custom.record_values_versioned(p_organization_id uuid, p_record_id uuid)
returns table(field_key text, field_id uuid, value jsonb, value_version integer, source jsonb,
              absent_reason text, actor text, on_behalf_of text,
              written_at timestamp with time zone, alternates jsonb)
language plpgsql stable security definer set search_path to 'pg_catalog'
as $fn$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_values_versioned');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.record_values_versioned', 'viewer'::public.permission_level, 'record');
  return query
  with r as (select rec.* from custom.record rec
              where rec.organization_id = p_organization_id and rec.id = p_record_id),
       vals as (select custom.record_values(p_organization_id, p_record_id) v),
       keys as (select k from vals, jsonb_object_keys(vals.v) k)
  select keys.k, null::uuid, vals.v -> keys.k,
         coalesce((r.data -> '_values' -> keys.k ->> 'ver')::integer, 1),
         null::jsonb, r.data -> '_values' -> keys.k ->> 'absent',
         r.data -> '_values' -> keys.k ->> 'actor',
         r.data -> '_values' -> keys.k ->> 'on_behalf_of',
         (r.data -> '_values' -> keys.k ->> 'at')::timestamptz,
         '[]'::jsonb
    from r cross join vals cross join keys order by keys.k;
end;
$fn$;

CREATE OR REPLACE FUNCTION custom.record_as_of(p_organization_id uuid, p_record_id uuid, p_at timestamp with time zone)
 RETURNS TABLE(state jsonb, replayed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_as_of');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.record_as_of',
                                        'viewer'::public.permission_level, 'record');
  return query select s.state, s.replayed from custom.record_state_as_of(p_record_id, p_at) s;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.record_history(p_organization_id uuid, p_record_id uuid, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(version integer, occurred_at timestamp with time zone, operation text, operation_label text, actor jsonb, changes jsonb, migration_id uuid, undoable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table  uuid;
  v_people jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_history');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.record_history',
                                        'viewer'::public.permission_level, 'record');

  -- The record's OWN table, by id and whether or not it is deleted: the last version of a
  -- merged-away or deleted record is precisely the one somebody wants explained.
  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  -- Every name in one pass, so a two-hundred-version panel is one roster read and not two
  -- hundred. The ids are the ones this caller was already allowed to see.
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
           -- The machine word, for a screen that wants to group or icon by it.
           coalesce(w.operation_name, lower(w.operation)) as operation,
           -- And the word a PERSON used, which is what the panel prints.
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
           custom.history_changes(p_organization_id, v_table,
                                  coalesce(w.previous_data, '{}'::jsonb),
                                  coalesce(w.row_data -> 'data', '{}'::jsonb)),
           w.migration_id,
           -- HIS-8: a compound operation is undoable through custom.migrate_undo, and only
           -- while its Migration log row is still there. An ordinary edit is not "undoable"
           -- in that sense — it is RESTORABLE, which is the other two doors in this file.
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
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_history');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.field_history');

  if coalesce(btrim(coalesce(p_field_key, '')), '') = '' then
    raise exception 'custom.field_history: name the column whose history you want.'
      using errcode = '22004',
            hint = 'custom.applicable_fields(organization, table, null) lists this table''s columns with their keys.';
  end if;

  -- REFUSED BY NAME, never answered empty. A column that does not exist and a column
  -- nobody has ever changed both produce zero rows, and one of those is a typo.
  if not exists (select 1
                   from custom.applicable_fields(p_organization_id, p_table_id, null) f
                  where (f.data ->> 'key') = p_field_key) then
    raise exception 'This table has no column called "%", so there is no history of it.', p_field_key
      using errcode = '22023',
            hint = 'Check the column''s name on the table''s own settings panel — the history is kept per column key, and a renamed column keeps the key it was declared with.';
  end if;

  -- The Table's own title field, so a row of this answer names a RECORD and not a uuid —
  -- the same key `custom.dashboard_stuck` reads, for the same reason.
  select nullif(t.data ->> 'title_field', '') into v_titlek
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id();

  -- WHICH RECORDS OF THIS TABLE THIS PERSON MAY SEE, as one predicate over `custom.record`,
  -- resolved ONCE. A deleted record keeps its history and keeps its visibility, so it is
  -- not filtered out here: "who changed the price" about a record somebody has since
  -- removed is exactly the question this door exists for.
  v_sql := format(
    'select array_agg(r.id) from custom.record r
      where r.organization_id = %L::uuid and r.table_id = %L::uuid and %s %s',
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
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
           w.previous_data -> p_field_key,
           w.row_data -> 'data' -> p_field_key
      from (select h.row_id, h.version, h.operation, h.operation_name, h.occurred_at,
                   h.actor_id, h.actor_tier, h.row_data,
                   lag(h.row_data -> 'data') over (partition by h.row_id order by h.version)
                     as previous_data
              from history.row_versions h
             where h.entity_type = 'custom.record'
               and h.organization_id = p_organization_id
               and h.row_id = any (v_ids)) w
     where -- ONLY the versions in which THIS column moved. The whole point of the door is
           -- that a price changed twice in a thousand edits is two rows, not a thousand.
           (coalesce(w.previous_data, '{}'::jsonb) -> p_field_key)
             is distinct from (coalesce(w.row_data -> 'data', '{}'::jsonb) -> p_field_key)
     order by w.occurred_at desc, w.row_id, w.version desc
     limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_export(p_organization_id uuid, p_table_id uuid, p_columns text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10000, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols  text[];
  v_token text;
  v_rows  jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_export');
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  -- The column list is the TABLE's own Fields unless the caller named one. Exporting whatever
  -- keys happen to be in the documents would ship whatever an older shape left behind.
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

  -- THE READ DOOR DECIDES WHICH ROWS. `custom.query_visible_ids` answers SETOF uuid, so it is
  -- an id set and not a joinable row source; an export that selected from custom.record
  -- directly would hand a viewer every row in the organization, which is the single worst bug
  -- an export can have.
  select coalesce(jsonb_agg(r.doc order by r.created_at, r.id), '[]'::jsonb) into v_rows
    from (select rec.id, rec.created_at,
                 (select coalesce(jsonb_object_agg(c, coalesce(lv.vals -> c, 'null'::jsonb)),
                                  '{}'::jsonb)
                    from unnest(v_cols) c) as doc
            from custom.record rec
     cross join lateral (select custom.choice_render(p_organization_id, p_table_id,
                                  custom.record_values(p_organization_id, rec.id)) as vals) lv
           where rec.organization_id = p_organization_id
             and rec.table_id = p_table_id
             and rec.deleted_at is null
             and rec.id in (select custom.query_visible_ids(p_organization_id, p_table_id, p_required))
           order by rec.created_at, rec.id
           limit greatest(1, least(coalesce(p_limit, 10000), 100000))) r;

  -- CHOICE-VALUE. The rows carry the LABEL, because that is what an export is for and what a
  -- spreadsheet has to be able to read back. The KEY is not lost: every row carries `_choices`
  -- (key, label, retired, reason) and the export names the whole vocabulary once in `choices`,
  -- so a machine re-importing this file can write by key and a person can read it.
  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows,
                            'choices', custom.choice_field_map(p_organization_id, p_table_id));
end;
$function$;

create or replace function custom.conversation_scope_bind(p_organization_id uuid, p_conversation_id uuid,
                                               p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me    uuid := auth.uid();
  v_table uuid;
  v_name  text;
  v_title text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.conversation_scope_bind');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.conversation_scope_bind');

  -- THE RECORD, ON THE ONE LADDER. custom.has_visibility is the store's ladder and the only
  -- one that decides a store record; a person who may not open the record may not point a
  -- conversation at it, because the binding is what puts the record into a prompt.
  if not custom.has_visibility(v_me, 'record', p_record_id, 'viewer') then
    raise exception 'You do not have access to that record, so a conversation cannot be about it.'
      using errcode = '42501',
            hint = 'AGT-N-9: the binding is what puts a record into a prompt, so it takes the same '
                   'viewer level the read door takes. Ask somebody who holds it to share it with you.';
  end if;

  -- THE CONVERSATION, ON ITS OWN LADDER — and deliberately not the store''s. A conversation is
  -- not a Record of this store; `iam.has_access` is the platform ladder every other door onto
  -- `chat.conversation` uses, and `custom.has_visibility` cannot decide a row it has never
  -- heard of. (This is not the rival ladder `custom.doors_not_on_one_ladder` refuses: that
  -- census is about deciding a STORE RECORD with iam.has_access_for / iam.effective_level /
  -- public.has_permission_for, and the store record above is decided by custom.has_visibility.)
  if not coalesce(iam.has_access('conversation', p_conversation_id, 'editor'::public.permission_level), false) then
    raise exception 'That conversation is not yours to point at a record.'
      using errcode = '42501',
            hint = 'A conversation is bound by somebody who may write in it.';
  end if;

  select r.table_id,
         coalesce(nullif(t.data ->> 'label_singular', ''), nullif(t.data ->> 'name', ''), 'Record'),
         coalesce(nullif(btrim(coalesce(r.data ->> nullif(t.data ->> 'title_field', ''), '')), ''), 'Untitled')
    into v_table, v_name, v_title
    from custom.record r
    left join custom.record t
      on t.organization_id = r.organization_id and t.id = r.table_id
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;

  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000';
  end if;

  -- ONE SCOPE PER CONVERSATION. Re-binding to the same record is idempotent; pointing a
  -- conversation at a DIFFERENT record retires the old edge rather than leaving two, because
  -- "what is this chat about" may only have one answer.
  update platform.associations a
     set deleted_at = now(), deleted_via_type = 'conversation', deleted_via_id = p_conversation_id
   where a.source_type = 'conversation'
     and a.source_id = p_conversation_id
     and a.target_type = 'custom_record'
     and a.role = 'record_scope'
     and a.deleted_at is null
     and a.target_id is distinct from p_record_id;

  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id, label, metadata, created_by)
  values
    ('conversation', p_conversation_id, 'custom_record', p_record_id, 'record_scope',
     p_organization_id, v_title,
     jsonb_build_object('scope_type', v_name, 'scope_type_id', v_table,
                        'bound_by_door', 'custom.conversation_scope_bind'),
     v_me)
  on conflict (source_type, source_id, target_type, target_id, role)
  do update set deleted_at = null, label = excluded.label, metadata = excluded.metadata;

  return jsonb_build_object('bound', true, 'readable', true,
                            'record_id', p_record_id, 'table_id', v_table,
                            'scope_type', v_name, 'title', v_title);
end;
$fn$;


do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid := gen_random_uuid();
  v_home uuid; v_cust uuid; v_acme uuid; v_beta uuid;
  v_conv uuid := gen_random_uuid();
  v_txt text; v_res jsonb; v_caught text; v_red integer := 0;
begin
  perform set_config('app.actor_system', 'campaign-test/talkrec_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Wraithmoor Regional Museum of Art & Craft', 'wraithmoor-museum-'||substr(v_org::text,1,8), 'WRM', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/talkrec_red'),
    ('custom','member_default_visibility','organization',v_org,v_org,'"shared_only"'::jsonb,'campaign-test/talkrec_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Wraithmoor Regional Museum — Collections Store')) returning id into v_home;
  insert into chat.conversation (id, organization_id, title, created_by)
  values (v_conv, v_org, 'Provenance query on the Achebe-Foss sculpture', c_admin);

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then raise exception '0: no seat'; end if;

  v_cust := custom.table_declare(v_org, jsonb_build_object(
    'name','Enquirers','slug','enquirers_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Enquirer','label_plural','Enquirers','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_cust, jsonb_build_object('label','Stage','plain','text'));
  perform custom.field_declare(v_org, v_cust, jsonb_build_object(
    'label','Tax ID','key','ssn','plain','text','sensitivity','confidential'));
  v_acme := custom.record_write(v_org, v_cust, jsonb_build_object(
    'name','Fairmont Property Group','stage','Prospect','ssn','123-45-6789','parent_id',v_home::text));
  v_beta := custom.record_write(v_org, v_cust, jsonb_build_object(
    'name','Beta Works','stage','Won','parent_id',v_home::text));
  perform custom.record_update(v_org, v_acme, jsonb_build_object('stage','Won'));
  perform custom.share_grant(v_org, v_acme, 'user', c_dana, 'viewer'::public.permission_level);

  perform set_config('request.jwt.claims', c_dana_j, true);

  -- R1 (green 1b) — the triple door hands a viewer the confidential value.
  select string_agg(v.value::text, ' ') into v_txt from custom.record_values_versioned(v_org, v_acme) v;
  if coalesce(v_txt,'') like '%123-45-6789%' then v_red := v_red + 1;
    raise notice 'RED 1b: record_values_versioned leaked, as it did before this lane';
  else raise exception 'RED 1b DID NOT FLIP — the pre-lane body did not leak'; end if;

  -- R2 (green 1d) — as-of hands it over for any moment.
  select string_agg(s.state::text,' ') into v_txt from custom.record_as_of(v_org, v_acme, now()) s;
  if coalesce(v_txt,'') like '%123-45-6789%' then v_red := v_red + 1;
    raise notice 'RED 1d: record_as_of leaked';
  else raise exception 'RED 1d DID NOT FLIP'; end if;

  -- R3 (green 1e) — the history panel carries the before and the after.
  select string_agg(h.changes::text,' ') into v_txt from custom.record_history(v_org, v_acme, 50, 0) h;
  if coalesce(v_txt,'') like '%123-45-6789%' then v_red := v_red + 1;
    raise notice 'RED 1e: record_history leaked';
  else raise exception 'RED 1e DID NOT FLIP'; end if;

  -- R4 (green 1f) — one column's whole history, for a column she may not read.
  select string_agg(coalesce(f.after::text,''),' ') into v_txt
    from custom.field_history(v_org, v_cust, 'ssn', 50, 0, v_acme) f;
  if coalesce(v_txt,'') like '%123-45-6789%' then v_red := v_red + 1;
    raise notice 'RED 1f: field_history leaked';
  else raise exception 'RED 1f DID NOT FLIP'; end if;

  -- R5 (green 1g) — the spreadsheet.
  v_res := custom.io_export(v_org, v_cust);
  if v_res::text like '%123-45-6789%' then v_red := v_red + 1;
    raise notice 'RED 1g: io_export leaked';
  else raise exception 'RED 1g DID NOT FLIP'; end if;

  -- R6 (green 2d) — RETIRED, SUITES-TIDY 2026-09-22.
  --
  -- WHAT IT ASSERTED. Opening the same record's chat twice raised `21000 ON CONFLICT DO UPDATE
  -- command cannot affect row a second time`: the pre-fix `custom.conversation_scope_bind`
  -- body this file plants ends in `on conflict … do update`, and binding away and back reaches
  -- a TOMBSTONED edge which `trg_associations_revive_tombstone` brought back INSIDE the same
  -- INSERT — so the ON CONFLICT arm then touched that row a second time.
  --
  -- WHY IT CANNOT GO RED ANY MORE. The collision was closed at the TRIGGER, not at the
  -- function body this file plants. `platform.revive_tombstoned_association` now performs the
  -- revive as an UPDATE and `return null`s — "NEVER A SECOND ROW IN THE SAME STATEMENT. The
  -- insert is skipped because the write it was going to make has already been made, in place,
  -- on the row that was always this edge." With the insert skipped there is no conflict for
  -- any ON CONFLICT arm to hit, so restoring the old FUNCTION cannot reproduce the defect;
  -- only restoring the old TRIGGER could, and this file's inverse does not touch it.
  -- Measured on the dev clone (production's own data) 2026-09-22: the third bind raised
  -- nothing at all.
  --
  -- WHAT GUARDS THE CLASS NOW: talkrec_green.sql clause 2d, which binds a conversation away
  -- and back and asserts it simply works. Fixing lane: the associations revive-tombstone work
  -- that made the trigger return null (see the function's own header on the live database).
  --
  -- The five blocks above are untouched and still go red.

  -- SUITES-TIDY 2026-09-22: 5, not 6 — R6 is retired above and asserts nothing.
  if v_red <> 5 then raise exception 'only % of 5 blocks went red', v_red; end if;
  raise notice 'ALL 5 BLOCKS RED (R6 retired: its defect was closed at the trigger, which this inverse does not touch)';
  raise notice 'ALL CLAUSES PASSED';
  raise exception 'talkrec_red.sql: rolling back, as designed';
end;
$t$;

rollback;
