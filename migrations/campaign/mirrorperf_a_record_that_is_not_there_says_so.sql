-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.record_table(uuid, uuid) 333f1eaaca55e9491507046c6ce32c3b4a727de559014bb7dc99ec119566e34f
--
-- MIRROR-PERF — `select ... into` SETS ITS TARGETS TO NULL WHEN THERE IS NO ROW, SO THE DOOR'S
-- "THERE IS NO SUCH RECORD" ARM NEVER FIRED.
--
-- FOUND BY THE SEAT SUITE, not reasoned about: `scripts/campaign-tests/mirrorperf_green.sql`
-- clause 1c asked `custom.record_table` about an id that is in no organization at all and got
-- 42501 instead of the 02000 the door's own comment promises.
--
-- THE CAUSE, AND IT WAS THERE BEFORE THIS LANE TOUCHED THE DOOR. Both the body APPROVAL-TAIL
-- landed and the body this lane landed an hour ago wrote:
--
--     v_found boolean := false;
--     select r.table_id, true into v_table, v_found from custom.record r where …;
--     if not v_found then raise … '02000' … end if;
--
-- When the SELECT finds nothing, plpgsql sets EVERY into-target to NULL — including `v_found`,
-- whose `false` initialiser is overwritten. `if not null` is null, which is not true, so the
-- arm is skipped. APPROVAL-TAIL's door therefore RETURNED NULL for an id that does not exist
-- (a door answering a question about nothing), and this lane's door, which asks the ladder
-- after that arm, refused it at 42501 — telling a caller they may not read a record that is
-- not there.
--
-- THE FIX IS THE ONE plpgsql PROVIDES. `found` is set by the SELECT itself and is never a
-- target, so no row means `found` is false and the arm fires. The class: any door in this store
-- that decides "is it there" from an into-target is reading a value the statement may have
-- overwritten. This is the only `, true into` pair in schema custom — checked on the live
-- catalogue with `pg_get_functiondef(p.oid) ~ ', true into'`, which names this function and
-- nothing else.
--
-- THE ORDER STAYS THE STORE'S ORDER: the switch, the organization wall, "is it there", then
-- the row. An id in another organization and an invented id get the SAME 02000 — organizations
-- are hard walls (REC-29), and a door that answered them differently would let a caller map
-- another organization's ids by reading which refusal came back.

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
begin
  -- THE SWITCH, THEN THE WALL, THEN THE ROW — the store's one order. The wall first, so
  -- somebody in the wrong organization is told that, and not that they may not read a record.
  perform custom.assert_store_door(p_organization_id, 'custom.record_table');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_table');

  -- DELETED ROWS COUNT. A record in the trash still lives in a table, and the question
  -- "should this be put back" is asked about that table.
  --
  -- `found` AND NOT AN INTO-TARGET: a SELECT that finds nothing sets every into-target to NULL,
  -- so a `v_found boolean := false` that the SELECT also targets is NULL here, and `if not null`
  -- never fires. `found` is set by the statement and cannot be overwritten by it.
  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  if not found then
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
