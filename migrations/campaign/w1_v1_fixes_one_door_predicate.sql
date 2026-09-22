-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.external_history_event(uuid,uuid,text) d7a7572d180dff68c4829e31860b7210358209f96669d44620ed70d6a148f902
-- based-on: custom.external_source_declare(uuid,text,text,text,text,text) 4a49b887899a84823e00c2dcdbcc177f33b898085e1c126b17bbe292b411137b
-- based-on: custom.external_stub_upsert(uuid,uuid,uuid,text,text,text) f9e27e0649087ec598fa113249ef9f40430a6370c5e9c8f96666d3a980a7499c
-- based-on: custom.external_write_through(uuid,uuid,jsonb) 5a1740bd80f1e87a60d0ae7a18740c4cd3de84dca15a02ed116d4dc580c0bed4
-- based-on: custom.external_writes_set(uuid,uuid,boolean) 50e1d1c466a7b4c550b31fe844ac550a50f39d7ce9875d3e8ff33e9539cd07ed
-- based-on: custom.record_write(uuid,uuid,jsonb) 204164363dee2d3391fd9af60d40dc0830a185fbeb0f91c1e8bad7484dee7e60
--
-- W1-V1-FIXES, FINDING 1 — THE SWITCH MUST HOLD THROUGH EVERY DOOR, AND THERE IS NOW
-- EXACTLY ONE PREDICATE THAT DECIDES IT.
--
-- WHAT `V1-MODEL` MEASURED, AND WHAT THIS LANE PROVED UNDER IT
-- -----------------------------------------------------------
-- With `custom/system_enabled` resolving false, role `zz_v1_door` (no member of the role
-- that owns `custom.record`) was REFUSED a direct `insert into custom.record` by name —
-- and the SAME role's `custom.record_write(...)` LANDED. This lane reproduced it in
-- `scripts/campaign-tests/v1_fixes_red.sql` block 1, with its control.
--
-- THE ROOT CAUSE, PROVEN RATHER THAN ASSUMED. A probe function created with
-- `custom.record_write`'s exact posture reports, from inside the `SECURITY DEFINER` body:
-- `current_user` = the DEFINER (the table's owner), while the `role` GUC still names the
-- role the caller actually held. The three copy-pasted door blocks all asked
-- `pg_has_role(current_user, relowner, 'member')`, and inside a definer door owned by that
-- same owner that question answers TRUE for everybody. The door was not weak; it was
-- asking the wrong identity.
--
-- THE CLASS, CENSUSED ON THE BRANCH 2026-09-17 (not the instance)
-- ---------------------------------------------------------------
--   · schema `custom` holds 96 functions, of which 11 are `SECURITY DEFINER`; five of
--     those WRITE (`record_write`, `external_source_declare`, `external_stub_upsert`,
--     `external_write_through`, `external_writes_set`, `external_history_event` — six,
--     counting the history writer) and the rest are read paths.
--   · THREE trigger bodies carried the door, each a copy-paste of the same eleven lines:
--     `_record_field_validation`, `_derived_fields`, `_field_type_parity_guard`. Eleven
--     trigger functions fire on `custom.record`; eight of them had no door at all.
--   · TWO base tables in `custom` carry no door whatsoever: `custom.external_link` and
--     `custom.external_source`.
--
-- THE FIX IS ONE PREDICATE, AND EVERY DOOR AND EVERY TRIGGER READS IT
-- -------------------------------------------------------------------
--   1. `custom.caller_role()` — the identity the CALLER actually held, which is the `role`
--      GUC when one is set and `session_user` otherwise. Neither moves inside a
--      `SECURITY DEFINER` body, which is the whole point.
--   2. `custom.assert_store_door(organization_id, what)` — the ONE predicate. It raises
--      42501 naming the caller AND the door it was refused at, with the remedy. Every
--      door and every trigger calls it; nothing copy-pastes it again.
--   3. `custom._store_door()` — the same predicate as a trigger, bound to the two tables
--      that had none.
--
-- THE SWITCH NEVER REMOVES A CHECK. Every body below runs exactly as it did once the door
-- has let the caller through, so landing this is inert for the owner and a named refusal
-- for everybody else.
--
-- THE INVERSE: `migrations/inverse/w1_v1_fixes_one_door_predicate_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. THE IDENTITY THE CALLER ACTUALLY HELD  (NEW FUNCTION)
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function custom.caller_role()
  returns name
  language sql
  stable
  set search_path to 'pg_catalog'
as $fn_cr$
  -- `current_user` is useless here: inside a SECURITY DEFINER door it has ALREADY been
  -- rewritten to the definer, so a door owned by the table's owner answers "the owner" for
  -- every caller on earth. Two things do NOT move across that boundary:
  --   · the `role` GUC, which is what `SET ROLE` / `SET LOCAL ROLE` wrote and what
  --     PostgREST sets to `anon` / `authenticated` for every request it serves;
  --   · `session_user`, the role the connection authenticated as.
  -- `SHOW role` answers the literal string 'none' when nothing has been SET, so 'none'
  -- means "no role was assumed" and the authenticated role is the answer.
  select coalesce(nullif(current_setting('role', true), 'none'), session_user)::name;
$fn_cr$;

comment on function custom.caller_role() is
  'The identity the CALLER actually held - the role GUC when one is set, session_user otherwise. Never current_user, which a SECURITY DEFINER door has already rewritten to itself. This is the one identity every door and trigger in schema custom judges.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. THE ONE DOOR PREDICATE  (NEW FUNCTION)
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function custom.assert_store_door(p_organization_id uuid, p_door text)
  returns void
  language plpgsql
  stable
  set search_path to 'pg_catalog'
as $fn_asd$
declare
  v_owner oid;
  v_who   name := custom.caller_role();
begin
  -- The switch is a PRODUCT switch and never the security boundary (§6 fact two's REVOKEs
  -- are). While it resolves false the store belongs to the campaign that owns it, and the
  -- only legitimate writer is the role that owns custom.record.
  if custom.store_is_open(p_organization_id) then
    return;
  end if;

  -- Read the owner from the catalogue, never as a role literal (rule 15), so the door
  -- cannot drift from the table it guards.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    return;
  end if;

  raise exception 'The custom data store is switched off, so % is not taking writes from "%".',
    coalesce(nullif(btrim(p_door), ''), 'it'), v_who
    using errcode = '42501',
          hint = 'custom/system_enabled resolves false. While it does, this store takes writes only from the role that owns custom.record - through every door, including this one. The switch checklist turns the knob on; a lane never does. Nothing here skips a check while the switch is off: it is a closed door, not a quiet one.';
end;
$fn_asd$;

comment on function custom.assert_store_door(uuid, text) is
  'THE one door predicate for schema custom. Raises 42501 naming the caller''s real identity and the door it was refused at, with the remedy, while custom/system_enabled resolves false and the caller is not a member of custom.record''s owner. Every SECURITY DEFINER write door and every trigger in this schema calls it; nothing copies it.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. THE SAME PREDICATE AS A TRIGGER, FOR THE TWO TABLES THAT HAD NO DOOR
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function custom._store_door()
  returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_sd$
begin
  -- One line, because there is one predicate. `TG_TABLE_SCHEMA.TG_TABLE_NAME` is what the
  -- refusal names, so a caller is told WHICH door said no rather than that "something" did.
  perform custom.assert_store_door(new.organization_id,
                                   format('%I.%I', tg_table_schema, tg_table_name));
  return new;
end;
$fn_sd$;

comment on function custom._store_door() is
  'The custom-data store door as a trigger: one call to custom.assert_store_door, naming the table it fired on. Bound to the tables in schema custom that carry no door of their own.';

create or replace trigger custom_external_link_store_door
  before insert or update on custom.external_link
  for each row execute function custom._store_door();

create or replace trigger custom_external_source_store_door
  before insert or update on custom.external_source
  for each row execute function custom._store_door();


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. EVERY SECURITY DEFINER WRITE DOOR IN `custom` CALLS THE ONE PREDICATE
--
--    Six doors, one line each. The five read-only definers in this schema
--    (`external_rows`, `external_tier_contract`, `external_foreign_table_findings`,
--    `relation_target_ours`, `relation_target_external`) are NOT given a write door:
--    they read, and what holds reads off is §6 fact two (schema `custom` revoked from
--    PUBLIC, `anon`, `authenticated` and `service_role`), never this product switch.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION custom.external_history_event(p_organization_id uuid, p_link_id uuid, p_operation text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_link custom.external_link%rowtype;
  v_src  custom.external_source%rowtype;
  v_id   bigint;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.external_history_event');

  if p_organization_id is null or p_link_id is null or p_operation is null then
    raise exception 'custom.external_history_event: organization_id, link_id and operation are all required'
      using errcode = '22004';
  end if;
  if p_operation not in ('linked', 'refreshed', 'unlinked') then
    raise exception 'custom.external_history_event: operation % is not one of linked, refreshed, unlinked', p_operation
      using errcode = '22023';
  end if;
  select * into v_link from custom.external_link
   where organization_id = p_organization_id and id = p_link_id and deleted_at is null;
  if not found then
    raise exception 'custom.external_history_event: no external link % in organization %', p_link_id, p_organization_id
      using errcode = '02000';
  end if;
  select * into v_src from custom.external_source
   where organization_id = p_organization_id and id = v_link.source_id;

  insert into history.row_versions
    (entity_type, row_id, organization_id, version, operation, row_data, actor_id, occurred_at)
  values
    ('external_link', null, p_organization_id, 1, p_operation,
     jsonb_build_object(
       'about', 'external_link',
       'link_id', v_link.id,
       'stub_record_id', v_link.record_id,
       'target_ref', v_link.target_ref,
       'tier', v_src.tier,
       'connection_token', v_src.connection_token,
       'external_table', v_src.external_table,
       'external_key', v_link.external_key,
       'fetched_at', v_link.fetched_at,
       'foreign_row_copied', false),
     auth.uid(), now())
  returning id into v_id;
  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION custom.external_source_declare(p_organization_id uuid, p_tier text, p_connection_token text, p_external_schema text, p_external_table text, p_link_template text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.external_source_declare');

  if p_organization_id is null then
    raise exception 'custom.external_source_declare: organization_id is required'
      using errcode = '22004';
  end if;
  if p_tier is null or p_connection_token is null or p_external_table is null then
    raise exception 'custom.external_source_declare: tier, connection_token and external_table are all required'
      using errcode = '22004';
  end if;
  if p_tier in ('customer_schema', 'managed_postgres') then
    raise exception 'custom.external_source_declare: tier % is not available. This campaign builds its row shape, its contract surface and this refusal only; provisioning, credential custody and billing are DEFERRED (D-14) because no lane may spend money.', p_tier
      using errcode = '0A000',
            hint = 'The trigger is written down: the first customer who asks for a customer schema or a managed Postgres instance, with the spend approved by Arman. Until then: select custom.external_tier_contract() says what each tier is and what it needs, and tier foreign_table is available today.';
  end if;
  if p_tier <> 'foreign_table' then
    raise exception 'custom.external_source_declare: % is not a tier. The three are foreign_table, customer_schema and managed_postgres.', p_tier
      using errcode = '22023';
  end if;
  if btrim(p_connection_token) = '' or btrim(p_external_table) = '' then
    raise exception 'custom.external_source_declare: connection_token and external_table may not be blank'
      using errcode = '22023';
  end if;
  insert into custom.external_source
    (organization_id, tier, connection_token, external_schema, external_table, link_template)
  values
    (p_organization_id, p_tier, btrim(p_connection_token), coalesce(p_external_schema, ''),
     btrim(p_external_table), p_link_template)
  on conflict (organization_id, connection_token, external_schema, external_table)
    where deleted_at is null
    do update set link_template = excluded.link_template
  returning id into v_id;
  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION custom.external_stub_upsert(p_organization_id uuid, p_source_id uuid, p_table_id uuid, p_external_key text, p_link_url text, p_cached_title text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_src    custom.external_source%rowtype;
  v_rec_id uuid;
  v_link   uuid;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.external_stub_upsert');

  if p_organization_id is null or p_source_id is null or p_external_key is null then
    raise exception 'custom.external_stub_upsert: organization_id, source_id and external_key are all required'
      using errcode = '22004';
  end if;
  if btrim(p_external_key) = '' then
    raise exception 'custom.external_stub_upsert: external_key may not be blank'
      using errcode = '22023';
  end if;
  select * into v_src from custom.external_source
   where id = p_source_id and organization_id = p_organization_id and deleted_at is null;
  if not found then
    raise exception 'custom.external_stub_upsert: no external source % in organization %', p_source_id, p_organization_id
      using errcode = '02000';
  end if;

  select l.record_id into v_rec_id from custom.external_link l
   where l.organization_id = p_organization_id
     and l.source_id = p_source_id
     and l.external_key = p_external_key
     and l.deleted_at is null;

  if v_rec_id is null then
    -- THE NATIVE DOOR. The stub is an ordinary Record: no new data_class, no second path.
    v_rec_id := custom.record_write(p_organization_id, p_table_id, '{}'::jsonb);
    insert into custom.external_link
      (organization_id, record_id, source_id, external_key, target_ref, link_url, cached_title, fetched_at)
    values
      (p_organization_id, v_rec_id, p_source_id, p_external_key,
       custom.relation_target_external(v_src.connection_token, v_src.external_table, p_external_key),
       coalesce(p_link_url, replace(v_src.link_template, '{key}', p_external_key)),
       p_cached_title, now())
    returning id into v_link;
  else
    update custom.external_link l
       set link_url     = coalesce(p_link_url, replace(v_src.link_template, '{key}', p_external_key), l.link_url),
           cached_title = p_cached_title,
           fetched_at   = now()
     where l.organization_id = p_organization_id
       and l.source_id = p_source_id
       and l.external_key = p_external_key
    returning l.id into v_link;
  end if;
  return v_rec_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION custom.external_write_through(p_organization_id uuid, p_record_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_src custom.external_source%rowtype;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.external_write_through');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.external_write_through: organization_id and record_id are required'
      using errcode = '22004';
  end if;
  select s.* into v_src
    from custom.external_link l
    join custom.external_source s
      on s.organization_id = l.organization_id and s.id = l.source_id
   where l.organization_id = p_organization_id and l.record_id = p_record_id
     and l.deleted_at is null and s.deleted_at is null;
  if not found then
    raise exception 'custom.external_write_through: record % in organization % is not an external stub', p_record_id, p_organization_id
      using errcode = '22023',
            hint = 'A stub Record has a row in custom.external_link. A native record is written through its own door.';
  end if;
  if not v_src.writes_enabled then
    raise exception 'custom.external_write_through: writing to % is not permitted for this organization', v_src.external_table
      using errcode = '42501',
            hint = format('The external tier is READ-ONLY until an organization opts in, per table: select custom.external_writes_set(%L, %L, true). It defaults to off (REC-N-11) and is turned on only after the read path is proven for that table.',
                          p_organization_id, v_src.id);
  end if;
  raise exception 'custom.external_write_through: the opt-in for % is ON and there is still no write connection to write through', v_src.external_table
    using errcode = '0A000',
          hint = 'Provisioning, credential custody and billing for an external connection are DEFERRED (D-14); the trigger is the first customer who asks, with the spend approved by Arman. The opt-in is honoured: this is no longer a privilege refusal.';
end;
$function$
;


CREATE OR REPLACE FUNCTION custom.external_writes_set(p_organization_id uuid, p_source_id uuid, p_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_now boolean;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.external_writes_set');

  if p_organization_id is null or p_source_id is null or p_enabled is null then
    raise exception 'custom.external_writes_set: organization_id, source_id and enabled are all required'
      using errcode = '22004';
  end if;
  update custom.external_source
     set writes_enabled = p_enabled
   where organization_id = p_organization_id
     and id = p_source_id
     and deleted_at is null
  returning writes_enabled into v_now;
  if not found then
    raise exception 'custom.external_writes_set: no external source % in organization %', p_source_id, p_organization_id
      using errcode = '02000';
  end if;
  return v_now;
end;
$function$
;


CREATE OR REPLACE FUNCTION custom.record_write(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write');

  if p_organization_id is null then
    raise exception 'custom.record_write: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, p_table_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$function$
;
