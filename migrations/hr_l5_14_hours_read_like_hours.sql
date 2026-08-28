-- HR domain L5 — migration 14 (register item HRB-017, lane L5 Leave & PTO).
--
-- "16. hours" — THE DEFECT A PROOF SCRIPT CANNOT SEE.
--
-- The request form's cost sentence rendered *"4 days selected · 2 working days · **16. hours** ·
-- Weekend excluded"*. `to_char(16, 'FM999999.99')` returns `16.` — `FM` strips the trailing zeros
-- and leaves the decimal point standing on its own. Every assertion in
-- `scripts/hr/hrb017_leave_proof.py` passed on that string, because the script checks that the
-- sentence NAMES days and hours and never reads it as a person would. It took opening the page.
--
-- The number is right and it looks broken, which on the one screen whose entire job is telling an
-- employee what a request will cost them is not cosmetic — it is the sentence they decide from.
--
-- Authority: SPEC-LEAVE §4.1, §5. Applied live as `hr_l5_14_hours_read_like_hours`. Idempotent.

create or replace function hr._leave_hours_text(p_hours numeric)
returns text
language sql
immutable
as $function$
  -- 16 → '16'  ·  16.5 → '16.5'  ·  3.08 → '3.08'  ·  -4 → '-4'  ·  null → null
  select case when p_hours is null then null
              else rtrim(rtrim(to_char(p_hours, 'FM999999990.99'), '0'), '.') end;
$function$;

comment on function hr._leave_hours_text(numeric) is
  'The ONE way an hours figure becomes text in a leave sentence. to_char(x, ''FM999999.99'') leaves '
  'a bare decimal point on a whole number ("16.") and drops the leading zero on a fraction '
  '(".5"); both shipped, and the browser found the first one. Null stays null — a figure we do not '
  'have is never rendered as a number.';

-- -----------------------------------------------------------------------------------
-- The two functions whose sentences an employee actually reads
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_sentence(p_fig jsonb)
returns text
language plpgsql
immutable
as $function$
declare
  v_method text := p_fig ->> 'accrual_method';
  v_bal    numeric := coalesce((p_fig ->> 'ledger_balance')::numeric, 0);
  v_up     numeric := coalesce((p_fig ->> 'approved_upcoming')::numeric, 0);
  v_cap    numeric := nullif(p_fig ->> 'balance_cap','')::numeric;
  v_usable date    := nullif(p_fig ->> 'usable_on','')::date;
  v_floor  numeric := nullif(p_fig ->> 'negative_balance_floor','')::numeric;
begin
  if coalesce((p_fig ->> 'unlimited')::boolean, false) then
    return 'Unlimited — requests still need approval.';
  end if;
  if v_usable is not null and v_usable > current_date then
    return format('You''ve earned %s hours. You can start using this time on %s.',
                  hr._leave_hours_text(coalesce((p_fig ->> 'accrued_to_date')::numeric, 0)),
                  to_char(v_usable, 'FMMon FMDD'));
  end if;
  if v_bal < 0 then
    return case when v_floor is not null
      then format('Your balance is %s hours. Your organization allows down to %s.',
                  hr._leave_hours_text(v_bal), hr._leave_hours_text(v_floor))
      else format('Your balance is %s hours.', hr._leave_hours_text(v_bal)) end;
  end if;
  if v_cap is not null and v_bal >= v_cap then
    return format('You''ve reached this policy''s %s-hour cap. You''ll start earning again as soon '
               || 'as you use some time. Nothing expires.', hr._leave_hours_text(v_cap));
  end if;
  if v_method = 'per_hours_worked' then
    return format('You earn %s hour(s) for every %s you work.',
                  hr._leave_hours_text(coalesce((p_fig ->> 'accrual_rate')::numeric, 0)),
                  hr._leave_hours_text(coalesce((p_fig ->> 'accrual_per_units')::numeric, 0)));
  end if;
  if v_up > 0 then
    return format('Available already excludes the %s hours you have approved and not yet taken.',
                  hr._leave_hours_text(v_up));
  end if;
  return case v_method
    when 'per_pay_period'    then format('You earn %s hours each pay period.',
                                    hr._leave_hours_text(coalesce((p_fig ->> 'accrual_rate')::numeric, 0)))
    when 'per_month'         then format('You earn %s hours each month.',
                                    hr._leave_hours_text(coalesce((p_fig ->> 'accrual_rate')::numeric, 0)))
    when 'annual_lump'       then 'Your whole allowance is granted at the start of each policy year.'
    when 'anniversary_lump'  then 'Your whole allowance is granted on your work anniversary.'
    when 'none'              then 'This balance changes only when your organization grants time.'
    else 'Available is what you can book right now.' end;
end
$function$;

create or replace function hr.leave_request_preview(
  p_employment_id uuid, p_leave_policy_id uuid, p_starts_on date, p_ends_on date,
  p_day_parts jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_view jsonb; v_span jsonb; v_fig jsonb; v_proj jsonb; v_pol hr.leave_policy%rowtype;
  v_words text; v_excl text;
begin
  v_view := hr._leave_viewer(p_employment_id);
  if (v_view ->> 'rung') = 'none' then
    return jsonb_build_object('granted', false, 'reason', v_view ->> 'reason');
  end if;
  if p_ends_on < p_starts_on then
    return jsonb_build_object('granted', false, 'reason','dates_reversed',
      'detail','The end date is before the start date.');
  end if;

  v_pol  := hr._leave_policy_at(p_leave_policy_id);
  v_span := hr.leave_span_hours(p_employment_id, p_starts_on, p_ends_on, p_day_parts);
  v_fig  := hr.leave_figures(p_employment_id, p_leave_policy_id, current_date);
  v_proj := hr.leave_project_balance(p_employment_id, p_leave_policy_id,
                                     greatest(p_starts_on, current_date));

  select string_agg(distinct coalesce(d ->> 'label', 'Non-working day'), ', ')
    into v_excl
    from jsonb_array_elements(v_span -> 'days') d
   where coalesce((d ->> 'excluded')::boolean, false);

  -- §4.1: "a request whose cost the employee cannot see is a request they will dispute" — and a
  -- cost that reads "16. hours" is a cost they will not trust.
  v_words := format('%s day%s selected · %s working day%s · %s hours',
                    (v_span ->> 'calendar_days'),
                    case when (v_span ->> 'calendar_days')::int = 1 then '' else 's' end,
                    (v_span ->> 'working_days'),
                    case when (v_span ->> 'working_days')::int = 1 then '' else 's' end,
                    hr._leave_hours_text((v_span ->> 'total_hours')::numeric));
  if v_excl is not null then
    v_words := v_words || ' · ' || v_excl || ' excluded';
  end if;

  return jsonb_build_object(
    'granted', true, 'span', v_span, 'breakdown_sentence', v_words,
    'figures', v_fig, 'projection', v_proj,
    'policy_name', v_pol.name, 'increment_minutes', v_pol.increment_minutes,
    'mandated_uses', v_pol.mandated_uses,
    'documentation_required_after_days', v_pol.documentation_required_after_days,
    'documentation_required',
      (v_pol.documentation_required_after_days is not null
       and (p_ends_on - p_starts_on) + 1 > v_pol.documentation_required_after_days),
    'submittable', not hr._leave_span_is_costless(v_span),
    'blocker', case when hr._leave_span_is_costless(v_span) then
      'We cannot work out how long your working day is, so this request would cost no time at '
      || 'all. There is no shift scheduled on these days and no standard weekly hours on your '
      || 'position. Ask HR to set your standard hours, or pick days you are scheduled to work.'
      end);
end
$function$;

-- -----------------------------------------------------------------------------------
-- The loud, counted remainder — the other sentence-writers still carry the old format
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_hours_format_debt()
returns table(fn text, raw_uses integer)
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  select n.nspname || '.' || p.proname,
         (length(pg_get_functiondef(p.oid))
          - length(replace(pg_get_functiondef(p.oid), 'FM999999.99', '')))
         / length('FM999999.99')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname like 'leave%' or p.proname like '_leave%')
     and pg_get_functiondef(p.oid) like '%FM999999.99%'
   order by 2 desc, 1;
$function$;

comment on function hr.leave_hours_format_debt() is
  'Counts the leave functions still formatting hours with the format that renders 16 as "16.". '
  'The two an employee reads on the time-off page are fixed; the refusal and adjustment sentences '
  'are not yet. Counted rather than described, so finishing it is a number going to zero.';

do $$
declare v_n integer; v_fns text;
begin
  if hr._leave_hours_text(16) <> '16' then
    raise exception 'hr_l5_14: 16 still renders as %', hr._leave_hours_text(16);
  end if;
  if hr._leave_hours_text(16.5) <> '16.5' then
    raise exception 'hr_l5_14: 16.5 renders as %', hr._leave_hours_text(16.5);
  end if;
  if hr._leave_hours_text(3.08) <> '3.08' then
    raise exception 'hr_l5_14: 3.08 renders as %', hr._leave_hours_text(3.08);
  end if;
  if hr._leave_hours_text(-4) <> '-4' then
    raise exception 'hr_l5_14: -4 renders as %', hr._leave_hours_text(-4);
  end if;
  if hr._leave_hours_text(null) is not null then
    raise exception 'hr_l5_14: a null figure was rendered as text';
  end if;
  -- 0.5 must not lose its leading zero, which the old format also did
  if hr._leave_hours_text(0.5) <> '0.5' then
    raise exception 'hr_l5_14: 0.5 renders as %', hr._leave_hours_text(0.5);
  end if;

  select coalesce(sum(raw_uses), 0), string_agg(fn, ', ' order by fn)
    into v_n, v_fns from hr.leave_hours_format_debt();
  raise notice E'\nhr_l5_14 — hours-format debt: % remaining raw uses in: %\n   (the two sentences on /hr/me/time-off are fixed; these are refusal and adjustment messages.)',
    v_n, coalesce(v_fns, 'none');
end $$;
