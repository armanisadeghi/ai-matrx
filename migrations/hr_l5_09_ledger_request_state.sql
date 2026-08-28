-- HR domain L5 — migration 9 (register item HRB-017, lane L5 Leave & PTO).
--
-- THE FIGURE THAT COULD NOT OPEN ITS OWN ROWS. `hr.leave_ledger_view` already reads the request
-- state behind every `usage` and `reversal` entry — and then dropped it before returning. That
-- made two of SPEC-LEAVE §5's five figures undoorable: "Used (taken)" and "Approved upcoming" are
-- both sums over `usage` entries, split ONLY by the state of the request that caused them, so a
-- client handed the entries without that state cannot show which rows produced which figure
-- without inventing the split. §5 is explicit — *"every figure is a door to the ledger rows that
-- produced it"* — and §12 is the screen that door opens.
--
-- Found by the surface builder consuming the envelope, which is the point of building the door and
-- the screen against each other rather than against a description of each other.
--
-- Authority: SPEC-LEAVE §5, §12. Applied live as `hr_l5_09_ledger_request_state`. Idempotent.
-- (hr_l5_08 is reserved for the accrual lane's write-path wrapper.)

create or replace function hr.leave_ledger_view(
  p_employment_id uuid, p_leave_policy_id uuid, p_as_of date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_view jsonb; v_rows jsonb := '[]'::jsonb; v_r record;
  v_sum numeric := 0; v_diverge uuid; v_fig jsonb;
  v_sentence text; v_source jsonb; v_snap uuid; v_unexplained integer := 0;
begin
  v_view := hr._leave_viewer(p_employment_id);
  if (v_view ->> 'rung') = 'none' then
    return jsonb_build_object('granted', false, 'reason', v_view ->> 'reason',
      'detail','A leave ledger is only ever visible to the person and to those who hold their working record.');
  end if;

  -- `amount` and `rate` are NOT in this column list, by construction (§18 AR-5).
  for v_r in
    select l.id, l.entry_kind, l.occurred_on, l.hours_delta, l.balance_after, l.note,
           l.leave_request_id, l.source_workweek_id, l.source_work_interval_id,
           l.reverses_entry_id, l.actor_type, l.actor_employment_id, l.engine_key,
           l.engine_version, l.calc, l.created_at,
           r.starts_on, r.ends_on, r.state as request_state
      from hr.leave_ledger l
      left join hr.leave_request r on r.id = l.leave_request_id
     where l.employment_id = p_employment_id and l.leave_policy_id = p_leave_policy_id
       and l.occurred_on <= p_as_of
     order by l.occurred_on asc, l.created_at asc
  loop
    v_sum := v_sum + v_r.hours_delta;
    if v_diverge is null and round(v_sum, 4) <> round(v_r.balance_after, 4) then
      v_diverge := v_r.id;
    end if;

    select s.id into v_snap
      from hr.calculation_snapshot s
     where s.subject_type = 'hr_leave_ledger' and s.subject_id = v_r.id
     order by s.computed_at desc limit 1;
    if v_snap is null and v_r.entry_kind in
       ('accrual','carryover','forfeiture','carryover_expiry','payout') then
      v_unexplained := v_unexplained + 1;
    end if;

    -- §12 / LAW 3a: a human sentence, never the enum token.
    v_sentence := case v_r.entry_kind
      when 'accrual'          then case when v_r.source_workweek_id is not null
                                   then format('Earned from the week of %s',
                                        to_char(v_r.occurred_on,'FMMon FMDD'))
                                   else 'Earned' end
      when 'usage'            then format('Used — %s to %s',
                                   to_char(coalesce(v_r.starts_on, v_r.occurred_on),'FMMon FMDD'),
                                   to_char(coalesce(v_r.ends_on, v_r.occurred_on),'FMMon FMDD'))
      when 'reversal'         then 'Returned — a request was cancelled or shortened'
      when 'adjustment'       then case when v_r.hours_delta > 0 then 'Added by hand'
                                        else 'Removed by hand' end
      when 'carryover'        then format('Carried over into the %s policy year',
                                   to_char(v_r.occurred_on,'YYYY'))
      when 'carryover_expiry' then 'Carried-over time expired'
      when 'forfeiture'       then 'Forfeited at the policy-year boundary'
      when 'payout'           then 'Paid out at separation'
      when 'reinstatement'    then 'Reinstated from a prior period of employment'
      when 'opening_balance'  then 'Opening balance'
      else v_r.entry_kind end;
    if v_r.note is not null and v_r.note <> '' then
      v_sentence := v_sentence || ' — ' || v_r.note;
    end if;

    v_source := case
      when v_r.leave_request_id is not null
        then jsonb_build_object('kind','leave_request','id', v_r.leave_request_id)
      when v_r.source_workweek_id is not null
        then jsonb_build_object('kind','workweek','id', v_r.source_workweek_id)
      when v_r.reverses_entry_id is not null
        then jsonb_build_object('kind','leave_ledger','id', v_r.reverses_entry_id)
      else null end;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id', v_r.id, 'occurred_on', v_r.occurred_on, 'entry_kind', v_r.entry_kind,
      'sentence', v_sentence, 'hours_delta', v_r.hours_delta, 'balance_after', v_r.balance_after,
      'running_sum', round(v_sum, 4),
      'source', v_source,
      -- THE FIGURE'S OWN ADDRESS. "Used (taken)" and "Approved upcoming" are the same entry kind
      -- split by these three fields and nothing else; without them the client would have to guess
      -- which rows produced which figure, and a guessed door is a wrong door.
      'request_state', v_r.request_state,
      'request_starts_on', v_r.starts_on,
      'request_ends_on', v_r.ends_on,
      'counts_toward', case
        when v_r.entry_kind not in ('usage','reversal') then null
        when v_r.request_state in ('taken','partially_taken') then 'used_taken'
        when v_r.request_state = 'approved' and v_r.ends_on >= current_date then 'approved_upcoming'
        when v_r.request_state = 'approved' then 'used_taken'
        else null end,
      'reverses_entry_id', v_r.reverses_entry_id,
      'snapshot_id', v_snap,
      'unexplained', (v_snap is null and v_r.entry_kind in
                      ('accrual','carryover','forfeiture','carryover_expiry','payout')),
      'engine_key', v_r.engine_key, 'engine_version', v_r.engine_version,
      'calc', v_r.calc,
      'actor_type', v_r.actor_type,
      'actor_name', case when v_r.actor_employment_id is not null
                         then hr._subject_display_name(v_r.actor_employment_id, auth.uid())
                         end));
  end loop;

  v_fig := hr.leave_figures(p_employment_id, p_leave_policy_id, p_as_of);

  return jsonb_build_object(
    'granted', true, 'viewer_rung', v_view ->> 'rung',
    'employment_id', p_employment_id, 'leave_policy_id', p_leave_policy_id, 'as_of', p_as_of,
    'entries', v_rows, 'figures', v_fig, 'sentence', hr._leave_sentence(v_fig),
    'running_balance_ok', (v_diverge is null),
    'divergence_at_entry_id', v_diverge,
    'unexplained_entry_count', v_unexplained,
    'entry_count', jsonb_array_length(v_rows));
end
$function$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_ledger_view';
  if v_def not like '%counts_toward%' then
    raise exception 'hr_l5_09: the ledger view still cannot tell a figure which rows are its own';
  end if;
  -- the AR-5 exclusion must survive this rewrite
  if v_def ~ '\ml\.(amount|rate)\M' then
    raise exception 'hr_l5_09: the rewrite reintroduced amount or rate — SPEC-LEAVE §18 AR-5';
  end if;
end $$;
