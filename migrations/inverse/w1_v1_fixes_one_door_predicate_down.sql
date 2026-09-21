-- target: branch
-- based-on: custom.external_history_event(uuid,uuid,text) 6d7dd33bc220f3a1b8206601c773c5a3f58c16352c786649857a692fdd7b89f8
-- based-on: custom.external_source_declare(uuid,text,text,text,text,text) 4144c60b032e9d1af075fa474f920cdaf6bf27c49e74a866c26b59867163187e
-- based-on: custom.external_stub_upsert(uuid,uuid,uuid,text,text,text) 142397b915ff331b6bd70cebdc4393538638c44c33801e4f427378887a660914
-- based-on: custom.external_write_through(uuid,uuid,jsonb) 8e5389fa38eb4e23cdbc7289c3f261e0ed85568fea3306de8823d60e2e935ad0
-- based-on: custom.external_writes_set(uuid,uuid,boolean) 81b2930d5a2999910f60f17a45224569d88bbb8575fb9039093357f85998a4f4
-- based-on: custom.record_write(uuid,uuid,jsonb) 3aff21704174e63f90b9bbd480b3d49588bc56f1d01e33348e8beb299105f3f7
--
-- THE INVERSE of `migrations/campaign/w1_v1_fixes_one_door_predicate.sql` (§4.13, rule 27).
-- It restores the prior state exactly: the two door triggers and the three new functions
-- do not exist, and the six SECURITY DEFINER bodies are back to the definitions the
-- up-file's own `-- based-on:` hashes name - so
-- `encode(sha256(convert_to(pg_get_functiondef(oid),'utf8')),'hex')` reads those same six
-- hashes again. That is what makes "the inverse restores the prior state" a measurement
-- rather than a claim.
--
-- Branch-only, because it DROPs: rule 9 keeps a DROP off production in every lane, and
-- nothing this file reverses has been applied there.

set lock_timeout = '5s';
set statement_timeout = '300s';

-- 🚨 EVERY TRIGGER OVER THE BODIES THIS FILE DROPS COMES OFF FIRST (lane RED-SUITES-3,
-- 2026-09-21). When this inverse was written, `custom._store_door` carried exactly the two
-- triggers named below. It carries NINETEEN now — the two `_delete` twins added since, and
-- `custom_record_store_door` on `custom.record` and each of its sixteen partitions — and this
-- file drops `custom._store_door()` and `custom.assert_store_door(uuid,text)` two hundred and
-- fifty lines down. As written it would have left every write to the record store calling a
-- function that no longer exists, which is not the prior state this file claims to restore;
-- it is a broken table. `storerel_red` lost a whole session to the same class.
-- Dropping the parent's trigger takes the partitions' with it.
drop trigger if exists custom_external_link_store_door          on custom.external_link;
drop trigger if exists custom_external_link_store_door_delete   on custom.external_link;
drop trigger if exists custom_external_source_store_door        on custom.external_source;
drop trigger if exists custom_external_source_store_door_delete on custom.external_source;
drop trigger if exists custom_record_store_door                 on custom.record;

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


drop function if exists custom._store_door();
drop function if exists custom.assert_store_door(uuid, text);
drop function if exists custom.caller_role();
