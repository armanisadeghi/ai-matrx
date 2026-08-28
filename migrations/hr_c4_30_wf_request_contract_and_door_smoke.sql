-- HR domain C4 — migration 30 (register item HRB-008; the P0 post-mortem, made enforceable).
--
-- 🚨 hr_c4_25 (06:22:57Z) AND hr_c4_26 (06:24:43Z) EACH SHIPPED THE SAME PL/pgSQL SCOPE TRAP, AND
-- TOGETHER THEY TOOK `hr.wf_request` DOWN FOR EVERY CALLER — eleven doors across four lanes.
--
--     declare v_pf_any boolean;
--     begin  select exists (…) into v_pf_any;
--     exception when others then return <refusal>; end;
--     if not v_pf_any then …        -- ← the block is closed; PL/pgSQL resolves this as a COLUMN
--
--   42703: column "v_pf_any" does not exist        (and the twin, "v_looked", from hr_c4_26)
--
-- Fixed by hr_c4_28 (06:34:22Z) and hr_c4_29 (06:36:13Z), and verified from a non-admin caller
-- through the real door: `public.hr_leave_request_submit` now returns a business envelope
-- (`worker_class_outside_policy_scope`), not a 42703.
--
-- ===================================================================================
-- HOW IT SHIPPED — the honest answer, because it decides what to build here
--
-- 1. **Both migrations' own post-conditions passed, and they could never have failed.** They
--    grepped `prosrc` for strings that were present, correct, and in the right order. **Text was
--    never the problem — scope was.** A migration that can only READ itself cannot catch this class,
--    and I wrote two in a row that could only read themselves.
--
-- 2. **The bug was unreachable for eight minutes, which is why the door still looked fine.** Every
--    path that hit the guarded block RETURNED from inside it — `esign_envelope` and the other
--    unmapped targets refused before reaching the out-of-scope read. My verification probe drove
--    exactly that path, so it passed. hr_c4_27 (06:30:53Z) then mapped those targets, execution ran
--    on past the block for the first time, and every caller broke.
--
-- 3. **The suite WOULD have caught it in about thirty seconds — I did not run it.** `hrb008_proof.py`
--    files real requests through `hr.wf_request` and aborts on the first one; when I finally ran it
--    it collapsed from 159 assertions to 4 and named `v_looked` immediately. The gap was not a
--    missing assertion. It was applying two migrations to a live engine and trusting their internal
--    greps instead of the suite that drives the door.
--
-- ===================================================================================
-- SO THE GUARD IS AN EXECUTION, NOT A STRING
--
-- `hr._wf_door_smoke()` CALLS `hr.wf_request` and fails if the door RAISES instead of returning an
-- envelope, inside a subtransaction it always rolls back. Any future migration touching the engine
-- calls it in its post-conditions — hr_c4_28 and hr_c4_29 already did this inline, and this makes it
-- a named, reusable thing rather than a habit that has to be remembered. `hrb008_proof.py` asserts
-- it too, so the guarantee has both a migration-time and a suite-time home.
--
-- The `hr.function_contract` row is declared alongside it per the standing law — it pins the shape
-- (the hoisted DECLARE, both fail-closed markers) and, more usefully, BANS the two spellings that
-- caused this. That half is enforced automatically by `hr.function_contracts_broken()`.
--
-- Applied live as `hr_c4_30_wf_request_contract_and_door_smoke`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

-- ============================================================ 1. the execution guard
create or replace function hr._wf_door_smoke()
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_org uuid; v_emp uuid; v_env jsonb;
begin
  select ra.organization_id, ra.employment_id into v_org, v_emp
    from hr.role_assignment ra
    join hr.employment em on em.id = ra.employment_id
   where ra.role_key = 'hr_owner' and ra.is_active and ra.revoked_at is null
     and em.deleted_at is null
   limit 1;
  if v_org is null then
    return jsonb_build_object('ok', true, 'skipped', 'no organization to drive the door against');
  end if;

  -- 🚨 CALL IT. The two migrations that broke this door both passed post-conditions that only read
  -- its source. Everything is rolled back by the exception this block always raises.
  begin
    v_env := hr.wf_request('termination', 'hr_employment', v_emp, v_org);
    if v_env is null or not (v_env ? 'granted') then
      raise exception 'hr__wf_door_smoke: the door returned a malformed envelope: %', v_env;
    end if;
    raise exception 'hr__wf_door_smoke_rollback';
  exception when others then
    if sqlerrm = 'hr__wf_door_smoke_rollback' then
      return jsonb_build_object('ok', true, 'envelope_shape', 'well-formed');
    end if;
    if sqlerrm like 'hr__wf_door_smoke:%' then raise; end if;
    -- ANY other raise out of hr.wf_request is the failure this exists to catch
    raise exception 'hr__wf_door_smoke: hr.wf_request RAISED instead of returning an envelope: % (%)',
      sqlerrm, sqlstate;
  end;
end
$fn$;

revoke all on function hr._wf_door_smoke() from public, anon, authenticated;

comment on function hr._wf_door_smoke is
  'Calls hr.wf_request and fails if it RAISES rather than returning an envelope, rolling everything back. Exists because hr_c4_25/26 each shipped a PL/pgSQL scope trap whose migrations both passed post-conditions that only grepped prosrc — text was never the problem, scope was. Every migration touching the engine calls this; hrb008_proof asserts it too.';

-- ============================================================ 2. the contract (standing law)
insert into hr.function_contract (schema_name, function_name, home_migration, must_contain,
                                  must_not_contain, reason, is_active)
select 'hr', 'wf_request', 'hr_c4_29',
       array[
         'v_pf_action text; v_pf_step text; v_pf_any boolean;',  -- hoisted, not block-scoped
         'approval_subject_unmapped',                            -- RECORDED DECISION 5 at the door
         'WF_NO_POSSIBLE_APPROVER'                               -- hr_c4_21's pre-flight
       ],
       array[
         'declare v_pf_any',   -- the P0: block-scoped, then read after the block closed
         'v_looked'            -- its twin, from hr_c4_26's subject guard
       ],
       'hr_c4_25/26 each declared a variable inside a nested declare/begin/exception block and read it AFTER the block closed, so PL/pgSQL resolved it as a column: 42703 "v_pf_any does not exist" took hr.wf_request down for every caller across four lanes. Both migrations passed their own post-conditions because those only grepped prosrc for text that was present and correct. This contract bans the two spellings; hr._wf_door_smoke() is the half that actually executes the door, because text was never the problem.',
       true
 where not exists (select 1 from hr.function_contract
                    where schema_name = 'hr' and function_name = 'wf_request');

-- ============================================================ 3. post-conditions
do $$
declare v_res jsonb; v_bad integer; v_broken jsonb;
begin
  -- the guard works, and the door is healthy right now
  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_30: the door smoke test did not pass: %', v_res;
  end if;
  raise notice 'hr_c4_30: door smoke %', v_res;

  -- the contract is declared and currently satisfied
  if not exists (select 1 from hr.function_contract
                  where schema_name = 'hr' and function_name = 'wf_request' and is_active) then
    raise exception 'hr_c4_30: the hr.wf_request contract was not declared';
  end if;
  select coalesce(jsonb_agg(b), '[]'::jsonb) into v_broken from hr.function_contracts_broken() b;
  if v_broken <> '[]'::jsonb then
    raise exception 'hr_c4_30: % function contract(s) are broken: %',
      jsonb_array_length(v_broken), v_broken;
  end if;

  -- and the P0 spellings are genuinely gone from the live function
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_request') ~ '(declare v_pf_any|v_looked)' then
    raise exception 'hr_c4_30: hr.wf_request still carries a block-scoped guard variable';
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  if v_bad > 0 then
    raise exception 'hr_c4_30: % hr conformance finding(s)', v_bad;
  end if;
end $$;
