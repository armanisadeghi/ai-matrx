-- based-on: custom.assert_store_door(uuid, text) 47b265b8c2648aec6fe2f546775e4dba98cf2f3a8ccb3c92be56ee9cfe3c21f8
--
-- STORE-ON — THE REFUSAL SAYS "TURNED OFF", NOT "NOT TURNED ON YET".
--
-- The only change is the sentence and its hint. Not one check moves: the memo arm, the
-- `custom.store_is_open` read and the owner arm are byte-identical to the body named in
-- `-- based-on:` above.
--
-- WHY IT IS WRONG NOW. Owner ruling, Arman, 2026-09-23: the record store's default is ON.
-- LIMITS-FIX wrote "has not turned the record store on yet" on 2026-09-21 for a world where
-- OFF was the starting state and nobody had left it — true then, and the best sentence
-- anybody could write. From today, an organization is off only because a person with an
-- owner's or an administrator's seat in it switched it off. Telling that person they have
-- "not turned it on yet" names the wrong act, hides the fact that somebody did this on
-- purpose, and sends them looking for a setup step that does not exist.
--
-- The hint loses its "organizations created from 2026-09-21 have it on" clause for the same
-- reason: EVERY organization has it on, so a birthday is no longer part of the answer.
--
-- This sentence is read back by name in scripts/campaign-tests/{w1_val_apply_door,
-- doorfix_green,v1_fixes_green,checklists_red,w3_work_c44}.sql and by
-- aidream/apps/shared/records/src/__tests__/real-doors.test.ts; all six move with it in the
-- same commit.
--
-- Header-less: a `CREATE OR REPLACE FUNCTION` in schema `custom` is exempt from the
-- guard-read rule (JUDGMENT.md §4a) but this file names no `-- target:` header, so the
-- deny-list judges it — and it carries no DROP, REVOKE, UPDATE, DELETE, GRANT or policy DDL.
--
-- INVERSE: migrations/inverse/storeon_the_refusal_says_turned_off_down.sql restores the body
-- named above, word for word.

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
