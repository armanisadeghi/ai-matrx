-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom._store_door() 7d1c5574f2d8fd556c5e14da5a2cf5a8911991e58826e002f5d25942eb842efc
--
-- V1-STORE-FIXES, FINDING 2 — DELETE HAS A DOOR NOW, AND THE STANDING FACT IS TRUE AGAIN.
--
-- WHAT `V1-STORE` MEASURED (00:20 UTC, 2026-09-18)
-- -----------------------------------------------
-- "Every BEFORE trigger on `custom.record` is `INSERT OR UPDATE` only (`_gc_assoc_harddelete`
-- is AFTER DELETE), and `custom._store_door` is attached to `external_link`/`external_source`
-- but not to `record`, so `assert_store_door` is never consulted on a delete — the standing
-- fact 'one door predicate guards every write path' is not literally true."
--
-- REPRODUCED BEFORE A BYTE WAS WRITTEN (`scripts/campaign-tests/v1store_fixes_red.sql`
-- block 2): with `custom/system_enabled` resolving false, a disposable role that is no member
-- of the store's owner was refused an INSERT by the door, by name — and its hard DELETE
-- removed the row from the store, one row, gone. The probe role carries BYPASSRLS on purpose:
-- RLS is a row-VISIBILITY filter and the door is the write barrier, so a role RLS happens to
-- hide a row from proves nothing about the door. `V1-STORE` said the same thing in its own
-- words: "Today's practical exposure is nil because `custom` is revoked and RLS filters the
-- row, which is exactly how it stayed invisible."
--
-- WHAT THE CONTRACT SAYS, AND THEREFORE WHAT A HARD DELETE IS
-- -----------------------------------------------------------
-- REC-23: "Delete is soft within `retention` and reversible within it." Its proof cell names
-- Salesforce's 15-day recycle bin, Notion's 30 days and Airtable's 30–180 — and names
-- Salesforce's silent purge at the cap as the failure the row forbids. REC-1 makes
-- `retention_days` a declared property of every Table with a thirty-day floor
-- (`custom._table_shape_guard`). So a client's delete is a SOFT delete, always; a HARD DELETE
-- is the retention purge, which is machinery (`W3-MIG` owns REC-23's purge half) and runs as
-- the role that owns the store. A hard DELETE is therefore NEVER a client act, switched on or
-- off, and this file says so at the door rather than leaving it to a convention.
--
-- THE FIX, AS THE CLASS
-- ---------------------
--   · `custom._store_door()` now judges `old` on a DELETE (reading `new` there raises instead
--     of refusing) and covers every operation. It asks the ONE predicate,
--     `custom.assert_store_door`, exactly as it always did — the switch is read in one place
--     in this schema and this file does not add a second.
--   · It is attached BEFORE DELETE to ALL THREE base tables in `custom`, so "the door covers
--     DELETE on every `custom` table" is a catalogue fact a verifier can read rather than a
--     sentence. `custom.record`'s existing nineteen BEFORE INSERT/UPDATE triggers already
--     call `assert_store_door`, so the delete trigger is what was missing and all this file
--     adds there.
--   · NOTHING FAILS SILENTLY, so the refusal ships its remedy AND the remedy is real:
--     `custom.record_delete` and `custom.record_restore` are the soft-delete door and its
--     undo, both through the same one predicate. Before this file the store had no delete
--     door at all — `custom.record_update` patches `data` and cannot reach `deleted_at` — so
--     a refusal pointing at "the soft delete route" would have pointed at nothing.
--
-- WHAT THIS FILE DOES NOT DO: it does not purge, and it does not read `retention_days`.
-- REC-23's purge half is `W3-MIG`'s row, and a purge written here would be a second owner for
-- one law. What lands here is the door and the reversible soft delete it names.
--
-- IDEMPOTENCE (rule 27): `CREATE OR REPLACE FUNCTION` applies twice with the same result, and
-- the three `CREATE TRIGGER`s are refused by the database itself (42710) on a second
-- consecutive apply having changed nothing — this campaign's established shape (§6b.2's
-- allow-list admits `CREATE TRIGGER` and refuses `CREATE OR REPLACE TRIGGER`, `DROP TRIGGER`
-- and every `DO` block). Rule 27's loop is up -> inverse -> `--reapply`. THE INVERSE:
-- `migrations/inverse/w1_v1store_the_soft_delete_door_down.sql`.

create or replace function custom._store_door()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_row   record := coalesce(new, old);  -- `new` is unassigned on DELETE; reading it raises
  v_door  text;
  v_owner oid;
begin
  -- THE DOOR IS NAMED AFTER THE TABLE A PERSON KNOWS, NOT AFTER A PARTITION. `custom.record`
  -- is hash partitioned into sixteen children and a write on the parent is ROUTED, so it is
  -- the PARTITION's copy of this trigger that fires and `tg_table_name` is `record_p03`.
  -- Measured on the branch before this line existed: a refused delete read `... so
  -- custom.record_p03 is not taking writes from "zz_dd"`, which names something the caller
  -- never wrote and cannot look up. A screen - or an error - never lies. `pg_partition_root`
  -- answers NULL for a table that is neither a partition nor partitioned, so the coalesce
  -- covers `external_link` and `external_source` and every partitioned table a later lane
  -- adds to this schema.
  select format('%I.%I', n.nspname, c.relname), c.relowner into v_door, v_owner
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.oid = coalesce(pg_partition_root(tg_relid), tg_relid);

  -- One line, because there is one predicate. The door's own name is what the refusal
  -- carries, so a caller is told WHICH door said no rather than that "something" did.
  perform custom.assert_store_door(v_row.organization_id, v_door);

  if tg_op <> 'DELETE' then
    return new;
  end if;

  -- REC-23. The owner of the store is the retention purge (W3-MIG) and this campaign's own
  -- machinery; it was read from the catalogue above, never as a role literal (rule 15).
  if pg_has_role(custom.caller_role(), v_owner, 'member') then
    return old;
  end if;

  raise exception 'Records are not deleted for good here, so % did not take that deletion.', v_door
    using errcode = '42501',
          hint = 'REC-23: a delete is soft and reversible while the table keeps its history - thirty days at the very least, and each table says how long. Use custom.record_delete(organization, record), which marks it deleted and can be undone with custom.record_restore(organization, record); nothing is lost in between. The store''s own switch custom/system_enabled does not open this either: removing a row for good is the retention job''s, never a caller''s, switched on or off.';
end;
$$;

create trigger custom_record_store_door
  before delete on custom.record
  for each row execute function custom._store_door();

create trigger custom_external_link_store_door_delete
  before delete on custom.external_link
  for each row execute function custom._store_door();

create trigger custom_external_source_store_door_delete
  before delete on custom.external_source
  for each row execute function custom._store_door();

create or replace function custom.record_delete(p_organization_id uuid, p_record_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_at timestamptz;
begin
  -- THE DOOR, and it is the same ONE predicate every other door in this schema calls. This
  -- is SECURITY DEFINER, so `current_user` in here is already the definer;
  -- `custom.assert_store_door` judges `custom.caller_role()` instead.
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    -- Nothing fails silently, and the two ways to match no row are told apart rather than
    -- reported as one shrug.
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
$$;

create or replace function custom.record_restore(p_organization_id uuid, p_record_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_found boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_restore');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_restore: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id and id = p_record_id and deleted_at is not null
  returning true into v_found;

  if v_found is not true then
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
$$;

comment on function custom.record_delete(uuid, uuid) is
  'REC-23: the soft-delete door. Marks a record deleted and reversible; custom.record_restore is the undo. A hard DELETE on the store is refused at custom._store_door - removing a row for good is the retention job''s (W3-MIG), never a caller''s.';
comment on function custom.record_restore(uuid, uuid) is
  'REC-23: the undo of custom.record_delete, while the record is still within its table''s retention.';

-- THE ACCESS DECISION, IN DATA, IN THIS SAME TRANSACTION. A SECURITY DEFINER function runs as
-- the owner, so `platform._provision_shape_settled` refuses at COMMIT unless somebody has said
-- who may call it. Same lane as `custom.record_write`'s and `custom.record_update`'s rows, and
-- the same answer.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'record_delete',
   'p_organization_id uuid, p_record_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'V1-STORE-FIXES finding 2 / REC-23: the SOFT-delete door into custom.record, and the only delete a caller has - a hard DELETE is refused at custom._store_door for everyone but the role that owns the store. p_organization_id and p_record_id are the store''s composite key and are BOTH required: a null in either is refused 22004, and a record belonging to another organization is simply not found, never touched, because the UPDATE carries both. An already-deleted record and a record that is not here are told apart by name rather than both answering nothing. The store door (custom.assert_store_door) runs first, so while custom/system_enabled resolves false only the role that owns custom.record reaches any of it.',
   'migrations/campaign/w1_v1store_the_soft_delete_door.sql',
   'server_only: nothing client-side calls this. Schema custom is revoked from PUBLIC, anon, authenticated and service_role, is absent from pgrst.db_schemas, and the product switch custom/system_enabled resolves false; the campaign''s own server lanes reach it as postgres. The client grant is switch-checklist work with its own step, never a lane''s.',
   false, false),
  ('custom', 'record_restore',
   'p_organization_id uuid, p_record_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'V1-STORE-FIXES finding 2 / REC-23: the undo of custom.record_delete, which is what makes the soft delete REVERSIBLE rather than merely quiet. p_organization_id and p_record_id are the store''s composite key and are BOTH required: a null in either is refused 22004, and a record belonging to another organization is not found, never restored. A record that was never deleted and a record that is not here are told apart by name. The store door (custom.assert_store_door) runs first, so while custom/system_enabled resolves false only the role that owns custom.record reaches any of it.',
   'migrations/campaign/w1_v1store_the_soft_delete_door.sql',
   'server_only: nothing client-side calls this. Schema custom is revoked from PUBLIC, anon, authenticated and service_role, is absent from pgrst.db_schemas, and the product switch custom/system_enabled resolves false; the campaign''s own server lanes reach it as postgres. The client grant is switch-checklist work with its own step, never a lane''s.',
   false, false)
on conflict do nothing;
