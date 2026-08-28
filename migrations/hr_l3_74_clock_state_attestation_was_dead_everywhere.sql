-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 §3.2's CLOCK-OUT BREAK ATTESTATION WAS DEAD IN EVERY ORGANIZATION, INCLUDING CALIFORNIA WITH
--    THE KNOB ON, AND THE ONLY SYMPTOM WAS A FIELD THAT SAID `false`.
--
-- Three defects in a line, each hiding the next:
--
--   1. `hr.clock_state` called `hr.resolve_rules('employment', …)`. The registered entity token is
--      `hr_employment`; `'employment'` is not registered at all, so the resolver raised
--      `unknown_subject_type` on every single call.
--   2. That raise was swallowed by `exception when others then v_rules := {"incomplete":
--      ["rule_resolution_unavailable"]}`, which is indistinguishable from an honest degradation.
--   3. `v_attest` requires `resolved.meal-break` or `resolved.rest-break` to be an object. With
--      `resolved` absent it is FALSE — always, everywhere — so the kiosk never asked anyone to
--      attest, and California's meal/rest attestation simply did not exist in production.
--
-- Correcting the token alone does NOT fix it: `hr.employment` carries no jurisdiction column, so
-- the resolver would move from `unknown_subject_type` to `subject_carries_no_jurisdiction` — a
-- different raise into the same swallow, and the same silent `false`. It needs the derivation
-- hr_l3_71 built for enrollments. hr_l3_71 decision 5 named this exact gap and left it refusing
-- pending a ruling; this is that ruling, so the derivation set gains `hr_employment`.
--
-- Authority: coordinator ruling (kiosk lane's finding, routed to the derivation set's owner);
-- SPEC-TIME §3.2; SPEC-DATA-MODEL §9.2's COMP-of-employment derivation; AR2 LOCK 4.
--
-- Applied live as `hr_l3_74_clock_state_attestation_was_dead_everywhere`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. `hr_employment` IS ITS OWN EMPLOYMENT, SO THE DERIVATION BRANCHES. Every other member of the
--    set reaches its employment through an `employment_id` COLUMN; `hr.employment` has no such
--    column because it IS the row. The branch reads `p_subject_id` directly rather than executing
--    a lookup that would raise `column employment_id does not exist`.
-- 2. 🚨 THE SWALLOW NARROWS TO WHAT DEGRADATION ACTUALLY LOOKS LIKE, AND RE-RAISES EVERYTHING
--    ELSE. `when others` hid a dead legal lane for weeks, and it would have hidden the token typo
--    forever. Only two conditions are honest degradation here: an employment with no position
--    assignment in force on the work date, and a subject that genuinely carries no jurisdiction —
--    both `subject_not_found_or_unstamped` / `subject_carries_no_jurisdiction`. A token typo
--    (`unknown_subject_type`), a missing evaluation date (`as_of_required`) and a stamped-vs-passed
--    disagreement (`jurisdiction_key_mismatch`) are BUGS or DATA INTEGRITY FAULTS and must surface.
--    The distinction is by message because all of them share SQLSTATE P0001.
-- 3. THE DEGRADED PAYLOAD NOW NAMES WHAT WAS MISSING. `incomplete: ['rule_resolution_unavailable']`
--    told a reader nothing and is exactly why this sat undiagnosed; it now carries `reason` with
--    the resolver's own sentence. Every denial names what it checked — the same law this lane
--    applied to the time queues.
-- 4. THE MISMATCH ARM IS DELIBERATELY LOUD, AND WAS MEASURED BEFORE SHIPPING. `clock_state` passes
--    BOTH a subject and `v_juris ->> 'jurisdiction_key'`, and `hr.resolve_rules` raises when the
--    derived key disagrees with the passed one. Since the derivation and `v_juris` both come from
--    position_assignment → location → jurisdiction they must agree. This migration asserts the
--    derivation answers for EVERY live employment without an unexpected raise; `hr.clock_state`
--    itself is gated on self / manager reach / kiosk session, so it cannot be called from a
--    migration with no authenticated caller — the end-to-end run is authenticated, done outside
--    this file, and recorded in the commit message. If the two keys ever diverge, a clock-out
--    surfacing an error is correct: two answers to "which state's law applies" is not a thing to
--    paper over on a wage-and-hour surface.

begin;

-- ── 1. the derivation set gains hr_employment ───────────────────────────────────────────────
do $mig$
declare v_def text := pg_get_functiondef('hr._subject_jurisdiction_key(text,uuid,date)'::regprocedure);
begin
  if position('''hr_leave_enrollment'', ''hr_employment''' in v_def) > 0 then
    return;                                    -- already extended; replay is a no-op
  end if;
  if position('array[''hr_leave_enrollment'']' in v_def) = 0 then
    raise exception 'hr_l3_74: the derivation set is not in the expected shape';
  end if;

  v_def := replace(v_def,
    'array[''hr_leave_enrollment'']',
    'array[''hr_leave_enrollment'', ''hr_employment'']');

  -- decision 1: the employment IS the subject; every other member reaches it through a column
  v_def := replace(v_def,
    E'    execute format(''select t.employment_id from %I.%I t where t.id = $1'', v_schema, v_table)\n'
 || E'      into v_employment using p_subject_id;',
    E'    if p_subject_type = ''hr_employment'' then\n'
 || E'      v_employment := p_subject_id;      -- decision 1: it is its own employment\n'
 || E'    else\n'
 || E'      execute format(''select t.employment_id from %I.%I t where t.id = $1'', v_schema, v_table)\n'
 || E'        into v_employment using p_subject_id;\n'
 || E'    end if;');

  execute v_def;
end
$mig$;

-- ── 2. the token, and a swallow that only swallows degradation ──────────────────────────────
do $mig$
declare
  v_def text := pg_get_functiondef('hr.clock_state(uuid)'::regprocedure);
begin
  if position('''hr_employment'', p_employment_id' in v_def) > 0 then
    return;                                    -- already fixed; replay is a no-op
  end if;
  if position('hr.resolve_rules(''employment'', p_employment_id' in v_def) = 0 then
    raise exception 'hr_l3_74: hr.clock_state does not call the resolver in the expected shape';
  end if;

  v_def := replace(v_def,
    'hr.resolve_rules(''employment'', p_employment_id',
    'hr.resolve_rules(''hr_employment'', p_employment_id');

  v_def := replace(v_def,
    E'  exception when others then\n'
 || E'    v_rules := jsonb_build_object(''incomplete'', jsonb_build_array(''rule_resolution_unavailable''));\n'
 || E'  end;',
    E'  exception when others then\n'
 || E'    -- decision 2: only genuine degradation is swallowed. A token typo, a missing as_of or a\n'
 || E'    -- stamped-vs-passed jurisdiction disagreement are bugs and must reach the caller; a\n'
 || E'    -- `when others` here is what hid a dead attestation lane for weeks.\n'
 || E'    if sqlerrm like ''subject_not_found_or_unstamped:%''\n'
 || E'       or sqlerrm like ''subject_carries_no_jurisdiction:%'' then\n'
 || E'      v_rules := jsonb_build_object(''incomplete'', jsonb_build_array(''rule_resolution_unavailable''),\n'
 || E'                                    ''reason'', sqlerrm);   -- decision 3: name what was missing\n'
 || E'    else\n'
 || E'      raise;\n'
 || E'    end if;\n'
 || E'  end;');

  execute v_def;
end
$mig$;

-- ── 3. prove it in the same transaction that changed it ─────────────────────────────────────
do $chk$
declare v_src text; v_em record; v_n integer := 0; v_attesting integer := 0;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='hr' and p.proname='clock_state';
  if position('hr.resolve_rules(''employment''' in v_src) > 0 then
    raise exception 'hr_l3_74: the unregistered token survived';
  end if;
  if position('raise;' in v_src) = 0 then
    raise exception 'hr_l3_74: the handler does not re-raise anything — the swallow is still total';
  end if;

  -- decision 4: the derivation must answer for EVERY live employment without raising, which is
  -- what stops the narrowed handler from turning a latent gap into a clock-out error. The
  -- authenticated end-to-end proof (clock_state itself is gated on self/manager/kiosk) runs
  -- outside this migration and is recorded in its commit message.
  for v_em in select em.id, em.organization_id from hr.employment em
               where em.deleted_at is null loop
    v_n := v_n + 1;
    begin
      if hr._subject_jurisdiction_key('hr_employment', v_em.id, current_date) is null then
        raise exception 'hr_l3_74: employment % derived a null jurisdiction', v_em.id;
      end if;
      v_attesting := v_attesting + 1;
    exception when others then
      -- an employment with no assignment in force today is honest degradation, not a failure
      if sqlerrm not like 'subject_not_found_or_unstamped:%' then
        raise exception 'hr_l3_74: employment % raised an unexpected %', v_em.id, sqlerrm;
      end if;
    end;
  end loop;
  raise notice 'hr_l3_74: % live employments, % derived a jurisdiction', v_n, v_attesting;
  if v_n = 0 then
    raise exception 'hr_l3_74: no live employment to prove against — the proof would be vacuous';
  end if;
  if v_attesting = 0 then
    raise exception 'hr_l3_74: not one employment derived a jurisdiction — the fix is inert';
  end if;
end
$chk$;

commit;
