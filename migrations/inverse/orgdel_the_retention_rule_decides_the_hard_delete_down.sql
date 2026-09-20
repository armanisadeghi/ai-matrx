-- INVERSE of migrations/campaign/orgdel_the_retention_rule_decides_the_hard_delete.sql (lane ORG-DELETE).
-- It puts the ROLE-ONLY predicate back: custom.migrate_purge holds a client grant and is
-- refused by this trigger on every row, so nothing a person can call destroys a record and
-- no organization holding records can ever be deleted. That is the state bug
-- 8500bd65-7a5c-4c22-8213-2e10d462d348 was filed in.
CREATE OR REPLACE FUNCTION custom._store_door()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$

;
