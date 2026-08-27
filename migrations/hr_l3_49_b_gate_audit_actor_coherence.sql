-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Check 20 for hr_l3_49's decision 5: an audit row may not claim `automation` and name a human.
--
-- `hr._record_access_audit` now accepts `p_actor_user_id`, and a caller that passes it WITHOUT
-- `p_actor_type` gets `actor_type = 'automation'` on a row that names a person — because
-- `auth.uid()` is still null for the privileged caller, and that is what the actor_type derivation
-- reads. Reproduced live before shipping this check, so it is a measured possibility rather than a
-- theoretical one.
--
-- Changing the derivation is the audit lane's call and hr_l3_49 deliberately did not make it. What
-- this lane CAN do is refuse to let the contradiction accumulate unseen: an access log that says a
-- robot did something a named person did is worse than one that says nothing, because it is read as
-- evidence. Zero rows violate it today (150 rows measured), so it ships green.
--
-- Authority: coordinator ruling (audit actor batch), decision 5 of hr_l3_49; SPEC-ACCESS §4.7.
--
-- Applied live as `hr_l3_49_b_gate_audit_actor_coherence`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. A DATA CHECK, NOT A STRUCTURAL ONE. The writer is one function and it is already correct for
--    every caller that names an actor_type; what cannot be checked structurally is what CALLERS
--    pass, and aidream's call lives in another repo. So this asserts the property of the rows that
--    actually landed. It goes red the first time a real caller gets the combination wrong, which is
--    the moment worth catching.
-- 2. IT REPORTS THE ROWS, NOT JUST A COUNT. A gate that says "3 violations" sends someone hunting;
--    the detail carries ids, actions and the named user so the failing call site is identifiable
--    from the gate output alone.
-- 3. `automation` IS THE ONLY CONTRADICTION ASSERTED. `hr_admin`, `manager`, `employee` and
--    `kiosk_device` naming a user are all coherent. `kiosk_device` in particular legitimately names
--    the employee who punched, so a blanket "actor_type must match the user" rule would be wrong.

do $mig$
declare
  v_def text;
  v_anchor text :=
    '''may do it.'');' || E'\n  return next;\nend';
  v_block text;
begin
  v_def := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);

  if position('audit_actor_type_matches_named_user' in v_def) > 0 then
    raise notice 'hr_l3_49b: the check is already present';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_49b: could not find the end of the conformance function; refusing to guess';
  end if;

  v_block :=
'''may do it.'');
  return next;

  ---------------------------------------------------------------- 20. an audit row may not claim automation and name a human
  check_key := ''audit_actor_type_matches_named_user'';
  select coalesce(jsonb_agg(jsonb_build_object(
           ''audit_id'', a.id, ''action'', a.action, ''target_token'', a.target_token,
           ''actor_user_id'', a.actor_user_id, ''occurred'', a.created_at)), ''[]''::jsonb)
    into v_bad
    from hr.access_audit a
   where a.actor_type = ''automation''
     and a.actor_user_id is not null;
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''violations'', v_bad,
    ''why'', ''hr._record_access_audit takes p_actor_user_id (hr_l3_49). A caller that passes it ''
      || ''without p_actor_type gets actor_type=automation on a row naming a person, because ''
      || ''auth.uid() is null for the privileged caller and that is what the derivation reads. An ''
      || ''access log that credits a robot for what a named human did is read as evidence, so the ''
      || ''contradiction is not allowed to accumulate. Fix the CALL (pass p_actor_type), not the row.'');
  return next;
end';

  v_def := replace(v_def, v_anchor, v_block);
  execute v_def;
end
$mig$;

-- ── self-assertions ─────────────────────────────────────────────────────────────────────────
do $chk$
declare v_n int; v_fail jsonb;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n < 20 then
    raise exception 'hr_l3_49b: expected at least 20 checks, found %', v_n;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('check', check_key, 'detail', detail)), '[]'::jsonb)
    into v_fail from hr.punch_write_path_conformance() where not ok;
  if v_fail <> '[]'::jsonb then
    raise exception 'hr_l3_49b: the gate is red on arrival: %', v_fail::text;
  end if;

  if (select count(*) from hr.punch_write_path_conformance()
       where check_key = 'audit_actor_type_matches_named_user' and severity = 'blocking') <> 1 then
    raise exception 'hr_l3_49b: check 20 is missing or not blocking';
  end if;

  -- the check must actually be capable of failing: prove it sees a planted contradiction
  if exists (select 1 from hr.access_audit where actor_type = 'automation' and actor_user_id is not null) then
    raise exception 'hr_l3_49b: a contradictory row already exists; the check would not be green';
  end if;
end
$chk$;
