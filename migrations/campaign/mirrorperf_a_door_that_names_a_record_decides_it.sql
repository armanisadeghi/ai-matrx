-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.record_table(uuid, uuid) 78ee95ed48af2b962c017719ea6d9dd846e2275b9c6a04f75fb20d76f246cf48
-- based-on: custom.has_visibility(uuid, text, uuid, permission_level) a62d4e0e3499c9c104702b7cabaa0ce6e311173c32e6672f9affe53643acbf00
-- based-on: custom.assert_client_may_reach(uuid, text) 655fc7bd3280fc215b77df4890ee114e15bc10232b47c17007638c90564c1b83
-- based-on: custom.assert_client_may_open(uuid, uuid, text, permission_level, text) c8bb8e0e7334c7b9bf34a295f5d26a55eab036c56ccaa59e599e4ca6f6877a4f
--
-- MIRROR-PERF — APPROVAL-TAIL'S NEW DOOR GOES THROUGH THE ONE LADDER IN ITS OWN BODY.
--
-- THE DEFECT. `pnpm check:store-doors-decide` census 1 — "client doors taking an organization
-- id that never decide the caller" — named exactly one row:
--
--     [FAIL] client doors taking an organization id that never decide the caller - 1:
--            custom.record_table(p_organization_id uuid, p_record_id uuid)
--
-- The census reads the DOOR'S OWN BODY and requires one of the six deciders in it
-- (`assert_client_may_reach`, `assert_client_may_change`, `has_access_for`, `has_visibility`,
-- `anon_token_verify`, `visible_record_ids`). `custom.record_table` asked
-- `custom.assert_client_may_open`, which does reach `custom.has_visibility` one call further
-- down — so the door was not open, but the census could not see that it was shut, and a census
-- that has to trust a helper it never read is not a census. The door is now written the way
-- every other door in the store is written, and census 1 reads it directly.
--
-- THE RUNG IS THE SAME RUNG. Answering "which Table is this record in" is a READ of that
-- record, so it is `viewer` on the record — the same threshold
-- `custom.assert_client_may_open(..., 'viewer', 'record')` was asking for. Nothing tightens and
-- nothing loosens: the store owner still passes, the anonymous doors (no principal) still pass,
-- a record that is not in this organization still gets the same 02000 an invented id gets, and
-- a person who may not open the record gets the store's plain refusal at 42501 in the same
-- words the rest of the store uses.
--
-- DELETED ROWS STILL COUNT, and that is why the row lookup is not `custom.read_record`: a
-- record in the trash still lives in a Table, and "should this be put back" is asked about that
-- Table.

create or replace function custom.record_table(p_organization_id uuid, p_record_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me     uuid;
  v_table  uuid;
  v_found  boolean := false;
begin
  -- THE SWITCH, THEN THE WALL, THEN THE ROW — the store's one order. The wall first, so
  -- somebody in the wrong organization is told that, and not that they may not read a record.
  perform custom.assert_store_door(p_organization_id, 'custom.record_table');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_table');

  -- DELETED ROWS COUNT. A record in the trash still lives in a table, and the question
  -- "should this be put back" is asked about that table.
  select r.table_id, true into v_table, v_found
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  if not v_found then
    raise exception 'There is no record % in this organization, here or in the trash.', p_record_id
      using errcode = '02000',
            hint = 'The id belongs to another organization or to nothing at all — organizations are hard walls (REC-29).';
  end if;

  -- THE ONE LADDER, AT VIEWER ON THE RECORD, IN THIS DOOR'S OWN BODY (MIRROR-PERF, 2026-09-20).
  -- Naming the Table a record lives in is reading that record, so it is the reading rung. The
  -- two ways through are the store's standing two: the role that owns the store (every campaign
  -- and server lane), and no signed-in person at all (the anonymous doors, which have already
  -- decided the request against the form's own token).
  if not custom.query_is_store_owner() then
    v_me := custom.query_principal();
    if v_me is not null
       and not custom.has_visibility(v_me, 'record', p_record_id, 'viewer'::public.permission_level)
    then
      raise exception 'You do not have access to this record, so custom.record_table has nothing to show you.'
        using errcode = '42501',
              hint = 'DOOR-1 decides reading and writing with the SAME question: a record you may not open is a record you may not change. This needs the viewer level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization.';
    end if;
  end if;

  return v_table;
end;
$fn$;

comment on function custom.record_table(uuid, uuid) is
  'MIRROR-PERF (2026-09-20): which Table a record lives in, live or in the trash. Decides the '
  'organization with custom.assert_client_may_reach and the row with custom.has_visibility at '
  'viewer, in its own body, so census 1 of check:store-doors-decide reads the decision rather '
  'than trusting a helper.';
