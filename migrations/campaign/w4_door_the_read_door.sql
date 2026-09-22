-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W4-DOOR — THE READ DOOR IS A DATABASE OBJECT, AND NOTHING READS A RECORD AROUND IT.
--
-- DOOR-1 · DOOR-2 · DOOR-3 · DOOR-4 · DOOR-5 · DOOR-12 · DOOR-N-1 · DOOR-N-5 · DYN-21.
--
-- THE RULING THIS LANE OWES (rule 23/28, DOOR-1 and V-58's generated-view reading):
-- V-58 says nothing reads a record directly. A GENERATED MASKING VIEW is one conforming
-- shape; a SET-RETURNING FUNCTION is another, and it is the one this file builds, because
-- `custom.record` is a HASH-PARTITIONED table whose rows are documents in one `data` jsonb
-- column. A view cannot mask a jsonb key per caller without a function in its select list
-- anyway, so the view would be a wrapper around exactly this function, one more object to
-- keep level, and PostgREST would expose it as a table with its own RLS story. So: ONE
-- function pair is the read door. Cost if wrong: a view over these functions, half an hour.
--
-- WHAT THE DOOR APPLIES, IN ORDER
--   1. Visibility          — `custom.has_visibility` (W2-VIS), which walks the carrying
--                            edges, and never a second access opinion.
--   2. Field-level security — `iam.visible_field_ids` (W2-ACCESS), asked ONCE per table per
--                            request, never per row and never per field.
--   3. Rendering           — name-keyed by default, id-keyed by an explicit argument (DOOR-N-5).
-- A field the caller may not see comes back NULL with its key listed in `_hidden`, saying
-- what would be needed: absent-or-honest, never a quietly missing key (law 4).
--
-- THE PRINCIPAL IS ALWAYS THE OPERATING PERSON. Every door here reads `auth.uid()` itself
-- and takes no principal argument, which is exactly what makes it safe to hand to a browser
-- and what makes DOOR-5 and DYN-21 true by construction: an agent assembling context calls
-- the same door under the person it is operating for, because there is no other way in.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ---------------------------------------------------------------------------------------
-- 1. WHAT THE CALLER MAY SEE, AND WHAT IS HIDDEN  (DOOR-2)
-- ---------------------------------------------------------------------------------------

create or replace function custom.hidden_field_notice(p_field custom.record, p_action text default 'read')
returns jsonb
language sql stable
set search_path to 'pg_catalog'
as $fn$
  select jsonb_build_object(
    'reason', p_field.data ->> 'sensitivity',
    'needs',  iam.level_label('record',
                iam.field_sensitivity_level(p_field.data ->> 'sensitivity', p_action,
                                            p_field.organization_id)),
    'or',     'a share of this one field with you');
$fn$;

comment on function custom.hidden_field_notice(custom.record, text) is
  'DOOR-2 / law 4: a hidden field is HONEST, never silently missing. It says what it would take to see it.';

-- The masking itself, done by the STORE. An application never decides this, because an
-- application never receives the value to decide about.
create or replace function custom.mask_document(
  p_document jsonb, p_visible_keys text[], p_notices jsonb, p_by_id boolean default false,
  p_key_ids jsonb default '{}'::jsonb)
returns jsonb
language sql immutable
set search_path to 'pg_catalog'
as $fn$
  select coalesce(
    (select jsonb_object_agg(
              case when p_by_id then coalesce(p_key_ids ->> e.key, e.key) else e.key end,
              case when e.key = any (p_visible_keys) then e.value else 'null'::jsonb end)
       from jsonb_each(coalesce(p_document, '{}'::jsonb)) e), '{}'::jsonb)
    || case when p_notices = '{}'::jsonb then '{}'::jsonb
            else jsonb_build_object('_hidden', p_notices) end;
$fn$;

comment on function custom.mask_document(jsonb, text[], jsonb, boolean, jsonb) is
  'DOOR-2: the store strips or masks. DOOR-N-5: name-keyed by default, id-keyed on request.';

-- ---------------------------------------------------------------------------------------
-- 2. THE READ DOOR  (DOOR-1, DOOR-2, DOOR-5, DOOR-N-5, DYN-21)
-- ---------------------------------------------------------------------------------------

create or replace function custom.read_records(
  p_organization_id uuid,
  p_table_id        uuid,
  p_by_id           boolean default false,
  p_limit           integer default 200,
  p_offset          integer default 0)
returns table (id uuid, document jsonb, level public.permission_level)
language plpgsql stable security definer
set search_path to ''
as $fn$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then p_limit := 200; end if;

  -- STEP 2, once per table per request: which fields this caller may see, at which level.
  -- The level used for the field question is the caller's level on the TABLE, so a page of
  -- a hundred records asks the field question once, not a hundred times (DOOR-10's shape).
  v_level := iam.effective_level(v_me, 'record', p_table_id, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
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

  -- STEP 1, per row: Visibility. `custom.visible_record_ids` is the set-based answer, and
  -- the door reads it rather than asking per row (VIS-N-1).
  for v_rec in
    select r.id, custom.record_values(r.organization_id, r.id) as doc
      from custom.record r
      join custom.visible_record_ids(v_me, 'viewer') v on v.id = r.id
     where r.organization_id = p_organization_id
       and r.table_id = p_table_id
       and r.deleted_at is null
     order by r.created_at desc
     limit p_limit offset p_offset
  loop
    id := v_rec.id;
    document := custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids);
    level := v_level;
    return next;
  end loop;
end;
$fn$;

comment on function custom.read_records(uuid, uuid, boolean, integer, integer) is
  'DOOR-1: THE read door. Visibility and field-level security, applied by the store, for the signed-in person and nobody else.';

create or replace function custom.read_record(
  p_organization_id uuid, p_record_id uuid, p_by_id boolean default false)
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $fn$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_level    public.permission_level;
  v_visible  text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  select r.table_id, custom.record_values(r.organization_id, r.id)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  if not custom.has_visibility(v_me, 'record', p_record_id, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an export, not an agent. Ask somebody who holds it to share it with you.';
  end if;

  v_level := iam.effective_level(v_me, 'record', p_record_id, p_organization_id, v_table);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, v_table, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')) , '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and not (f.data ->> 'key' = any (v_visible));

  return custom.mask_document(v_doc, v_visible, v_notices, p_by_id, v_key_ids);
end;
$fn$;

-- DOOR-4 and DOOR-5: an export, a search index and an agent's context are not three read
-- paths. They are three CALLERS of the one door, and each is written here so nobody has to
-- build a fourth. Every one of them resolves the principal the same way, so what an export
-- writes to a file and what an index writes to a row is exactly what that person may see.
create or replace function custom.export_records(p_organization_id uuid, p_table_id uuid, p_limit integer default 1000)
returns table (id uuid, document jsonb)
language sql stable
set search_path to 'pg_catalog'
as $fn$
  select d.id, d.document from custom.read_records(p_organization_id, p_table_id, false, p_limit, 0) d;
$fn$;

comment on function custom.export_records(uuid, uuid, integer) is
  'DOOR-4: an export stores only what the reading principal may see, because it IS the read door.';

create or replace function custom.index_payload(p_organization_id uuid, p_table_id uuid, p_limit integer default 1000)
returns table (id uuid, searchable text)
language sql stable
set search_path to 'pg_catalog'
as $fn$
  select d.id,
         (select string_agg(e.value #>> '{}', ' ')
            from jsonb_each(d.document - '_hidden') e
           where jsonb_typeof(e.value) in ('string', 'number'))
    from custom.read_records(p_organization_id, p_table_id, false, p_limit, 0) d;
$fn$;

comment on function custom.index_payload(uuid, uuid, integer) is
  'DOOR-4: a search index holds only what the reading principal may see. A hidden value is never in the index text.';

create or replace function custom.agent_context(p_organization_id uuid, p_table_id uuid, p_limit integer default 50)
returns jsonb
language sql stable
set search_path to 'pg_catalog'
as $fn$
  select jsonb_build_object(
    'records', coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'values', d.document)), '[]'::jsonb),
    'read_as', 'the person operating this agent',
    'through', 'custom.read_records')
    from custom.read_records(p_organization_id, p_table_id, false, p_limit, 0) d;
$fn$;

comment on function custom.agent_context(uuid, uuid, integer) is
  'DOOR-5 / DYN-21: an agent assembles context through the same read path, under the operating person''s own principal. There is no agent principal and no privileged lane.';

-- ---------------------------------------------------------------------------------------
-- 3. THE WRITE PATH REFUSES A FIELD THE CALLER MAY NOT EDIT  (DOOR-3)
-- ---------------------------------------------------------------------------------------
-- Enforced by the STORE, on the table, in front of every write door there is or ever will
-- be — not by whichever application happened to call one.

create or replace function custom._field_write_door()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_me    uuid := auth.uid();
  v_level public.permission_level;
  v_key   text;
  v_field custom.record;
  v_old   jsonb := coalesce(case when tg_op = 'UPDATE' then old.data end, '{}'::jsonb);
begin
  -- WHO THIS SKIPS, AND WHY IT IS NOT THE ROLE. Every write door into this store is
  -- SECURITY DEFINER and every server lane runs as the role that OWNS custom.record, so a
  -- role test here would skip the only write path that exists and DOOR-3 would be a law
  -- nothing ever enforced. What matters is whether a PERSON is being acted for: when the
  -- request carries one, that person's field-level security binds the write, whichever
  -- door and whichever role it arrived through. A write carrying no person at all is the
  -- store's own housekeeping and has no field-level answer to give.
  if v_me is null then
    return new;
  end if;
  if new.table_id is null or new.table_id = custom.field_kernel_id() then
    return new;
  end if;

  -- CREATING is not editing somebody else's field. `platform._stamp_actor` has already run
  -- (it sorts ahead of this trigger), so `created_by` is the person, and VIS-25 makes the
  -- creator the owner and therefore the top level on what they just made. Without this arm
  -- nobody could ever write a confidential field's first value, including its author.
  if tg_op = 'INSERT' and new.created_by = v_me then
    return new;
  end if;

  v_level := iam.effective_level(v_me, 'record', new.id, new.organization_id, new.table_id);

  for v_key in
    select e.key from jsonb_each(coalesce(new.data, '{}'::jsonb)) e
     where left(e.key, 1) <> '_'
       and (v_old -> e.key) is distinct from e.value
  loop
    select f.* into v_field
      from custom.record f
     where f.organization_id = new.organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = new.table_id
       and f.data ->> 'key' = v_key;
    if not found then continue; end if;

    if not iam.may_touch_field(v_me, v_field.id, new.organization_id, v_level, 'edit') then
      raise exception 'You can see this record, but "%" is not yours to change.',
                      coalesce(v_field.data ->> 'label', v_key)
        using errcode = '42501',
              hint = 'DOOR-3: the store refuses an edit to a field you may not edit, whichever door you came through. '
                     || 'It would take ' || iam.level_label('record',
                          iam.field_sensitivity_level(v_field.data ->> 'sensitivity', 'edit', new.organization_id))
                     || ', or a share of this one field with you.';
    end if;
  end loop;
  return new;
end;
$fn$;

create or replace trigger custom_record_field_write_door
  before insert or update of data on custom.record
  for each row execute function custom._field_write_door();

-- ---------------------------------------------------------------------------------------
-- 4. THE LAWS, AS QUERIES THAT CAN FAIL  (DOOR-N-1, DOOR-12, VIS-N-8)
-- ---------------------------------------------------------------------------------------

create or replace function custom.client_write_grants()
returns table (role_name text, object_name text, privilege text)
language sql stable
set search_path to 'pg_catalog'
as $fn$
  select r.rolname, c.oid::regclass::text, p.priv
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'custom'
    cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
    cross join (select rolname from pg_roles where rolname in ('authenticated','anon','public')) r
   where c.relkind in ('r','p','v')
     and has_table_privilege(r.rolname, c.oid, p.priv);
$fn$;

comment on function custom.client_write_grants() is
  'DOOR-N-1: there is exactly ONE write door into the record store and `authenticated` holds no direct INSERT, UPDATE or DELETE on any of it. Empty is the passing answer.';

create or replace function custom.read_paths_outside_the_door()
returns table (object_name text, why text)
language sql stable
set search_path to 'pg_catalog'
as $fn$
  select p.oid::regprocedure::text,
         'a client-callable function in schema custom that reads custom.record and is not the read door'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'custom'
    join platform.client_callable_door d
      on d.schema_name = 'custom' and d.function_name = p.proname
     and (d.signed_in_callers or d.anonymous_callers)
   where p.prosrc like '%custom.record%'
     and p.proname not in ('read_record', 'read_records', 'export_records', 'index_payload', 'agent_context');
$fn$;

comment on function custom.read_paths_outside_the_door() is
  'DOOR-1 / DOOR-12: the public API is the same doors with no privileged bypass. A client-callable function in this schema that reads records and is not the door is the defect this names. Empty is the passing answer.';

-- ---------------------------------------------------------------------------------------
-- 5. THE DOOR REGISTER. The two read doors are the FIRST functions in schema `custom` a
--    signed-in person may call, and they can be, for one reason: they take no principal.
--    `auth.uid()` is the only reader either of them will ever answer for, so a client
--    holding one cannot ask about anybody else. Every argument is checked: the record and
--    table ids are checked against Visibility and field-level security inside the body, and
--    a null organization or record id answers nothing rather than everything.
-- ---------------------------------------------------------------------------------------

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason,
   declared_by, signed_in_callers, anonymous_callers, non_client_lane)
select 'custom', d.fn, iam.door_identity_args(p.oid),
       platform.door_argtypes(p.proargtypes), d.reason, 'W4-DOOR', d.signed_in, false, d.lane
  from (values
    ('read_records', true,
     'W4-DOOR / DOOR-1: THE read door. p_organization_id and p_table_id are checked against custom.visible_record_ids and iam.visible_field_ids for auth.uid(); a null either side returns no rows rather than all rows; the reader is auth.uid() and cannot be passed in.',
     null),
    ('read_record', true,
     'W4-DOOR / DOOR-1: the single-record read door. p_record_id is checked against custom.has_visibility for auth.uid() and refuses by name when it fails; p_organization_id scopes the partition key; a null either side raises rather than widening.',
     null),
    ('export_records', false, 'W4-DOOR / DOOR-4: an export, which is the read door.',
     'server_only: an export runs on the server and writes a file; it inherits the door''s answer exactly, so the client calls the export endpoint and never this function.'),
    ('index_payload', false, 'W4-DOOR / DOOR-4: what a search index may hold.',
     'server_only: the indexer is a server lane. A client has no reason to ask what an index would contain, and the answer is already what read_records gives it.'),
    ('agent_context', false, 'W4-DOOR / DOOR-5 / DYN-21: an agent''s context, assembled under the operating person.',
     'server_only: context assembly happens in the agent runtime on the server, under the person it is operating for. The client never assembles context itself.'),
    ('client_write_grants', false, 'W4-DOOR / DOOR-N-1: the one-write-door census.',
     'server_only: it reads the catalogue and reports who can write to the store. An operator and verifier check, never a client''s question.'),
    ('read_paths_outside_the_door', false, 'W4-DOOR / DOOR-12: the no-privileged-bypass census.',
     'server_only: it reads the catalogue and names any client-callable reader that is not the door. An operator and verifier check.')
  ) d(fn, signed_in, reason, lane)
  join pg_proc p on p.proname = d.fn
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'custom'
 where not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'custom' and c.function_name = d.fn);
