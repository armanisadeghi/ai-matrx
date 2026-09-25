-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- lane: S6
-- based-on: custom.assert_store_door(uuid, text) aea7c2dc21d33f09d6d97d000fb52d9ea1016d8bcbbda5a664d4a22980eeea9c
--
-- LANE S6 inverse — `custom.assert_store_door` back to the body live on the main database on
-- 2026-09-25 (sha256 14c40e3a…, captured read-only with pg_get_functiondef before the up ran).
-- Rule 27.

CREATE OR REPLACE FUNCTION custom.assert_store_door(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:d:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  -- WRITE-PERF-4: out of its own slot (0.6 us) rather than out of the shared blob (8.25 us on
  -- a realistic blob). The stamp is a superset of the seat the blob checked, so this yes is
  -- reused in strictly fewer situations than before, never more.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  if custom.store_is_open(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- ── STORE-ON 2026-09-23: "TURNED OFF", NEVER "NOT TURNED ON YET". ──────────────────────
  -- Owner ruling the same day: the record store's default is ON, and every active
  -- organization was switched on. "has not turned it on yet" described a world where being
  -- off was the starting state nobody had left; it is now a decision somebody in this
  -- organization made, and the sentence says so. The door is exactly as closed as it was.
  raise exception 'This organization has turned the record store off, so % is not taking writes.',
    coalesce(nullif(btrim(p_door), ''), 'it')
    using errcode = '42501',
          hint = 'The record store is on for every organization by default. Somebody with an owner''s or an administrator''s seat here switched it off: open Database Settings for this organization and turn it back on, and everything already made is kept and starts working again. While it is off, this store takes writes only from the role that owns custom.record, through every door: it is a closed door, not a quiet one.';
end;
$function$

;
