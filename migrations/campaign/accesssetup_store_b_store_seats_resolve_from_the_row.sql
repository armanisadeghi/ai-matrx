-- chair-step: ADDS the Store Tables seat resolvers (PLAN §12.1): row_level >= L, row_field:<field>, row_creator, org_role:<role>, field_grant (a share of one column), each in three forms — person-scoped custom.store_seat_has, holders of one record custom.store_seat_holders, the set form custom.store_seat_records — plus custom.store_seat_invalid and the required-seat fallback custom.store_seat_fallback (organization owners and admins). Server only; client EXECUTE revoked.
-- lane: access-setup-store
-- lock: custom,iam
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §12, §12.1 (§12.1 overrides §12).
-- Inverse: migrations/inverse/accesssetup_store_b_store_seats_resolve_from_the_row_down.sql
-- Nothing calls these before the swap (PLAN §12 order 5); no door, kernel answer or iam.access_setup row changes.

-- ── the store's seat grammar (PLAN §12.1 "Seats are on the row, not the Table") ────────────────
--   {"kind":"row_level","min":"<permission_level>"}   the person's effective level on THIS record (every rung,
--                                                      record shares, Shown to and confidential readers included)
--   {"kind":"row_field","field_id":"<uuid>"}           people named in that person column of this row
--   {"kind":"row_creator"}                             the person who made this row
--   {"kind":"org_role","role":"owner|admin|member"}    the person's role in the record's organization
--   {"kind":"field_grant","field_id":"<uuid>","min":"<permission_level>"}  a share of ONE column (a grant on
--                                                      the field record; min defaults to viewer)
-- Every kind answers in three forms: person-scoped (custom.store_seat_has), holders of one record
-- (custom.store_seat_holders, for the People involved panel) and the set form for lists
-- (custom.store_seat_records: the rows of one Table where the person holds the seat).
-- Required-seat fallback: custom.store_seat_fallback (organization owners and admins; never the maker).

create or replace function custom.store_seat_invalid(p_seat jsonb)
 returns text
 language plpgsql
 immutable
 set search_path to ''
as $function$
-- why a seat is not one the store can resolve, in words; null when it is
declare v_kind text := p_seat ->> 'kind';
begin
  if p_seat is null or jsonb_typeof(p_seat) <> 'object' then return 'A seat is an object with a kind.'; end if;
  if v_kind is null or v_kind not in ('row_level', 'row_field', 'row_creator', 'org_role', 'field_grant') then
    return format('"%s" is not a kind of seat a Table knows (row_level, row_field, row_creator, org_role, field_grant).',
                  coalesce(v_kind, 'nothing'));
  end if;
  if v_kind in ('row_level') and (p_seat ->> 'min') is null then
    return 'A row_level seat names the lowest level it admits (min).';
  end if;
  if v_kind in ('row_level', 'field_grant') and (p_seat ->> 'min') is not null
     and not ((p_seat ->> 'min') = any (enum_range(null::public.permission_level)::text[])) then
    return format('"%s" is not a level.', p_seat ->> 'min');
  end if;
  if v_kind in ('row_field', 'field_grant')
     and coalesce(p_seat ->> 'field_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return format('A %s seat names its column (field_id).', v_kind);
  end if;
  if v_kind = 'org_role' and coalesce(p_seat ->> 'role', '') not in ('owner', 'admin', 'member') then
    return 'An org_role seat names owner, admin or member.';
  end if;
  return null;
end $function$;

create or replace function custom._store_seat_cell_people(p_value jsonb)
 returns uuid[]
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- the logins a person cell names: the cell holds Person kernel record ids (a string, or a list of strings /
  -- {id} objects); a Person with no login (data.user_id) names nobody who can sign in
  select coalesce(array_agg(distinct (p.data ->> 'user_id')::uuid) filter (where p.data ->> 'user_id' is not null),
                  '{}'::uuid[])
    from (
      select case jsonb_typeof(e) when 'string' then e #>> '{}' when 'object' then coalesce(e ->> 'id', e ->> 'record_id') end as v
        from jsonb_array_elements(case jsonb_typeof(p_value) when 'array' then p_value
                                                             when 'null' then '[]'::jsonb
                                                             else jsonb_build_array(p_value) end) e
    ) x
    join custom.record p on p.id::text = x.v and p.table_id = custom.person_kernel_id() and p.deleted_at is null
   where x.v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and p.data ->> 'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$function$;

create or replace function custom._store_seat_field_key(p_field_id uuid, p_table_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- a live column's key, only when it belongs to that Table
  select f.data ->> 'key'
    from custom.record f
   where f.id = p_field_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;
$function$;

create or replace function custom.store_seat_has(p_person uuid, p_record uuid, p_seat jsonb)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
-- does this person hold this seat on this record (person-scoped form; one row read, never every holder)
declare
  v_r   custom.record;
  v_key text;
begin
  if p_person is null or p_record is null or custom.store_seat_invalid(p_seat) is not null then return false; end if;
  select * into v_r from custom.record r where r.id = p_record and r.deleted_at is null;
  if not found or v_r.table_id is null then return false; end if;
  case p_seat ->> 'kind'
    when 'row_level' then
      return coalesce(custom.effective_level(p_person, v_r.organization_id, p_record, 'record')
                      >= (p_seat ->> 'min')::public.permission_level, false);
    when 'row_field' then
      v_key := custom._store_seat_field_key((p_seat ->> 'field_id')::uuid, v_r.table_id);
      return v_key is not null and p_person = any (custom._store_seat_cell_people(v_r.data -> v_key));
    when 'row_creator' then
      return v_r.created_by = p_person;
    when 'org_role' then
      return exists (select 1 from iam.memberships m
                      where m.organization_id = v_r.organization_id and m.container_type = 'organization'
                        and m.user_id = p_person and m.role = p_seat ->> 'role'
                        and m.status = 'active' and m.deleted_at is null);
    when 'field_grant' then
      return custom._store_seat_field_key((p_seat ->> 'field_id')::uuid, v_r.table_id) is not null
         and coalesce(iam.granted_level(p_person, 'record', (p_seat ->> 'field_id')::uuid)
                      >= coalesce(p_seat ->> 'min', 'viewer')::public.permission_level, false);
  end case;
  return false;
end $function$;

create or replace function custom._store_seat_candidates(p_record uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- everyone who could hold a level on this record: the organization's members, people granted on the record
  -- or its Table, the logins its person cells name and the portal's people in the organization
  with r as (select * from custom.record where id = p_record and deleted_at is null)
  select m.user_id from r join iam.memberships m on m.organization_id = r.organization_id
   where m.container_type = 'organization' and m.status = 'active' and m.deleted_at is null and m.user_id is not null
  union
  select p.granted_to_user_id from r join iam.permissions p
      on p.resource_type = 'record' and p.resource_id in (r.id, r.table_id)
   where p.granted_to_user_id is not null and p.status <> 'rejected' and (p.expires_at is null or p.expires_at > now())
  union
  select unnest(custom._store_seat_cell_people(e.value)) from r, jsonb_each(r.data) e
   where jsonb_typeof(e.value) in ('string', 'array') and left(e.key, 1) <> '_'
  union
  select pp.user_id from r join custom.portal_principal pp on pp.organization_id = r.organization_id and pp.is_active
   where pp.user_id is not null;
$function$;

create or replace function custom.store_seat_holders(p_record uuid, p_seat jsonb)
 returns table(user_id uuid, source text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
-- who holds this seat on this record, and why (the People involved panel's rows)
declare
  v_r   custom.record;
  v_key text;
begin
  if p_record is null or custom.store_seat_invalid(p_seat) is not null then return; end if;
  select * into v_r from custom.record r where r.id = p_record and r.deleted_at is null;
  if not found or v_r.table_id is null then return; end if;
  case p_seat ->> 'kind'
    when 'row_level' then
      return query
        select c.u, 'level:' || custom.effective_level(c.u, v_r.organization_id, p_record, 'record')::text
          from custom._store_seat_candidates(p_record) c(u)
         where custom.effective_level(c.u, v_r.organization_id, p_record, 'record') >= (p_seat ->> 'min')::public.permission_level;
    when 'row_field' then
      v_key := custom._store_seat_field_key((p_seat ->> 'field_id')::uuid, v_r.table_id);
      if v_key is null then return; end if;
      return query select u, 'named in ' || v_key from unnest(custom._store_seat_cell_people(v_r.data -> v_key)) u;
    when 'row_creator' then
      return query select v_r.created_by, 'made this row' where v_r.created_by is not null;
    when 'org_role' then
      return query select m.user_id, 'organization ' || m.role
        from iam.memberships m
       where m.organization_id = v_r.organization_id and m.container_type = 'organization'
         and m.role = p_seat ->> 'role' and m.status = 'active' and m.deleted_at is null and m.user_id is not null;
    when 'field_grant' then
      if custom._store_seat_field_key((p_seat ->> 'field_id')::uuid, v_r.table_id) is null then return; end if;
      return query select distinct p.granted_to_user_id, 'share of this column'
        from iam.permissions p
       where p.resource_type = 'record' and p.resource_id = (p_seat ->> 'field_id')::uuid
         and p.granted_to_user_id is not null and p.status <> 'rejected'
         and (p.expires_at is null or p.expires_at > now())
         and p.permission_level >= coalesce(p_seat ->> 'min', 'viewer')::public.permission_level;
  end case;
end $function$;

create or replace function custom.store_seat_records(p_person uuid, p_table uuid, p_seat jsonb)
 returns setof uuid
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
-- the set form: the live rows of one Table where this person holds the seat (for lists; asks from the person's side)
declare
  v_key text;
begin
  if p_person is null or p_table is null or custom.store_seat_invalid(p_seat) is not null then return; end if;
  case p_seat ->> 'kind'
    when 'row_level' then
      return query select r.id from custom.record r
                    where r.table_id = p_table and r.deleted_at is null
                      and custom.effective_level(p_person, r.organization_id, r.id, 'record') >= (p_seat ->> 'min')::public.permission_level;
    when 'row_field' then
      v_key := custom._store_seat_field_key((p_seat ->> 'field_id')::uuid, p_table);
      if v_key is null then return; end if;
      -- from the person's side: the Person records that carry this login, then the rows naming any of them
      return query select r.id from custom.record r
                    where r.table_id = p_table and r.deleted_at is null and r.data ? v_key
                      and p_person = any (custom._store_seat_cell_people(r.data -> v_key));
    when 'row_creator' then
      return query select r.id from custom.record r
                    where r.table_id = p_table and r.deleted_at is null and r.created_by = p_person;
    when 'org_role' then
      return query select r.id from custom.record r
                    where r.table_id = p_table and r.deleted_at is null
                      and exists (select 1 from iam.memberships m
                                   where m.organization_id = r.organization_id and m.container_type = 'organization'
                                     and m.user_id = p_person and m.role = p_seat ->> 'role'
                                     and m.status = 'active' and m.deleted_at is null);
    when 'field_grant' then
      if custom._store_seat_field_key((p_seat ->> 'field_id')::uuid, p_table) is null
         or not coalesce(iam.granted_level(p_person, 'record', (p_seat ->> 'field_id')::uuid)
                         >= coalesce(p_seat ->> 'min', 'viewer')::public.permission_level, false) then
        return;
      end if;
      return query select r.id from custom.record r where r.table_id = p_table and r.deleted_at is null;
  end case;
end $function$;

create or replace function custom.store_seat_fallback(p_org uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- a required seat that resolves to nobody is held by the organization's owners and admins (never the
  -- Table's maker: a maker can leave)
  select m.user_id from iam.memberships m
   where m.organization_id = p_org and m.container_type = 'organization' and m.role in ('owner', 'admin')
     and m.status = 'active' and m.deleted_at is null and m.user_id is not null;
$function$;

-- every SECURITY DEFINER function declares its access decision in data
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_b_store_seats_resolve_from_the_row.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: the logins a person cell names (Person kernel data.user_id).',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom._store_seat_cell_people(jsonb)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom._store_seat_cell_people(jsonb) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_b_store_seats_resolve_from_the_row.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: a live column key, only on its own Table.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom._store_seat_field_key(uuid,uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom._store_seat_field_key(uuid,uuid) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_b_store_seats_resolve_from_the_row.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: person-scoped store seat answer.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom.store_seat_has(uuid,uuid,jsonb)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom.store_seat_has(uuid,uuid,jsonb) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_b_store_seats_resolve_from_the_row.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: everyone who could hold a level on a record.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom._store_seat_candidates(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom._store_seat_candidates(uuid) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_b_store_seats_resolve_from_the_row.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: holders of a store seat on one record.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom.store_seat_holders(uuid,jsonb)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom.store_seat_holders(uuid,jsonb) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_b_store_seats_resolve_from_the_row.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: set form, rows of a Table where a person holds a seat.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom.store_seat_records(uuid,uuid,jsonb)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom.store_seat_records(uuid,uuid,jsonb) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
       'migrations/campaign/accesssetup_store_b_store_seats_resolve_from_the_row.sql (lane access-setup-store)', 'ACCESS-SETUP §12.1: required-seat fallback, organization owners and admins.',
       'server_only: an internal Store Tables answer, called only by other store functions and the equivalence proof; takes any person id, so never a client door', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = 'custom.store_seat_fallback(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;
revoke all on function custom.store_seat_fallback(uuid) from public, anon, authenticated;
revoke all on function custom.store_seat_invalid(jsonb) from public, anon, authenticated;
