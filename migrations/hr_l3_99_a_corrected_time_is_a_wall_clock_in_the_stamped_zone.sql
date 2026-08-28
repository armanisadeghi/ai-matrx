-- hr_l3_99 — the correction dialog's time change actually works, resolved in the STAMPED zone.
--
-- PURPOSE
--   Route 30's primary correction has never worked. The dialog sends
--   `{"occurred_at_local_time": "13:05"}` — a wall-clock time, which is the only thing a manager
--   looking at a timesheet can meaningfully type — and the door's allowed set was
--   ('occurred_at','punch_kind','break_paid','shift_minutes'). Every time change therefore came back
--   `hr_punch_unknown_change_field`. Proven against the live door before this was written; the
--   client's intent was right and the door never implemented it.
--
-- WHY THE CONVERSION IS HERE AND NOT IN THE CLIENT
--   §0 law 6: *"Clients consume, never reimplement… elapsed-hours math live server-side."* And §0
--   law 3: the record's own stamp is the authority, never a recomputation. The punch already carries
--   `tz` and `local_work_date`; the browser's zone is irrelevant and using it is the §9.1 defect
--   ("a manager in New York reviewing a California punch must see California time"). A client that
--   converted 13:05 into an instant would be guessing with the wrong clock.
--
-- 🚨 DST: TWO DAYS A YEAR A WALL CLOCK IS NOT A TIME, AND POSTGRES DOES NOT TELL YOU
--   `(date + time) AT TIME ZONE tz` is silently wrong on both transitions, measured on
--   America/Los_Angeles 2026:
--     · SPRING FORWARD (2026-03-08). 02:30 never happens. Postgres returns 03:30 without complaint —
--       it accepts a time the clock skipped and stores a DIFFERENT time than the one typed.
--     · FALL BACK (2026-11-01). 01:30 happens TWICE, an hour apart. Postgres picks the second
--       (PST) silently; the manager may have meant the first (PDT).
--   Both are the silent-wrong-answer class this lane exists to remove, on the one record type whose
--   whole purpose is being raw evidence of when somebody worked.
--
--   ⚖️ THE SPEC IS SILENT ON THE RESOLUTION, SO THIS MIGRATION DOES NOT INVENT ONE. §9 governs how a
--   DST-affected day is RENDERED (marker, badge, hover sentence) and §0 governs which clock is
--   authoritative, but no clause in SPEC-TIME — or anywhere in the hr-domain corpus, searched — says
--   which of two real instants an ambiguous entry means, or what a nonexistent one becomes. Choosing
--   silently is exactly the defect. So both cases are REFUSED BY NAME, and each refusal names the
--   escape hatch that already exists: `occurred_at`, a full instant, which is unambiguous by
--   construction. A named refusal on two days a year is honest; a silent guess on those days is a
--   wage record that says something nobody typed. When the resolution is ruled, these two branches
--   become that rule and nothing else changes.
--
-- Applied live as `hr_l3_99_a_corrected_time_is_a_wall_clock_in_the_stamped_zone`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · `CREATE OR REPLACE`, NOT DROP+CREATE — the arity is UNCHANGED, so the ACL is preserved and
--     hr_l3_98's trap does not apply here. That is the whole reason this adds a KEY to an existing
--     jsonb parameter rather than a new argument.
--   · RESOLVED AGAINST THE PUNCH'S OWN `local_work_date`, never a date from the client. The door
--     already refuses a correction that crosses the work date; taking the date from the record keeps
--     that guarantee true by construction rather than by a second check.
--   · EXISTENCE IS TESTED BY ROUND-TRIP, not by consulting a DST table: convert to an instant, read
--     it back in the same zone, and compare to what was typed. Anything that fails to round-trip is
--     a local time that zone does not have on that date — which is correct for every zone and every
--     transition rule, including ones that are not one hour and ones that change by legislation.
--   · AMBIGUITY IS TESTED BY ASKING WHETHER AN HOUR EARLIER IS THE SAME WALL CLOCK. Two instants
--     mapping to one wall clock is precisely a fall-back overlap, and the test needs no zone table.

do $mig$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_correct';
  if v_src is null then
    raise exception 'hr_l3_99: hr.punch_correct not found';
  end if;
  if position('occurred_at_local_time' in v_src) > 0 then
    return;   -- already applied
  end if;
  v_new := v_src;

  -- 1. declarations
  v_new := replace(v_new,
    $q$  v_bad_keys  text[];$q$,
    $q$  v_bad_keys  text[];
  v_local     time;          -- hr_l3_99: the wall clock a manager typed
  v_alt       timestamptz;   -- hr_l3_99: the OTHER instant, when a wall clock has two$q$);

  -- 2. the field is a legal thing to change
  v_new := replace(v_new,
    $q$     where kk not in ('occurred_at','punch_kind','break_paid','shift_minutes');$q$,
    $q$     where kk not in ('occurred_at','occurred_at_local_time','punch_kind','break_paid','shift_minutes');$q$);
  v_new := replace(v_new,
    $q$                           'allowed', jsonb_build_array('occurred_at','punch_kind','break_paid','shift_minutes')));$q$,
    $q$                           'allowed', jsonb_build_array('occurred_at','occurred_at_local_time','punch_kind','break_paid','shift_minutes')));$q$);

  -- 3. resolve it, in the punch's OWN zone, and refuse what a wall clock cannot mean
  v_new := replace(v_new,
    $q$    if v_vals ? 'occurred_at' then
      v_new_at := (v_vals ->> 'occurred_at')::timestamptz;
    elsif v_vals ? 'shift_minutes' then$q$,
    $q$    if v_vals ? 'occurred_at' then
      v_new_at := (v_vals ->> 'occurred_at')::timestamptz;
    elsif v_vals ? 'occurred_at_local_time' then
      -- hr_l3_99: a WALL CLOCK on this punch's own work date, read in this punch's own stamped
      -- zone (§0 law 3, §9 rule 1). Never the caller's zone and never today's date.
      v_local := (v_vals ->> 'occurred_at_local_time')::time;
      v_new_at := (v_p.local_work_date + v_local) at time zone v_p.tz;

      -- Does that wall clock EXIST on that date in that zone? On a spring-forward day the skipped
      -- hour does not, and Postgres silently returns the hour after it instead of saying so.
      if ((v_new_at at time zone v_p.tz)::time) <> v_local then
        return hr._punch_refusal('hr_punch_local_time_does_not_exist',
          'There is no ' || to_char(v_local, 'HH24:MI') || ' on ' || v_p.local_work_date::text
          || ' in ' || v_p.tz || ' — the clocks moved forward and that hour was skipped. Give the '
          || 'exact instant instead.',
          jsonb_build_object('given_local_time', to_char(v_local, 'HH24:MI'),
                             'local_work_date', v_p.local_work_date, 'tz', v_p.tz,
                             'would_have_become', to_char(v_new_at at time zone v_p.tz, 'HH24:MI'),
                             'door', 'occurred_at'));
      end if;

      -- Does it happen TWICE? On a fall-back day the repeated hour does, and the two are an hour
      -- apart in real time. Choosing one silently would record an instant nobody stated.
      v_alt := v_new_at - interval '1 hour';
      if ((v_alt at time zone v_p.tz)::time) = v_local then
        return hr._punch_refusal('hr_punch_local_time_is_ambiguous',
          to_char(v_local, 'HH24:MI') || ' happens twice on ' || v_p.local_work_date::text || ' in '
          || v_p.tz || ' — the clocks went back, so that wall clock is two different moments an '
          || 'hour apart. Give the exact instant instead.',
          jsonb_build_object('given_local_time', to_char(v_local, 'HH24:MI'),
                             'local_work_date', v_p.local_work_date, 'tz', v_p.tz,
                             'candidates', jsonb_build_array(v_alt, v_new_at),
                             'door', 'occurred_at'));
      end if;
    elsif v_vals ? 'shift_minutes' then$q$);

  execute v_new;
end
$mig$;

-- ── STRUCTURAL SELF-CHECK ────────────────────────────────────────────────────────────────────────
do $chk$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_correct';
  if position('hr_punch_local_time_does_not_exist' in v_src) = 0
     or position('hr_punch_local_time_is_ambiguous' in v_src) = 0 then
    raise exception 'hr_l3_99: the DST refusals did not land';
  end if;
  if position($q$'occurred_at','occurred_at_local_time','punch_kind'$q$ in v_src) = 0 then
    raise exception 'hr_l3_99: occurred_at_local_time is still not an allowed change field';
  end if;
  -- hr_l3_97/98 must survive this re-emit.
  if position('hr_punch_reason_category_unknown' in v_src) = 0
     or position('entered_reason_category_id' in v_src) = 0 then
    raise exception 'hr_l3_99: hr_l3_97 was LOST in the re-emit';
  end if;
  -- The arity did not change, so the ACL is preserved -- assert it rather than trust it.
  if has_function_privilege('anon', 'hr.punch_correct(uuid[],jsonb,text,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'hr.punch_correct(uuid[],jsonb,text,uuid)', 'EXECUTE') then
    raise exception 'hr_l3_99: the re-emit restored a client grant on the inner function';
  end if;
end
$chk$;

update hr.function_contract
   set must_contain = array['hr_punch_reason_category_unknown', 'entered_reason_category_id',
                            'hr_punch_local_time_does_not_exist', 'hr_punch_local_time_is_ambiguous']
 where schema_name = 'hr' and function_name = 'punch_correct' and is_active;
