-- HR domain L3 — migration 25 (register item HRB-015, lane L3 punch + kiosk).
--
-- `hr.clock_state` gains a `last_punch` block. Additive only.
--
-- THE GAP: the envelope carried `open_chain`, and a chain OPENS after the most recent unvoided
-- `clock_out` by definition — so the moment someone clocks out, the chain is empty and the surface
-- had nothing to render. SPEC-TIME §2.1's `clocked_out` state is specified to show "last punch time
-- and today's total so far", and the client correctly refused to invent the value rather than
-- reconstruct it from a chain that is empty on purpose. So the person who punched two minutes ago
-- saw "None yet", which reads as "your punch did not register" — the single most alarming thing a
-- time clock can tell someone who just clocked out.
--
-- `last_punch` is deliberately resolved INDEPENDENTLY of the open chain: the most recent unvoided
-- punch on the employment's stamped `local_work_date`, whatever it is. That is the only way it can
-- survive the clock-out that empties the chain. Voided punches are excluded — a corrected punch
-- must never be the thing the employee is shown as their last action.
--
-- 🚨 ONE BUILDER, ALREADY. `hr.punch_record` embeds its nested `clock_state` by calling
-- `hr.clock_state(p_employment_id)` — it does not assemble a second envelope — so the two shapes
-- cannot diverge and this field appears in both by construction. Asserted at the foot of this file
-- rather than assumed, because "they must stay the same shape" is only true while that stays true.
--
-- Applied live as `hr_l3_25_clock_state_last_punch`. Idempotent.

do $outer$
declare
  v_def   text;
  v_dfrom text;
  v_dto   text;
  v_sfrom text;
  v_sto   text;
  v_rfrom text;
  v_rto   text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.clock_state(uuid)'::regprocedure;

  if position('last_punch' in v_def) > 0 then
    raise notice 'hr_l3_25: already applied';
    return;
  end if;

  -- 1. a variable to hold it
  v_dfrom := '  v_attest  boolean;';
  v_dto   := concat('  v_attest  boolean;', chr(10),
                    '  v_last    jsonb;   -- hr_l3_25: independent of the open chain');

  -- 2. resolve it next to the chain, on the same stamped local_work_date
  v_sfrom := concat(
    '  select coalesce(jsonb_agg(to_jsonb(c) order by c.occurred_at), ''[]''::jsonb) into v_chain', chr(10),
    '    from hr._punch_open_chain(p_employment_id) c;');
  v_sto := concat(
    '  select coalesce(jsonb_agg(to_jsonb(c) order by c.occurred_at), ''[]''::jsonb) into v_chain', chr(10),
    '    from hr._punch_open_chain(p_employment_id) c;', chr(10), chr(10),
    '  -- hr_l3_25: the most recent UNVOIDED punch on this work date, resolved independently of the', chr(10),
    '  -- open chain - the chain is empty by definition after a clock_out, which is exactly when the', chr(10),
    '  -- surface most needs to say what just happened.', chr(10),
    '  select jsonb_build_object(', chr(10),
    '           ''id'', p.id, ''punch_kind'', p.punch_kind,', chr(10),
    '           ''occurred_at'', p.occurred_at, ''tz'', p.tz,', chr(10),
    '           ''local_work_date'', p.local_work_date, ''source'', p.source)', chr(10),
    '    into v_last', chr(10),
    '    from hr.punch p', chr(10),
    '   where p.employment_id = p_employment_id', chr(10),
    '     and p.voided_at is null', chr(10),
    '     and p.local_work_date = (v_juris ->> ''local_work_date'')::date', chr(10),
    '   order by p.occurred_at desc, hr._punch_kind_rank(p.punch_kind) desc, p.server_received_at desc', chr(10),
    '   limit 1;');

  -- 3. put it on the envelope, beside the chain it complements
  v_rfrom := '    ''open_chain'', v_chain,';
  v_rto   := concat(
    '    ''open_chain'', v_chain,', chr(10),
    '    ''last_punch'', v_last,   -- null only when the day genuinely has no unvoided punch', chr(10));

  if position(v_dfrom in v_def) = 0 then
    raise exception 'hr_l3_25: the declare anchor was not found';
  end if;
  if position(v_sfrom in v_def) = 0 then
    raise exception 'hr_l3_25: the open-chain select anchor was not found';
  end if;
  if position(v_rfrom in v_def) = 0 then
    raise exception 'hr_l3_25: the open_chain return key was not found';
  end if;

  v_def := replace(v_def, v_dfrom, v_dto);
  v_def := replace(v_def, v_sfrom, v_sto);
  v_def := replace(v_def, v_rfrom, v_rto);
  execute v_def;
end $outer$;

do $$
declare v_cs text; v_pr text;
begin
  v_cs := pg_get_functiondef('hr.clock_state(uuid)'::regprocedure);
  v_pr := pg_get_functiondef('hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure);

  if v_cs not like '%''last_punch'', v_last%' then
    raise exception 'hr_l3_25: last_punch is not on the clock_state envelope';
  end if;
  if v_cs not like '%p.voided_at is null%' then
    raise exception 'hr_l3_25: last_punch does not exclude voided punches';
  end if;

  -- 🚨 ONE BUILDER: punch_record must EMBED hr.clock_state, never assemble its own envelope,
  -- or the two shapes drift the first time either is extended.
  if v_pr not like '%hr.clock_state(p_employment_id)%' then
    raise exception 'hr_l3_25: punch_record no longer embeds hr.clock_state - the shapes can now diverge';
  end if;
  if v_pr like '%''open_chain'',%' then
    raise exception 'hr_l3_25: punch_record appears to build its own clock-state envelope';
  end if;
end $$;
