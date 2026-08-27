-- HR domain L3 — migration 21 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 AN UNKNOWN FILTER KEY IS NOW REFUSED BY NAME, NEVER IGNORED.
--
-- Both list surfaces silently dropped filter keys they did not recognise. A misspelled axis -
-- `severities`, `employmentId`, `pay_period`, `exception_kinds` - therefore did not narrow
-- anything, and the caller got a BROADER result set that looks authoritative. On an exceptions
-- queue that means a manager reviewing "the violations in this period" is shown every open
-- exception in the organization and has no way to tell the filter did not apply. On the punch
-- register it means an evidence pull that reads as scoped and is not. Returning MORE than was
-- asked for, with no signal, is the silent-failure class this program kills on sight.
--
-- Ruled for `hr.attendance_exception_list` by the coordinator. Applied here to `hr.punch_register`
-- as well, on the same reasoning and in the same change: it is this lane's own function, it had the
-- identical gap, and fixing one while knowingly leaving the other would be inconsistent about a
-- rule that is now settled.
--
-- The refusal names BOTH halves - the offending keys AND the legal axes - because a caller who
-- misspelled one needs to see the spelling that works, not just that theirs did not.
--
-- 🚨 THE CHECK RUNS FIRST, BEFORE ANY AUTHORITY OR PAGING WORK. A bad request should cost nothing
-- and should not be able to probe anything: refusing a typo must not depend on who is asking, and
-- must not be reachable only after a capability check that might refuse for a different reason.
--
-- Applied live as `hr_l3_21_unknown_filter_axis_refusal`. Idempotent.

-- ---------------------------------------------------------------------------------
-- 1. hr.attendance_exception_list
-- ---------------------------------------------------------------------------------
do $outer$
declare
  v_def text;
  v_from text;
  v_to   text;
  v_axes text := '''resolution_state'',''exception_kind'',''severity'',''employment_id'',''from'',''to'',''work_location_id'',''affects_unapproved_period'',''pay_period_id''';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.attendance_exception_list(jsonb,jsonb)'::regprocedure;

  if position('hr_unknown_filter_axis' in v_def) > 0 then
    raise notice 'hr_l3_21: exception_list already applied';
  else
    v_from := '  pg := hr._time_page(p_page);';
    v_to := concat(
      '  -- hr_l3_21: an unknown filter key is REFUSED BY NAME, never ignored. A misspelled axis that', chr(10),
      '  -- is silently dropped returns a BROADER result set that looks authoritative.', chr(10),
      '  if exists (select 1 from jsonb_object_keys(f) k where k not in (', v_axes, ')) then', chr(10),
      '    return hr._time_refusal(''hr_unknown_filter_axis'',', chr(10),
      '      ''That filter names an axis this queue does not have. Nothing was returned, because a ''', chr(10),
      '      || ''misspelled axis must never quietly widen the result set.'',', chr(10),
      '      jsonb_build_object(', chr(10),
      '        ''unknown_axes'', (select jsonb_agg(k order by k) from jsonb_object_keys(f) k', chr(10),
      '                            where k not in (', v_axes, ')),', chr(10),
      '        ''legal_axes'', jsonb_build_array(', v_axes, ')));', chr(10),
      '  end if;', chr(10), chr(10),
      '  pg := hr._time_page(p_page);');

    if position(v_from in v_def) = 0 then
      raise exception 'hr_l3_21: the paging anchor was not found in attendance_exception_list';
    end if;
    execute replace(v_def, v_from, v_to);
  end if;
end $outer$;

-- ---------------------------------------------------------------------------------
-- 2. hr.punch_register — same ruling, this lane's own function
-- ---------------------------------------------------------------------------------
do $outer$
declare
  v_def text;
  v_from text;
  v_to   text;
  v_axes text := '''employment_ids'',''organization_id'',''from'',''to'',''punch_kinds'',''sources'',''actor_types'',''work_location_ids'',''duplicate_suspected_only''';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.punch_register(jsonb,jsonb)'::regprocedure;

  if position('hr_unknown_filter_axis' in v_def) > 0 then
    raise notice 'hr_l3_21: punch_register already applied';
    return;
  end if;

  v_from := '  v_mine    := hr.employments_of(v_uid, current_date);';
  v_to := concat(
    '  v_mine    := hr.employments_of(v_uid, current_date);', chr(10), chr(10),
    '  -- hr_l3_21: an unknown filter key is REFUSED BY NAME. An evidence pull that reads as scoped', chr(10),
    '  -- and is not is worse than one that returns nothing.', chr(10),
    '  if exists (select 1 from jsonb_object_keys(p_filters) k where k not in (', v_axes, ')) then', chr(10),
    '    return hr._punch_refusal(''hr_unknown_filter_axis'',', chr(10),
    '      ''That filter names an axis the punch register does not have. Nothing was returned, ''', chr(10),
    '      || ''because a misspelled axis must never quietly widen an evidence pull.'',', chr(10),
    '      jsonb_build_object(', chr(10),
    '        ''unknown_axes'', (select jsonb_agg(k order by k) from jsonb_object_keys(p_filters) k', chr(10),
    '                            where k not in (', v_axes, ')),', chr(10),
    '        ''legal_axes'', jsonb_build_array(', v_axes, ')));', chr(10),
    '  end if;');

  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_21: the v_mine anchor was not found in punch_register';
  end if;
  execute replace(v_def, v_from, v_to);
end $outer$;

do $$
declare v_a text; v_p text;
begin
  v_a := pg_get_functiondef('hr.attendance_exception_list(jsonb,jsonb)'::regprocedure);
  v_p := pg_get_functiondef('hr.punch_register(jsonb,jsonb)'::regprocedure);
  if v_a not like '%hr_unknown_filter_axis%' then
    raise exception 'hr_l3_21: attendance_exception_list has no unknown-axis refusal';
  end if;
  if v_p not like '%hr_unknown_filter_axis%' then
    raise exception 'hr_l3_21: punch_register has no unknown-axis refusal';
  end if;
  -- every legal axis the function actually reads must be in its own allowlist, or a real filter
  -- would start refusing. pay_period_id is the one just shipped; prove it survived.
  if v_a not like '%''pay_period_id''%' then
    raise exception 'hr_l3_21: pay_period_id is missing from the legal axis list';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) > 0 then
    raise exception 'hr_l3_21: the conformance gate went RED';
  end if;
end $$;
