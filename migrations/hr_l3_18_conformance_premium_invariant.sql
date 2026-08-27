-- HR domain L3 — migration 18 (register item HRB-015, lane L3 punch + kiosk).
--
-- THE PREMIUM INVARIANT, PINNED AS A STANDING DATA CHECK RATHER THAN AS TWO CODE GUARDS.
--
-- Two functions may legitimately write a statutory premium for the same exception -
-- `hr.recompute_apply` and `hr.attendance_exception_resolve` - and both now refuse to double-write.
-- But both refusals are PREDICATES INSIDE CODE, and this batch found two ways the invariant broke
-- anyway without either predicate being wrong:
--   * hr_l3_13c - a recompute shipping no intervals retired the premium it had just skipped;
--   * hr_l3_13e - once the exception was RESOLVED it left the premium loop's scan set entirely, so
--     the next ordinary recompute of worked hours wiped every premium on the day.
-- Neither was visible to a guard that only asks "am I about to write a second line?". Both were
-- visible immediately in the DATA: the number of current premium lines for a (employment, day,
-- earning code) went to 2, or to 0 when one was owed.
--
-- So check 13 asserts the invariant over the rows themselves: at most ONE current `premium_only`
-- interval per (employment_id, local_work_date, earning_code_id). It is agnostic about which
-- function wrote what, which is exactly why it survives a change to either writer.
--
-- It is deliberately NOT "at most one premium per day": SPEC-TIME 4.3 requires a meal premium and a
-- rest premium on one day to be TWO lines, never merged. The earning code is in the key for that
-- reason, and merging them would hide one statutory violation inside another.
--
-- 🚨 WHAT THIS CHECK CANNOT SEE, STATED SO NOBODY READS MORE INTO A GREEN THAN IS THERE: it catches
-- a DOUBLE premium, not a MISSING one. A premium that is owed and was never written, or was
-- retired by a future regression of the 13e class, leaves zero rows and looks identical to a day
-- that owed nothing. Detecting the missing direction needs the open-exception set joined against
-- current premiums, which belongs to the exception lane's own reads, not here.
--
-- Applied live as `hr_l3_18_conformance_premium_invariant`. Idempotent.

do $outer$
declare
  v_def text;
  v_anchor constant text :=
'  ---------------------------------------------------------------- 9. the writer is a hardened definer';
  v_block constant text :=
'  ---------------------------------------------------------------- 13. at most ONE current premium per day per code
  check_key := ''premium_line_not_doubled'';
  select coalesce(jsonb_agg(jsonb_build_object(
           ''employment_id'', employment_id, ''local_work_date'', local_work_date,
           ''earning_code_id'', earning_code_id, ''current_lines'', n) order by local_work_date), ''[]''::jsonb)
    into v_bad
    from (select w.employment_id, w.local_work_date, w.earning_code_id, count(*) as n
            from hr.work_interval w
           where w.is_current and w.interval_kind = ''premium_only''
           group by w.employment_id, w.local_work_date, w.earning_code_id
          having count(*) > 1) z;
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''doubled'', v_bad,
                ''writers'', jsonb_build_array(''hr.recompute_apply'', ''hr.attendance_exception_resolve''),
                ''key'', ''(employment_id, local_work_date, earning_code_id)'',
                ''why'', ''Two sanctioned writers can emit a premium for the same exception and both ''
                    || ''refuse to double-write, but two regressions in this batch broke the invariant ''
                    || ''without either refusal being wrong. This asserts it over the ROWS, so it ''
                    || ''survives a change to either writer.'',
                ''deliberately_not'', ''at most one premium per DAY - SPEC-TIME 4.3 requires a meal ''
                    || ''premium and a rest premium on one day to be two lines, never merged.'',
                ''does_not_detect'', ''a MISSING premium. Zero rows looks the same as nothing owed; ''
                    || ''the owed-but-absent direction belongs to the exception lane reads.'');
  return next;

  ---------------------------------------------------------------- 9. the writer is a hardened definer';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.punch_write_path_conformance()'::regprocedure;
  if position('premium_line_not_doubled' in v_def) > 0 then
    raise notice 'hr_l3_18: already applied'; return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_18: anchor not found';
  end if;
  execute replace(v_def, v_anchor, v_block);
end $outer$;

do $$
declare v_fail text; v_n int;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n <> 13 then raise exception 'hr_l3_18: expected 13 checks, found %', v_n; end if;
  select string_agg(check_key, ', ') into v_fail
    from hr.punch_write_path_conformance() where not ok;
  if v_fail is not null then
    raise exception 'hr_l3_18: the conformance gate is RED: %', v_fail;
  end if;
end $$;
