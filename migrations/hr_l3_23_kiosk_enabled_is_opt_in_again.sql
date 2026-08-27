-- HR domain L3 — migration 23 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 RETIRING A WORKAROUND WHOSE REASON HAS GONE, WHICH IS THE OTHER HALF OF N1.
--
-- `hr_l3_05` decision 2 made `hr_kiosk_claim_pairing` treat an ABSENT `hr.clock.kiosk_enabled` as
-- "not an opt-out", on this stated reasoning: `platform.feature_knob` is keyed `(feature, key)` with
-- no organization column, so an absent row could not mean "this org opted out" — it would have
-- disabled the kiosk for every organization on the platform with no configuration able to re-enable
-- one. Given that, admitting the claim was the lesser evil, and an administrator issuing a pairing
-- code was treated as the org's opt-in.
--
-- That reasoning was correct then and is obsolete now. `hr_l3_22` connected the read path to the
-- REAL org rung — `iam.organizations.settings -> 'hr' -> 'clock' -> 'kiosk_enabled'`, which is what
-- `hr_knob_set` has been writing all along. A per-organization signal exists, so "absent" can mean
-- what SPEC-TIME §13 always said it means: `hr.clock.kiosk_enabled` defaults to **false**, orgs opt
-- in, and the opt-in now actually reaches the gate.
--
-- Measured before this change, with hr_l3_22 already in place: an org with NO override and no
-- platform row still had its pairing claim ACCEPTED — the kiosk was open by default in every
-- organization, the opposite of the spec, and the mirror image of the N1 failure. Fixing the
-- resolver alone would have left that standing.
--
-- 🚨 THE REFUSAL SENTENCE IS UNCHANGED AND STILL LEAKS NOTHING. Unknown code, expired code, already
-- claimed, blank, and kiosk-disabled all return the identical `pairing_not_available` message, so a
-- caller cannot enumerate which organizations run kiosks (hr_l3_05 decision 4).
--
-- Applied live as `hr_l3_23_kiosk_enabled_is_opt_in_again`. Idempotent.

do $outer$
declare
  v_def text;
  v_from text;
  v_to   text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'public.hr_kiosk_claim_pairing(text,text)'::regprocedure;

  if position('hr_l3_23' in v_def) > 0 then
    raise notice 'hr_l3_23: already applied';
    return;
  end if;

  v_from := concat(
    '  v_gate := hr._clock_knob(''kiosk_enabled'', ''null''::jsonb, d.organization_id);', chr(10),
    '  if jsonb_typeof(v_gate) = ''boolean'' and not (v_gate #>> ''{}'')::boolean then');

  v_to := concat(
    '  -- hr_l3_23: the kiosk is OPT-IN (SPEC-TIME 13: hr.clock.kiosk_enabled defaults to false).', chr(10),
    '  -- hr_l3_05 admitted an absent knob because platform.feature_knob has no organization column,', chr(10),
    '  -- so an absent row could not mean "this org opted out". hr_l3_22 connected the real org rung', chr(10),
    '  -- (iam.organizations.settings->hr->clock->kiosk_enabled, what hr_knob_set writes), so the', chr(10),
    '  -- opt-in now reaches this gate and the workaround retires.', chr(10),
    '  v_gate := hr._clock_knob(''kiosk_enabled'', ''false''::jsonb, d.organization_id);', chr(10),
    '  if not coalesce((v_gate #>> ''{}'')::boolean, false) then');

  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_23: the kiosk_enabled gate was not found in its expected shape';
  end if;

  execute replace(v_def, v_from, v_to);
end $outer$;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_kiosk_claim_pairing(text,text)'::regprocedure);
  if v_def not like '%hr_l3_23%' then
    raise exception 'hr_l3_23: the opt-in gate did not land';
  end if;
  if v_def like '%''null''::jsonb, d.organization_id%' then
    raise exception 'hr_l3_23: the absent-means-allow default remains';
  end if;
  -- the org rung must still be read, and the refusal must still be the uniform sentence
  if v_def not like '%d.organization_id%' then
    raise exception 'hr_l3_23: the gate lost its organization argument';
  end if;
  if v_def not like '%pairing_not_available%' then
    raise exception 'hr_l3_23: the leak-free refusal reason was lost';
  end if;
end $$;
