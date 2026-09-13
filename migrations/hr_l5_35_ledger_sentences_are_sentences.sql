-- HR domain L5 — migration 35 (register item HRB-017, lane L5 Leave & PTO).
--
-- Production review found every approved usage row rendered twice: the ledger view generated
-- `Used — Sep 21 to Sep 22`, then appended the workflow writer's note
-- `Approved — Sep 21 to Sep 22`. The result was neither the request's state nor a sentence a
-- person would write. The ledger row is immutable evidence, so the display projection owns the
-- repair: one helper turns the row plus its request state into one sentence and deliberately
-- ignores the redundant machine note for usage/reversal entries. All ledger consumers inherit it.
--
-- Authority: SPEC-LEAVE §12 LAW 3a. Idempotent.
--
-- This file intentionally has no BEGIN/COMMIT: `pnpm db:apply` owns the one pinned,
-- ledgered transaction for the full migration.

create or replace function hr._leave_ledger_sentence(
  p_entry_kind text,
  p_occurred_on date,
  p_starts_on date,
  p_ends_on date,
  p_request_state text,
  p_source_workweek_id uuid,
  p_leave_request_id uuid,
  p_hours_delta numeric,
  p_note text
) returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_start date := coalesce(p_starts_on, p_occurred_on);
  v_end date := coalesce(p_ends_on, p_occurred_on);
  v_span text;
  v_sentence text;
begin
  v_span := case
    when v_start = v_end then to_char(v_start, 'FMMon FMDD')
    else format('%s to %s', to_char(v_start, 'FMMon FMDD'), to_char(v_end, 'FMMon FMDD'))
  end;

  -- A request-backed ledger entry already has canonical dates and state. Its machine-generated
  -- note repeats those same facts, so it never participates in the human sentence. A manually
  -- posted usage/reversal is different evidence: keep its meaningful note visible.
  if p_entry_kind = 'usage' and p_leave_request_id is not null then
    return case p_request_state
      when 'approved' then format('Approved for %s.', v_span)
      when 'taken' then format('Taken from %s.', v_span)
      when 'partially_taken' then format('Partly taken from %s.', v_span)
      else format('Booked for %s.', v_span)
    end;
  elsif p_entry_kind = 'reversal' and p_leave_request_id is not null then
    return format('Returned after the request for %s was cancelled or shortened.', v_span);
  end if;

  v_sentence := case p_entry_kind
    when 'accrual' then case when p_source_workweek_id is not null
                         then format('Earned from the week of %s', to_char(p_occurred_on, 'FMMon FMDD'))
                         else 'Earned' end
    when 'usage' then 'Used'
    when 'reversal' then 'Returned'
    when 'adjustment' then case when p_hours_delta > 0 then 'Added by hand' else 'Removed by hand' end
    when 'carryover' then format('Carried over into the %s policy year', to_char(p_occurred_on, 'YYYY'))
    when 'carryover_expiry' then 'Carried-over time expired'
    when 'forfeiture' then 'Time forfeited at the policy-year boundary'
    when 'payout' then 'Time paid out at separation'
    when 'reinstatement' then 'Time reinstated from a prior period of employment'
    when 'opening_balance' then 'Opening balance'
    else 'Balance changed'
  end;

  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    v_sentence := v_sentence || ' — ' || btrim(p_note);
  end if;
  return v_sentence;
end
$function$;

comment on function hr._leave_ledger_sentence(text,date,date,date,text,uuid,uuid,numeric,text) is
  'SPEC-LEAVE §12 LAW 3a. One human-readable sentence for every ledger row. Request-backed '
  'usage/reversal entries derive the sentence from canonical request dates/state and ignore the '
  'redundant writer note; immutable ledger evidence is never rewritten.';

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

    v_sentence := hr._leave_ledger_sentence(
      v_r.entry_kind, v_r.occurred_on, v_r.starts_on, v_r.ends_on,
      v_r.request_state, v_r.source_workweek_id, v_r.leave_request_id, v_r.hours_delta, v_r.note);

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

do $proof$
begin
  if hr._leave_ledger_sentence(
       'usage', date '2026-09-13', date '2026-09-21', date '2026-09-22',
       'approved', null, '00000000-0000-0000-0000-000000000001', -16,
       'Approved — Sep 21 to Sep 22')
       is distinct from 'Approved for Sep 21 to Sep 22.' then
    raise exception 'hr_l5_35: approved usage still repeats its state or dates';
  end if;
  if hr._leave_ledger_sentence(
       'usage', date '2026-09-13', date '2026-09-21', date '2026-09-21',
       'taken', null, '00000000-0000-0000-0000-000000000001', -8, 'Approved — Sep 21')
       is distinct from 'Taken from Sep 21.' then
    raise exception 'hr_l5_35: a taken single-day request is not a human sentence';
  end if;
  if hr._leave_ledger_sentence(
       'reversal', date '2026-09-13', date '2026-09-21', date '2026-09-22',
       'cancelled', null, '00000000-0000-0000-0000-000000000001', 16,
       'Cancelled — 2026-09-21 to 2026-09-22')
       is distinct from 'Returned after the request for Sep 21 to Sep 22 was cancelled or shortened.' then
    raise exception 'hr_l5_35: reversal still repeats its machine note';
  end if;
  if hr._leave_ledger_sentence(
       'opening_balance', date '2026-09-13', null, null, null, null, null, 24,
       'Imported opening balance')
       is distinct from 'Opening balance — Imported opening balance' then
    raise exception 'hr_l5_35: meaningful non-request notes were lost';
  end if;
  if hr._leave_ledger_sentence(
       'usage', date '2026-09-13', null, null, null, null, null, -8,
       'Manual correction after payroll audit')
       is distinct from 'Used — Manual correction after payroll audit' then
    raise exception 'hr_l5_35: a meaningful non-request usage note was lost';
  end if;
  raise notice 'hr_l5_35: usage/reversal sentences are singular and natural; meaningful notes survive.';
end
$proof$;
