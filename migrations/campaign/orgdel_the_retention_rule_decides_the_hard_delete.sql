-- chair-step: it REPLACES a live trigger function, custom._store_door, which every write and
--   every delete in schema `custom` goes through. Nothing is dropped or renamed, no argument
--   or return type moves, and the predicate only ever WIDENS: every row refused before this
--   file is refused after it, and the one row that is now allowed through is a row whose
--   retention window has already run out, which is the moment REC-23 stops protecting it. The
--   inverse is migrations/inverse/orgdel_the_retention_rule_decides_the_hard_delete_down.sql.
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom._store_door() 769a9d4287dbb212fe9864601b8539d98e9a58142128156936948534a44b485d
--
-- ORG-DELETE — THE RETENTION RULE DECIDES THE HARD DELETE, NOT THE ROLE.
--
-- THE ROOT CAUSE OF BUG 8500bd65-7a5c-4c22-8213-2e10d462d348, measured on the main database
-- 2026-09-20. An organization that holds store records cannot be deleted. The foreign key is
-- what a person SEES; this is why it can never be cleared.
--
-- `custom.migrate_purge` is the store's declared retention purge — REC-23's "and never after
-- that". It holds an EXECUTE grant for `authenticated`, it has a row in
-- `platform.client_callable_door`, and it asks four things before it touches a row: the
-- organization wall, ADMIN on the Table, the store switch, and the Table's own retention
-- window. And then it dies, every single time, on its own DELETE:
--
--   Records are not deleted for good here, so custom.record did not take that deletion.
--
-- Because `custom._store_door`, the trigger on `custom.record`, decided the hard delete by
-- ROLE: `pg_has_role(custom.caller_role(), <owner of custom.record>, 'member')`. And
-- `custom.caller_role()` deliberately looks PAST the SECURITY DEFINER boundary — that is its
-- whole job, and it is right for authorization — so the purge, running as the definer, is
-- still judged as the SEAT that called it. `authenticated` is not a member of the owner role,
-- so the purge was refused.
--
-- The consequence is the whole bug. NOTHING a person can call has ever destroyed a record in
-- this store. The retention floor was not a floor, it was forever: the store could only grow,
-- every organization that ever held one record was undeletable, and the only way out was a
-- direct connection as the table's owner — which is exactly the operator bypass beside the
-- product path that the platform's own law forbids. Same class as T9: a grant that cannot be
-- used is a lie told to a caller.
--
-- THE FIX IS THE RULE ITSELF. REC-23 does not say "only the owner role may destroy a record".
-- It says a delete is SOFT and REVERSIBLE WITHIN RETENTION. So that is what the trigger now
-- asks, for everybody:
--
--   · the operator lane (a member of the role that owns `custom.record`) passes as before —
--     one line, unchanged, read from the catalogue and never as a role literal;
--   · anybody else may destroy a row ONLY when it has already been retired for longer than
--     its Table's retention says, which is the moment REC-23 stops protecting it;
--   · everything else is refused with the same sentence and the same remedy it had before.
--
-- THIS OPENS NOTHING. `authenticated` holds no table privilege at all in schema `custom`
-- (check:store-doors-decide census 7 keeps that boundary), so the only way a client reaches a
-- DELETE here is through a door, and the only door that issues one is `custom.migrate_purge`,
-- which already asserted reach, ADMIN on the Table, the switch and the window before getting
-- here. A live record, and a retired record still inside its window, are refused exactly as
-- they were — now by the rule that names them rather than by a role that also happened to.
--
-- A row this schema keeps with no `deleted_at` at all (`external_link`, `external_source`)
-- has no retirement and therefore no expired window, so it is refused as before.
--
-- WHAT MAKES IT FAIL (rule 3): put the role-only predicate back, which is exactly what
-- migrations/inverse/orgdel_the_retention_rule_decides_the_hard_delete_down.sql does — and
-- `scripts/campaign-tests/orgdel_green.sql` PART 6 goes red naming the purge.

create or replace function custom._store_door()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
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
