-- chair-step: this DROPs the three functions sc1p_a_table_says_where_it_lives_and_its_owner_can_move_it.sql added — custom.table_move(uuid, uuid, integer), custom.table_home(uuid, uuid), custom._table_move_plan(uuid, uuid, uuid) — and deletes their two platform.client_callable_door rows. Nothing else existed before it and nothing else is touched. A Table already moved stays where it was moved (moving it back is custom.table_move the other way, while the doors exist); the object pages then show the organization from custom.where_id_opens alone, with no move control.
-- lane: SC-1
--
-- custom._store_door() goes back to the body it had before (below, byte for byte what
-- pg_get_functiondef answered on 2026-09-24): the one arm that let custom.table_move re-key a
-- row across partitions is taken out, and nothing else changes.

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('table_home', 'table_move');

drop function if exists custom.table_move(uuid, uuid, integer);
drop function if exists custom.table_home(uuid, uuid);
drop function if exists custom._table_move_plan(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION custom._store_door()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     record := coalesce(new, old);  -- `new` is unassigned on DELETE; reading it raises
  v_door    text;
  v_owner   oid;
  v_root    oid;
  v_retired timestamptz;
  v_days    integer;
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
  v_root := coalesce(pg_partition_root(tg_relid), tg_relid);
  select format('%I.%I', n.nspname, c.relname), c.relowner into v_door, v_owner
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.oid = v_root;

  -- One line, because there is one predicate. The door's own name is what the refusal
  -- carries, so a caller is told WHICH door said no rather than that "something" did.
  perform custom.assert_store_door(v_row.organization_id, v_door);

  if tg_op <> 'DELETE' then
    return new;
  end if;

  -- THE OPERATOR LANE, unchanged: read from the catalogue, never as a role literal (rule 15).
  if pg_has_role(custom.caller_role(), v_owner, 'member') then
    return old;
  end if;

  -- REC-23, ASKED AS THE RULE IT IS. "A delete is soft within retention and reversible within
  -- it" — so what ends the protection is the WINDOW running out, not who is asking. A row
  -- retired for longer than its Table says has been reversible for its whole life and is now
  -- the retention job's to destroy; `custom.migrate_purge` is that job and is how a client
  -- reaches this line at all, after the organization wall, ADMIN on the Table and the switch.
  v_retired := (to_jsonb(v_row) ->> 'deleted_at')::timestamptz;
  if v_retired is not null and v_row.organization_id is not null then
    begin
      v_days := case when v_root = 'custom.record'::regclass
                     then history.retention_days(v_row.organization_id,
                                                 (to_jsonb(v_row) ->> 'table_id')::uuid)
                     else history.retention_floor_days(v_row.organization_id) end;
    exception when others then
      -- An unreadable retention is never a shorter one. The platform floor stands.
      v_days := 30;
    end;
    if v_retired < now() - make_interval(days => greatest(coalesce(v_days, 30), 30)) then
      return old;
    end if;
  end if;

  raise exception 'Records are not deleted for good here, so % did not take that deletion.', v_door
    using errcode = '42501',
          hint = 'REC-23: a delete is soft and reversible while the table keeps its history - thirty days at the very least, and each table says how long. Use custom.record_delete(organization, record), which marks it deleted and can be undone with custom.record_restore(organization, record); nothing is lost in between. Once that window has run out, custom.migrate_purge(organization, table) is what destroys it, and nothing else does - removing a row for good is the retention job''s, never a caller''s, switched on or off.';
end;
$function$;
