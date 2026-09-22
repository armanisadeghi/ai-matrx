-- based-on: custom.assert_store_door(uuid, text) 14c40e3aaf11738680fbc20b9744bf67bf1ec59c8a6297562e41e36a0b4e8c4f
-- THE INVERSE of migrations/campaign/storeon_the_refusal_says_turned_off.sql.
--
-- It puts `custom.assert_store_door`'s refusal sentence and hint back to LIMITS-FIX's words
-- ("This organization has not turned the record store on yet…"), which are correct only in a
-- world where the record store's platform default is OFF. Run it only together with
-- migrations/inverse/storeon_the_record_store_is_on_by_default_down.sql, which is what puts
-- that world back.
--
-- Header-less, like the file it inverts.

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

  raise exception 'This organization has not turned the record store on yet, so % is not taking writes.',
    coalesce(nullif(btrim(p_door), ''), 'it')
    using errcode = '42501',
          hint = 'Open Database Settings for this organization and turn the record store on (the custom/system_enabled switch); everything you have already made is kept and starts working. Organizations created from 2026-09-21 have it on the moment they exist - this one was made before that. Until it is on, this store takes writes only from the role that owns custom.record, through every door: it is a closed door, not a quiet one.';
end;
$function$


;
