-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: history.retention_set(uuid,uuid,integer) f9a7bec7ab3bc4e8edfd62f78919ee094e0c71b51e210afa62eaecf9b7867ee4
--
-- W3-HIST, part eight — THE DEFECT THIS LANE'S OWN EXIT HIT, fixed at its class.
--
-- WHAT WENT WRONG, MEASURED (branch, 2026-09-18, running scripts/campaign-tests/w3_hist_c17.sql)
-- ---------------------------------------------------------------------------------------------
--   ERROR:  The custom data store is switched off, so retention was not changed.
--   HINT:   custom/system_enabled resolves false. Nothing was written.
--   CONTEXT: PL/pgSQL function history.retention_set(uuid,uuid,integer) line 17
--
-- `history.retention_set` calls `custom.assert_store_door` — the ONE door predicate — and
-- then asks the question a SECOND time, in its own words:
--
--   if not coalesce((platform.knob_resolve('custom','system_enabled', org) #>> '{}')::boolean, false)
--      and not custom.store_is_open(org) then raise ...
--
-- Both halves of that conjunction are the knob. The door is NOT the knob: `assert_store_door`
-- returns for the role that OWNS `custom.record` while the switch is off, which is exactly how
-- every other write in schema `custom` reaches the store tonight. So this second reading
-- refused the caller the first reading had just admitted, and HIS-2 — "a Table's retention is
-- set through the one write path" — was unreachable on either database while the campaign is
-- switched off, which is every moment before the switch checklist runs.
--
-- The comment above it said "Unreachable in practice". It was reached by the lane's own exit
-- proof the first time that proof was run, which is the whole argument for running one.
--
-- THE CLASS, AND ITS CENSUS
-- -------------------------
-- The class is: a body that re-decides the door instead of reading it. Measured across schema
-- `history` and schema `custom` on the branch: `history.retention_set` is the ONLY body that
-- calls `custom.assert_store_door` and then raises its own 42501 from a second, narrower read.
-- `history.capture_is_open` also reads the knob and then the door — but it reads them as a
-- DISJUNCTION (`if v_knob then return true` … then the door), so the owner arm survives, which
-- is why the capture trigger worked and this did not. `history.prune` reads
-- `history.capture_is_open`, so it inherits the correct shape. Nothing else in either schema
-- has the pattern.
--
-- THE FIX, AND WHY IT IS STILL A GUARD
-- ------------------------------------
-- The body keeps naming its guard — §6b.2 wants a body that READS its switch, not one that
-- mentions it — but it now names it with the same two arms the door has: the knob, and the
-- role that owns the table the knob guards, read from the catalogue rather than as a literal
-- (rule 15). Delete the `custom.assert_store_door` call above it and this still refuses an
-- outside role; weaken either arm and `scripts/campaign-tests/w3_hist_red.sql` RED 5 writes a
-- retention as a role that owns nothing.
--
-- BASED ON, VERIFIED: the replacement below was taken from the live body of
-- `history.retention_set` on the branch (`pg_get_functiondef`, 2026-09-18) with only the
-- conjunction at its top changed. Every other line — the floor read, the two refusals, the
-- `custom.record_update` write — is byte-identical to what
-- `w3_hist_the_floor_is_read_not_written_twice.sql` last applied.

create or replace function history.retention_set(p_organization_id uuid, p_table_id uuid, p_days integer)
returns integer
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_floor integer;
  v_kind  text;
  v_owner oid;
begin
  -- THE DOOR, ONCE. It reads custom/system_enabled through custom.store_is_open and admits
  -- the role that owns custom.record while the switch is off.
  perform custom.assert_store_door(p_organization_id, 'history.retention_set');

  -- THE GUARD, NAMED IN THE BODY — with the door's OWN two arms, not a narrower copy of one
  -- of them. `custom.store_is_open` is the knob read (custom/system_enabled); the owner is
  -- read from the catalogue so this can never drift from the table it guards.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if not custom.store_is_open(p_organization_id)
     and not pg_has_role(custom.caller_role(), v_owner, 'member') then
    raise exception 'The custom data store is switched off, so retention was not changed.'
      using errcode = '42501',
            hint = 'custom/system_enabled resolves false and this caller does not own custom.record. Nothing was written. The switch checklist turns the knob on; a caller never does.';
  end if;

  if p_organization_id is null or p_table_id is null then
    raise exception 'history.retention_set: the organization and the table are both required — the store is keyed (organization_id, id).'
      using errcode = '22004';
  end if;

  select r.data_class into v_kind
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id;
  if v_kind is null then
    raise exception 'There is no table % in this organization.', p_table_id
      using errcode = '02000', hint = 'Nothing was changed.';
  end if;
  if v_kind <> 'table' then
    raise exception 'Retention is set on a table, and % is a %.', p_table_id, v_kind
      using errcode = '22023',
            hint = 'HIS-2: retention is a property of a Table (REC-1), so every record of that table is kept for the same time. A single record does not keep its own history rule.';
  end if;

  -- HIS-1 / HIS-2: HOW LONG, never WHETHER.
  if p_days is null or p_days <= 0 then
    raise exception 'History cannot be switched off for a table — % is not a length of time to keep it for.', coalesce(p_days::text, 'nothing')
      using errcode = '23514',
            hint = 'HIS-1 and HIS-2: everything that happens is recorded, always; what a table chooses is how LONG the record is kept, and the shortest that can be is this organization''s retention floor. Ask for the floor (history.retention_floor_days) and set that if you want the minimum.';
  end if;

  v_floor := history.retention_floor_days(p_organization_id);
  if p_days < v_floor then
    raise exception 'This table would keep its history for % days, and nothing here is kept for less than %.', p_days, v_floor
      using errcode = '23514',
            hint = format('HIS-2 / HIS-3: %s days is this organization''s retention floor. Set this table to %s or more. The floor itself only ever goes up (history.retention_floor_raise), so there is no way round this by lowering it first.', v_floor, v_floor);
  end if;

  perform custom.record_update(p_organization_id, p_table_id,
                               jsonb_build_object('retention_days', p_days));
  return p_days;
end;
$fn$;

comment on function history.retention_set(uuid, uuid, integer) is
  'HIS-2: set one Table''s retention_days, through custom.record_update — the one write path. Zero, a negative and anything below the organization''s floor are each refused by name with the remedy; there is no value that means "stop recording". The store''s switch is read ONCE, with the door''s own two arms — the knob and the owner of custom.record — so a caller the door admits is never refused by a second, narrower reading of the same question.';
