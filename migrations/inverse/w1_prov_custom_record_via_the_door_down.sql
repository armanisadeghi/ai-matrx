-- chair-step: dropping schema custom, the crm.party retrofit column and the store's registry, door and stamped-write rows is the store lane's teardown, never an additive change, and it reaches production only at a terminal with the campaign stopped
--
-- THE INVERSE of `migrations/campaign/w1_prov_custom_record_via_the_door.sql` (§4.13,
-- rule 27).
--
-- IT UNDOES WHAT `platform.provision` WROTE, NOT ONLY THE DDL. The provisioner is one
-- transaction that lands a table, its partitions, its registry row, its relationship rows,
-- its door row, its stamped-write row and its capture row. Dropping the schema removes the
-- first two and nothing else, so an inverse that stopped there would leave the registry
-- naming a table that no longer exists — the shape `provision_shape_guard` exists to refuse,
-- and a standing exemption for a relation name anybody could then re-create by hand.
--
-- 🚨 IT REFUSES WHILE ANOTHER LANE'S OBJECTS ARE IN THE SCHEMA. `LOCK:custom` is handed down
-- a fourteen-hold chain and eleven later lanes build in schema `custom`. So this file raises
-- and names what it found unless `custom` holds exactly what this file created:
-- `custom.record`, its sixteen partitions and `custom.record_write`.
--
-- §6.10 is why the DROP is safe when it IS this file's alone: nothing outside the campaign
-- ever wrote a row into schema `custom`.

set lock_timeout = '2s';
set statement_timeout = '300s';

do $$
declare
  v_strays text;
  v_rows   bigint;
begin
  if to_regnamespace('custom') is null then
    raise notice 'schema custom is already absent — nothing to undo.';
  else
    select string_agg(format('%s.%s', n.nspname, c.relname), ', ' order by c.relname)
      into v_strays
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'custom'
       and c.relkind in ('r','p','v','m','f')
       and c.relname <> 'record'
       and c.relname !~ '^record_p[0-9]{2}$';
    if v_strays is not null then
      raise exception
        'REFUSING to drop schema custom: it holds relation(s) this file did not create — %. '
        'LOCK:custom is handed down a fourteen-hold chain and those objects belong to a later '
        'lane. Undo that lane first, or drop its objects by name.', v_strays;
    end if;

    if to_regclass('custom.record') is not null then
      execute 'select count(*) from custom.record' into v_rows;
      if v_rows > 0 then
        raise notice 'custom.record holds % row(s); they go with the schema.', v_rows;
      end if;
    end if;

    drop schema custom cascade;
    raise notice 'W1-PROV inverse: schema custom dropped.';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'crm' and table_name = 'party' and column_name = 'custom_fields'
  ) then
    alter table crm.party drop column custom_fields;
    raise notice 'W1-PROV inverse: crm.party.custom_fields dropped.';
  else
    raise notice 'crm.party.custom_fields is already absent — nothing to undo.';
  end if;
end
$$;

-- what platform.provision wrote beside the DDL
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'record_write'
   and declared_by = 'platform.provision(record)';
delete from platform.stamped_write_table
 where schema_name = 'custom' and table_name = 'record'
   and declared_by = 'platform.provision(record)';
delete from platform.entity_relationships where child_type = 'record' or parent_type = 'record';
delete from platform.entity_types where token = 'record' and schema_name = 'custom';
-- 🚨 platform.provision_spec IS APPEND-ONLY and a DELETE is refused by
-- `platform._provision_spec_is_append_only()` with "the applied declaration IS the record".
-- So the teardown is RECORDED rather than erased: one `deprovision` row, carrying the same
-- declaration, becomes the token's current row. The up-migration can still rebuild, because
-- `platform.provision` now reads only a declaration whose relation still exists.
insert into platform.provision_spec (
  token, spec, spec_hash, type, origin, owner_org_id, verb, result,
  applied_by, applied_via, artifacts_status, applied_lane, applied_actor, applied_role)
select s.token, s.spec, s.spec_hash, s.type, s.origin, s.owner_org_id, 'deprovision',
       jsonb_build_object('created', '[]'::jsonb, 'certify', '[]'::jsonb,
                          'note', 'migrations/inverse/w1_prov_custom_record_via_the_door_down.sql dropped schema custom, the registry row, the door row and the stamped-write row.'),
       session_user, 'runner', 'complete', 'full', null, session_user
  from platform.v_provision_spec_current s
 where s.token = 'record' and s.verb <> 'deprovision';
-- and the exemption the guard must NOT be left holding for a name nobody now owns
delete from platform.provision_spec_grandfather
 where lane = 'unprovisioned_relation' and object_ref = 'custom.record';
