-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.record_write(uuid, uuid, jsonb) 3aff21704174e63f90b9bbd480b3d49588bc56f1d01e33348e8beb299105f3f7
-- based-on: custom.record_update(uuid, uuid, jsonb, integer) 2bd7df8816c4d06ef1bcaa5dbf253a7f6e043402c0a55e31fa7c2e8f4b1313e0
-- based-on: custom.record_delete(uuid, uuid) 110f604c57e30caff00fa4c3917c062db01d1f78ee034a1c61cd94c6a2125be6
-- based-on: custom.record_restore(uuid, uuid) d7842eecac9a00a3d682ebec294e3e2fb714d7150ce94eee4a2c3263adf783fe
-- based-on: custom.table_declare(uuid, jsonb) 7f7cdd5320753e0af6e9cb102c42807b4d7cc5c7b90e4e5bfd0de792ef71315a
-- based-on: custom.applicable_fields(uuid, uuid, text) 6a4215d91028f9a299ecb0b4cb40c1ee5355447cbe630f21c35db39e1974c254
-- based-on: custom.table_capacity(uuid, uuid) e14c31ae38c2575e3251dcc9522829a8e5744334c4366bb6bd5e33de81654266
-- based-on: custom.promote_table(uuid, uuid) 0e373442c505224690ea278446475bb827f41986c558473db2cd9a691bf34839
--
-- W4-DOOR — THE WRITE DOORS BECOME CLIENT-CALLABLE, AND EACH ONE DECIDES ACCESS FIRST.
--
-- DOOR-1 · DOOR-3 · DOOR-N-1 · AGT-N-4.
--
-- THE COLLISION THIS RESOLVES. The store's read doors were opened to `authenticated` by
-- `w4_door_the_client_grants.sql`. Every WRITE door stayed `signed_in_callers = false`, so
-- the agent tool — which runs every verb under the OPERATING PERSON's own principal, role
-- `authenticated`, because AGT-N-4 forbids a service account — could read the store and
-- could not write to it. The same wall stands in front of `@ai-matrx/records` and
-- `@ai-matrx/records-ui`: a browser can list records and cannot create one. A half-store is
-- not a store, so the write doors are declared and opened here.
--
-- WHAT THIS OPENS, AND IT IS EXACTLY THESE EIGHT
--   custom.record_write      create a record          (already SECURITY DEFINER)
--   custom.record_update     patch, with the compare-and-swap on expected_version
--   custom.record_delete     soft delete
--   custom.record_restore    undo the soft delete
--   custom.table_declare     declare a Table          (becomes SECURITY DEFINER here)
--   custom.applicable_fields the Fields of one Table  (becomes SECURITY DEFINER here)
--   custom.table_capacity    what a Table has room for(becomes SECURITY DEFINER here)
--   custom.promote_table     move a Table to fast storage (becomes SECURITY DEFINER here)
-- Nothing else in schema `custom` is opened. `custom.record_aggregate` and
-- `custom.record_values_versioned` stay closed on purpose (see the last section).
--
-- 🚨 THE DEFECT THIS FILE HAD TO FIX BEFORE IT COULD OPEN ANYTHING, AND IT IS A CLASS.
-- The four write doors are SECURITY DEFINER owned by the owner of `custom.record`, and
-- `custom.record` does NOT force row-level security — so inside a door, RLS is not applied
-- at all. The ONLY check any of them made was `custom.assert_store_door`, which asks one
-- question: is the store switched on for this organization? It never asks whether the
-- CALLER may reach that organization. While the switch was off and only the owner role
-- could write, that was harmless. The moment a browser holds EXECUTE it is a cross-tenant
-- write: any signed-in person could name any organization id and create, patch, delete or
-- restore rows inside it. `platform.door_body_must_decide` says this in its own words — a
-- door row is not a door check — and it REFUSES the door rows at the bottom of this file
-- unless the bodies decide access. So the decision is added here, in one helper, called by
-- all eight doors, before their first read or write.
--
--   `custom.assert_client_may_reach(organization, door)`
--     1. The role that owns `custom.record` (the campaign's own server lanes, the workflow
--        runner, every migration) passes untouched — exactly as `custom.assert_store_door`
--        already treats it, and read from the catalogue rather than as a role literal.
--     2. Anybody else must reach that organization: `iam.has_org_access(organization)`,
--        the platform's one membership answer, asked for `auth.uid()`.
--     3. Otherwise it refuses by name, 42501, saying which organization and what to do.
--   `custom.promote_table` asks one question more, because it BUILDS INDEXES on a
--   sixteen-way partitioned table: the caller must hold `admin` on the Table itself
--   through `custom.has_visibility`. Storage layout is not a thing every member may move.
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE
--   · The switch. `custom/system_enabled` still resolves false platform-wide, and
--     `custom.assert_store_door` still runs FIRST in every one of these bodies. With the
--     switch off, every door below refuses a signed-in caller by name with its remedy —
--     opening a door is not turning a feature on.
--   · `anon`, `public`, `service_role`: nothing is granted to any of them, here or in the
--     grant file that accompanies this one.
--   · Any table privilege. DOOR-N-1 is unchanged: no client role holds INSERT, UPDATE or
--     DELETE on anything in schema `custom`, and a direct table write is still refused.
--
-- WHY THE DOOR ROWS ARE WRITTEN, NOT JUST THE GRANTS. `platform.client_callable_door` is
-- what `custom.reopen_declared_doors()` reads. A later lane that creates a function in
-- `custom` and runs the schema-wide closing revoke takes every client grant in the schema
-- back; one call to `reopen_declared_doors()` puts back exactly what is declared here. A
-- grant without a door row would be lost at the next wave and nobody would notice.
--
-- THE INVERSE is `migrations/inverse/w4_door_the_write_doors_are_client_callable_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ---------------------------------------------------------------------------------------
-- 1. THE ONE ACCESS DECISION EVERY WRITE DOOR MAKES
-- ---------------------------------------------------------------------------------------

create or replace function custom.assert_client_may_reach(p_organization_id uuid, p_door text)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_owner oid;
  v_who   name := custom.caller_role();
begin
  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    return;
  end if;

  raise exception 'You are not a member of that organization, so % has nothing to do there.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'REC-29 / T15: organizations are hard walls, and a door decides who may reach one before it decides anything else. Switch to an organization you belong to, or ask an owner of that one to add you.';
end $fn$;

comment on function custom.assert_client_may_reach(uuid, text) is
  'W4-DOOR: the one membership decision every client-callable door in schema custom makes before its first read or write. The role that owns custom.record passes (the server lanes); everybody else must reach the organization through iam.has_org_access for auth.uid(). SECURITY DEFINER doors do not apply RLS, so without this a signed-in caller could name any organization id.';

-- ---------------------------------------------------------------------------------------
-- 2. THE FOUR RECORD WRITE DOORS — bodies unchanged except for the one added decision
-- ---------------------------------------------------------------------------------------

create or replace function custom.record_write(p_organization_id uuid, p_table_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_id uuid;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write');
  -- THE MEMBERSHIP DECISION, before anything is read or written. A definer door applies no
  -- row-level security, so this is the only thing standing between a signed-in caller and
  -- another organization's store.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_write');

  if p_organization_id is null then
    raise exception 'custom.record_write: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, p_table_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$fn$;

create or replace function custom.record_update(p_organization_id uuid, p_record_id uuid, p_patch jsonb, p_expected_version integer default null::integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_new       integer;
  v_current   integer;
  v_contested jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_update');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_update');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_update: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'custom.record_update: the patch must be an object of field key -> value, and it is a %', coalesce(jsonb_typeof(p_patch), 'nothing')
      using errcode = '22023';
  end if;

  -- THE OPT-IN POSTURE, KEPT. A write that declares no base revision behaves exactly as a
  -- direct UPDATE always has: last-write-wins.
  if p_expected_version is null then
    update custom.record
       set data = data || p_patch
     where organization_id = p_organization_id and id = p_record_id and deleted_at is null
    returning version into v_new;
    if v_new is null then
      raise exception 'There is no record % in this organization any more.', p_record_id
        using errcode = '02000',
              hint = 'It was deleted, or it never existed here. The store is keyed (organization_id, id), so a record from another organization is not found by this one.';
    end if;
    return v_new;
  end if;

  -- THE COMPARE-AND-SWAP.
  update custom.record
     set data = data || p_patch
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
     and version = p_expected_version
  returning version into v_new;
  if v_new is not null then
    return v_new;
  end if;

  select r.version into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_current is null then
    raise exception 'There is no record % in this organization any more - somebody deleted it while you were working on it.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was written. The record is gone, so there is nothing to merge into: keep your work somewhere else, or write it as a new record.';
  end if;

  select jsonb_object_agg(k.key, r.data -> k.key) into v_contested
    from custom.record r, lateral jsonb_object_keys(p_patch) k(key)
   where r.organization_id = p_organization_id and r.id = p_record_id;

  raise exception 'Someone else changed this record while you were working on it. You wrote against version %, and version % is the one that won.',
                  p_expected_version, v_current
    using errcode = 'PT409',
          detail = jsonb_build_object('expected_version', p_expected_version,
                                      'current_version',  v_current,
                                      'contested_fields', coalesce(v_contested, '{}'::jsonb))::text,
          hint = format('Nothing was overwritten and nothing was lost - their work is still there and yours is still in your hands. Look at what changed (it is in this error, field by field), decide keep-mine, keep-theirs or merged, and write it again against version %s. Resolution is just another write.', v_current);
end;
$fn$;

create or replace function custom.record_delete(p_organization_id uuid, p_record_id uuid)
returns timestamp with time zone
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_at timestamptz;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_delete');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was already deleted, so nothing changed.'
        using errcode = '02000',
              hint = 'REC-23: it is still here and still reversible - custom.record_restore(organization, record) brings it back.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.';
  end if;
  return v_at;
end;
$fn$;

create or replace function custom.record_restore(p_organization_id uuid, p_record_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_rows bigint;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_restore');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_restore: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id and id = p_record_id and deleted_at is not null;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was not deleted, so there was nothing to bring back.'
        using errcode = '02000', hint = 'REC-23: it is already here.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'REC-23: a record is reversible while its table still keeps its history, and this one is not in this organization at all.';
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------------------
-- 3. THE FOUR TABLE-SHAPED DOORS. Each was SECURITY INVOKER, which for a client means
--    "permission denied for table record" — a dead door, because `authenticated` holds no
--    privilege anywhere in this schema and never will (DOOR-N-1). They become SECURITY
--    DEFINER doors that decide membership themselves, which is the same shape the four
--    record doors already had.
-- ---------------------------------------------------------------------------------------

create or replace function custom.table_declare(p_organization_id uuid, p_spec jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_id uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_declare');

  if p_organization_id is null then
    raise exception 'custom.table_declare: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', coalesce(p_spec, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$fn$;

create or replace function custom.applicable_fields(p_organization_id uuid, p_table_id uuid, p_record_type text default null::text)
returns setof custom.record
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an invented one
  -- answer identically: both are refused, neither is told whether the table exists.
  perform custom.assert_store_door(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.applicable_fields');

  return query
    select f.*
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ? p_record_type));
end $fn$;

create or replace function custom.table_capacity(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_records bigint;
  v_ceiling integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_capacity');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_capacity');

  v_ceiling := custom.table_record_ceiling(p_organization_id);
  select count(*) into v_records
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null;

  return jsonb_build_object(
    'records',   v_records,
    'ceiling',   v_ceiling,
    'remaining', greatest(v_ceiling - v_records, 0),
    'over',      v_records > v_ceiling,
    'knob',      'custom/table_record_ceiling',
    'says',      case
                   when v_records > v_ceiling then
                     format('this table holds %s records, which is more than the %s it is set up for', v_records, v_ceiling)
                   else
                     format('this table holds %s of the %s records it is set up for', v_records, v_ceiling)
                 end);
end $fn$;

create or replace function custom.promote_table(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_moved  bigint;
  v_before bigint;
  v_after  bigint;
  v_was    text;
  v_owner  oid;
  f        record;
  v_built  jsonb := '[]'::jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.promote_table');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.promote_table');

  -- 🚨 ONE QUESTION MORE THAN THE OTHER DOORS, and it is because of what this one DOES:
  -- it builds indexes on `custom.record`, a sixteen-way hash-partitioned table shared by
  -- every organization. Moving a Table to fast storage is a storage decision, not an edit,
  -- so a member who may write records still may not make it — `admin` on the Table itself
  -- is what may, and that is the same ladder every other access answer in this store uses.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if not pg_has_role(custom.caller_role(), v_owner, 'member')
     and not custom.has_visibility(auth.uid(), 'record', p_table_id, 'admin'::public.permission_level) then
    raise exception 'Moving this table to fast storage is an administrator''s change, and you have not been given that on this table.'
      using errcode = '42501',
            hint = 'Promoting a table builds indexes across the whole store, so it asks for admin on the table rather than permission to edit its records. Ask somebody who administers this table to do it.';
  end if;

  v_was := custom.table_storage(p_organization_id, p_table_id);
  if v_was is null then
    raise exception 'That is not a table of this organization, so there was nothing to move.'
      using errcode = '23503',
            hint = 'REC-4: promoting a Table is per Table and per organization. The store is keyed (organization_id, id), so a Table of another organization is not found by this one - and a Table that was deleted is not found either.';
  end if;
  select count(*) into v_before from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  for f in select * from custom.promoted_fields(p_organization_id, p_table_id) where indexable loop
    v_built := v_built || jsonb_build_array(custom.promote_field(p_organization_id, p_table_id, f.field_id));
  end loop;

  update custom.record
     set data = data || jsonb_build_object('storage', 'heavy')
   where organization_id = p_organization_id and id = p_table_id
     and table_id = custom.table_kernel_id();
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    raise exception 'Nothing was changed, so this table was not moved to fast storage.'
      using errcode = '42501',
            hint = 'REC-4: the table is there and readable, but this caller''s write did not reach it. Nothing was built and nothing was left half-done.';
  end if;

  select count(*) into v_after from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  return jsonb_build_object('was', v_was, 'now', custom.table_storage(p_organization_id, p_table_id),
                            'records_before', v_before, 'records_after', v_after,
                            'rows_moved', v_after - v_before, 'indexes', v_built,
                            'table_rows_changed', v_moved);
end $fn$;

-- ---------------------------------------------------------------------------------------
-- 4. THE DOOR REGISTER, NEW ROWS. This is what `custom.reopen_declared_doors()` reads, so
--    a later lane's schema-wide closing revoke cannot quietly shut these again.
--    `platform.door_body_must_decide` re-reads each body at COMMIT and refuses any row
--    here whose function does not decide access — which is the guard that made section 1
--    necessary rather than optional.
--    The four RECORD doors already HAVE rows (written `signed_in_callers = false` by
--    W4-DOOR), and flipping an existing registry row is an UPDATE, which the additive
--    allow-list refuses by name at production and rightly so. Those four flips live with
--    the grants in `w4_door_the_write_client_grants.sql`, the chair step beside this file,
--    and they must run BEFORE it grants: `platform.enforce_definer_client_grants` revokes
--    a client EXECUTE on a door whose row still says no client may open it, inside the
--    GRANT statement itself.
-- ---------------------------------------------------------------------------------------

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason,
   declared_by, signed_in_callers, anonymous_callers, non_client_lane)
select 'custom', d.fn, iam.door_identity_args(p.oid),
       platform.door_argtypes(p.proargtypes), d.reason, 'W4-DOOR-WRITE', true, false, null
  from (values
    ('table_declare',
     'W4-DOOR / DOOR-3: the declare-a-Table door. Switch first (custom.assert_store_door), then membership (custom.assert_client_may_reach for auth.uid()), then the Table shape guard judges the spec as it lands. A person who builds their own table in the UI calls exactly this.'),
    ('applicable_fields',
     'W4-DOOR / DOOR-1: which Fields apply to one Table, which is what a form, a table header row and the agent''s structure stamp all need. Membership is decided before the first read, so a foreign organization id and an invented one answer identically. It returns Field declarations, never a record''s values.'),
    ('table_capacity',
     'W4-DOOR / DOOR-3: what a Table still has room for, asked BEFORE a write so the store can refuse in advance instead of failing mid-import. Switch first, then membership for auth.uid(). It returns counts about one organization''s own table.'),
    ('promote_table',
     'W4-DOOR / DOOR-3: move a Table to fast storage. Switch first, then membership, then admin on the Table itself through custom.has_visibility — it builds indexes across a shared partitioned store, so it asks for more than permission to edit records.')
  ) d(fn, reason)
  join pg_proc p on p.proname = d.fn
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'custom'
 where not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'custom' and c.function_name = d.fn
                      and c.identity_argtypes = platform.door_argtypes(p.proargtypes));

-- ---------------------------------------------------------------------------------------
-- 5. WHAT STAYS CLOSED, AND WHY — so the next seat does not read the gap as an oversight.
--   · custom.record_values_versioned: it returns every VALUE of a record with its version
--     and its source, and it does NOT consult field-level security. Opening it would be a
--     read path around DOOR-2's masking, which is the one thing the read door exists for.
--     `@ai-matrx/records` already degrades honestly: on 42501 each value says its version
--     is unknown. It becomes a client door when it masks, not before.
--   · custom.record_aggregate: it builds its SQL dynamically (custom.agg_sql) and nobody
--     has yet proven that a confidential field cannot be grouped or measured through it.
--     A grouped count of a field you may not read is still a read. Until that is proven,
--     aggregation is a server lane and a browser gets the store's 42501 from it.
--   · custom.export_records, index_payload, agent_context: unchanged server lanes, per
--     `w4_door_the_read_door.sql`.
-- ---------------------------------------------------------------------------------------
