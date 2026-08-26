-- HR domain L3 — migration 2c of 9 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 THE DOUBLE TAP WAS BEING REFUSED. `hr_l3_02` resolved the idempotency replay ONLY by catching
-- the unique violation on the INSERT — which is the right authority, but it sits at step 10, and
-- the clock-state legality gate sits at step 7. So the second tap of Clock In arrived while the
-- state was already `clocked_in`, and step 7 returned `hr_punch_kind_illegal_for_state` before the
-- constraint ever got the chance to collapse it. Proven live: the replay returned `ok:false` while
-- the punch count stayed correctly at 1.
--
-- That is the exact case idempotency exists for. SPEC-TIME §1.1 and §3.4 are unambiguous — "a
-- replay is a SUCCESS, not an error" — and a UI that shows an error sentence for a double tap
-- trains an employee to tap a third time.
--
-- THE FIX IS TWO DOORS TO ONE SUCCESS, NOT A PRE-CHECK REPLACING THE CONSTRAINT.
--   Door 1 (new, early): a pure read on `(organization_id, idempotency_key)`, placed immediately
--     after the employment is loaded and BEFORE any gate. It exists so a replay is never evaluated
--     against a clock state that the original punch itself created.
--   Door 2 (unchanged): the caught `unique_violation` on the insert. This remains the AUTHORITY —
--     it is what closes the concurrent-double-tap race that a read alone cannot, and it is why
--     door 1 is an optimisation for correctness of the GATE rather than of the WRITE.
-- Both doors return the identical replay payload, so the caller cannot tell which fired.
--
-- Applied by rewriting the live definition in place. `hr_l3_02_punch_record.sql` on disk carries
-- the same block. Applied live as `hr_l3_02c_replay_precedes_state_gate`. Idempotent.

do $outer$
declare
  v_def text;
  v_new text;
  v_anchor constant text := '  v_org := v_em.organization_id;';
  v_block  constant text :=
'  v_org := v_em.organization_id;

  -- 🚨 REPLAY DOOR 1 (hr_l3_02c): resolved BEFORE every gate, because the second tap of a double
  -- tap arrives against the clock state the FIRST tap created, and the state gate would refuse it.
  -- The caught unique_violation at the insert remains the authority for the concurrent race.
  select p.id into v_punch_id from hr.punch p
   where p.organization_id = v_org and p.idempotency_key = p_idempotency_key;
  if v_punch_id is not null then
    return jsonb_build_object(
      ''ok'', true, ''replayed'', true,
      ''punch'', (select to_jsonb(pp) from hr.punch pp where pp.id = v_punch_id),
      ''clock_state'', hr.clock_state(p_employment_id),
      ''exceptions'', ''[]''::jsonb);
  end if;';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where oid = 'hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure;

  if v_def like '%REPLAY DOOR 1%' then
    raise notice 'hr_l3_02c: already applied';
    return;
  end if;

  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_02c: anchor not found in hr.punch_record — the source moved';
  end if;

  v_new := replace(v_def, v_anchor, v_block);
  execute v_new;
end $outer$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where oid = 'hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure;
  if v_def not like '%REPLAY DOOR 1%' then
    raise exception 'hr_l3_02c: the early replay door is not present';
  end if;
  if v_def not like '%exception when unique_violation then%' then
    raise exception 'hr_l3_02c: the caught unique_violation door was lost';
  end if;
end $$;
