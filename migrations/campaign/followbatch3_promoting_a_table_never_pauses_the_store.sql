-- chair-step: lane FOLLOW-BATCH-3 (2026-09-30), the class of matrx-frontend D357. PROMOTING A TABLE NEVER PAUSES THE STORE. custom.promote_table (and custom.migrate_promote, which calls it) — a door a person presses — ran custom.promote_field's route A for every indexable promoted Field: CREATE INDEX on the partitioned custom.record inside the person's transaction, a ShareLock on all sixteen partitions for the build, so every write in the store waited. The door now builds nothing: a UNIQUE promoted Field gets the store's own unique rule (custom._unique_rule_holds — advisory lock, EXISTS, 23505), so its values are kept apart at once, and the door answers `indexes_owed` = custom.promoted_index_ddl's non-blocking statements (ON ONLY parent, then CREATE INDEX CONCURRENTLY per partition and ATTACH), which run outside any transaction through aidream scripts/build_promoted_indexes.py. custom.promote_field itself is unchanged (not client-callable; its own route A stays for server callers inside a maintenance window). Measured before: 0 Tables on production are in fast storage and the door has no recorded call, so nothing live changes shape. No row is changed by this file.
-- lane: FOLLOW-BATCH-3
-- lock: custom
-- based-on: custom.promote_table(uuid, uuid) fbf0944768f87714395952364386131101232a8325ca17b1c08271b5910297f4
--
-- Inverse: migrations/inverse/followbatch3_promoting_a_table_never_pauses_the_store_down.sql.
--
-- THE USE CASE. Rincon Plumbing's operations lead moves its 9,000-row Service Calls table to fast storage at
-- 10 AM. The dispatchers closing jobs on their phones, and every other organization, keep saving.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.promote_table(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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

  -- 🚨 NO INDEX IS BUILT INSIDE THIS DOOR (lane FOLLOW-BATCH-3, the class of D357). custom.promote_field's
  -- route A ran CREATE INDEX on the partitioned custom.record here: a ShareLock on all sixteen partitions for
  -- the whole build, so every write in the store — every organization's — waited while one person promoted
  -- one Table. The door now (1) gives every UNIQUE promoted Field the store's own unique rule, which is what
  -- keeps its values apart from this moment (custom._unique_rule_holds: advisory lock, then EXISTS, then
  -- 23505), and (2) answers the non-blocking build as `indexes_owed`: custom.promoted_index_ddl's statements,
  -- one CONCURRENTLY per partition, which run outside any transaction — aidream
  -- `uv run python scripts/build_promoted_indexes.py --organization <id> --table <id>`. Until they run the
  -- Table reads as it always did, only without the faster index.
  for f in select * from custom.promoted_fields(p_organization_id, p_table_id) where indexable and is_unique loop
    update custom.record r
       set data = jsonb_set(r.data, '{rules}', coalesce(r.data -> 'rules', '[]'::jsonb) || '[{"kind": "unique"}]'::jsonb)
     where r.organization_id = p_organization_id and r.id = f.field_id and r.table_id = custom.field_kernel_id()
       and not (coalesce(r.data -> 'rules', '[]'::jsonb) @> '[{"kind": "unique"}]'::jsonb);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('step', d.step, 'purpose', d.purpose, 'statement', d.statement)
                            order by d.step), '[]'::jsonb)
    into v_built
    from custom.promoted_index_ddl(p_organization_id, p_table_id) d;

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
                            'rows_moved', v_after - v_before, 'indexes', '[]'::jsonb,
                            'indexes_owed', v_built,
                            'says', 'Moved to fast storage. Its indexes are built without stopping anybody''s writes, outside this save: run the statements in indexes_owed one at a time (aidream scripts/build_promoted_indexes.py does). A unique field keeps its values apart from now on.',
                            'table_rows_changed', v_moved);
end $function$;
