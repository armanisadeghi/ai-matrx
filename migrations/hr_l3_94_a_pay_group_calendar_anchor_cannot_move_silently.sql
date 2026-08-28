-- hr_l3_94 — `first_period_start_on` stops being silently discarded on update.
--
-- PURPOSE
--   `public.hr_pay_group_upsert` accepts `first_period_start_on` on CREATE and lays the whole period
--   calendar down from it. On UPDATE the column is simply ABSENT from the SET list, so the field is
--   dropped on the floor and the door returns `{"ok": true, "existing_workweeks_recut": false}`. A
--   success envelope for an apply that did not happen — the recorded-as-happened class.
--
--   Measured cost, on the author of this migration: staging a fixture needed a period window ending
--   2026-08-27. The group's anchor was wrong, the update reported `ok`, nothing changed, and the only
--   way forward was to abandon that group and create a second one. `32b48bf2-a0ad-46f1-847d-
--   158241493da3` exists in this database for exactly that reason and for no other.
--
-- WHICH WORLD — MUTABLE BEFORE GENERATION, LOCKED AFTER, NEVER SILENT
--   SPEC-TIME §1.3 / §7.1: `hr.pay_period_generate` "generates the gap-free period sequence for one
--   pay group FROM its `first_period_start_on`", and is "idempotent — re-running extends the sequence
--   and never duplicates or RE-CUTS an existing period." Those two sentences settle it. Once periods
--   exist they were cut from the anchor and will never be re-cut, so moving the anchor leaves a group
--   whose stored calendar no longer derives from its own anchor — the next generate would lay a
--   second, mis-phased sequence beside the first. Before any period exists nothing derives from it
--   and changing it costs nothing.
--
--   So the field is NOT flatly immutable, and refusing every update would be its own lie. The rule is
--   conditional on whether the calendar has been cut yet, and the refusal NAMES the condition.
--
--   This is the same shape as the guard already in this function directly above: §2.4 route 70
--   refuses a workweek-start change without a future effective date because "existing workweeks are
--   not re-cut". Same invariant, same reasoning, one branch further along.
--
-- Applied live as `hr_l3_94_a_pay_group_calendar_anchor_cannot_move_silently`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · SURGICAL REWRITE, NOT A RE-EMIT OF THE WHOLE BODY. `hr_pay_group_upsert` is a settings door
--     owned by the Employees lane and edited concurrently; re-emitting the body I happened to read
--     would silently discard whatever landed in between. Each of the three edits is applied by
--     `replace()` on an anchor string and each is guarded by a `position()` test, so re-applying is a
--     no-op and a concurrent edit elsewhere in the body survives untouched.
--   · THE REFUSAL FIRES ONLY ON AN ACTUAL CHANGE (`is distinct from`). Re-sending a payload that
--     carries the SAME anchor is how every idempotent caller behaves, including the fixture scripts
--     in `scripts/hr/`; making that refuse would convert this fix into a different outage.
--   · THE REFUSAL RUNS BEFORE `hr.arm_write()`. A door that refuses must not have armed a write.
--   · THE DENIAL NAMES THE WAY OUT, not just the wall: create a new pay group with the anchor you
--     want and move the employments with `hr_employment_set_pay_group`. That is the route the author
--     was forced to discover by hand; a denial that withholds it charges the next caller the same
--     hour.
--   · `pay_frequency` IS STILL APPLIED ON UPDATE AND IS NOT TOUCHED HERE. It carries the identical
--     hazard — a weekly calendar re-declared monthly after periods exist — but it is a DANGEROUS
--     APPLY, not a silent ignore, so it is a different defect with a different owner and a different
--     ruling. Widening this migration to cover it would change behaviour the settings surface may
--     depend on, unannounced. Reported instead.

do $mig$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_pay_group_upsert';
  if v_src is null then
    raise exception 'hr_l3_94: public.hr_pay_group_upsert(jsonb) not found';
  end if;
  v_new := v_src;

  ---------------------------------------------------------------- 1. declarations
  if position('v_anchor date' in v_new) = 0 then
    v_new := replace(v_new,
      $q$  v_ww_from date; v_cur_from date; v_cur_dow smallint;$q$,
      $q$  v_ww_from date; v_cur_from date; v_cur_dow smallint;
  v_anchor date; v_cur_anchor date; v_periods integer;$q$);
  end if;

  ---------------------------------------------------------------- 2. the guard, before any write
  if position('pay_group_calendar_anchor_locked' in v_new) = 0 then
    v_new := replace(v_new,
      $q$  perform hr.arm_write();$q$,
      $q$  -- 🚨 hr_l3_94: THE ANCHOR THE CALENDAR WAS CUT FROM CANNOT MOVE UNDER THE CALENDAR.
  -- This field used to be accepted here and then dropped: it is set by the INSERT below and was
  -- absent from the UPDATE's SET list, so an edit returned ok and changed nothing. Periods are
  -- generated FROM this date and are never re-cut (SPEC-TIME §1.3), so once any period exists the
  -- anchor is load-bearing history; before that it is free.
  v_anchor := nullif(p_payload ->> 'first_period_start_on','')::date;
  if v_id is not null and v_anchor is not null then
    select pg.first_period_start_on into v_cur_anchor
      from hr.pay_group pg where pg.id = v_id;
    -- Only an actual CHANGE is refused; re-sending the same anchor is what idempotent callers do.
    if v_anchor is distinct from v_cur_anchor then
      select count(*) into v_periods from hr.pay_period pp where pp.pay_group_id = v_id;
      if v_periods > 0 then
        return jsonb_build_object('ok', false,
          'reason', 'pay_group_calendar_anchor_locked',
          'field', 'first_period_start_on',
          'current_first_period_start_on', v_cur_anchor,
          'requested_first_period_start_on', v_anchor,
          'periods_generated', v_periods,
          'detail', 'This pay group already has ' || v_periods::text || ' pay period(s) cut from '
                 || v_cur_anchor::text || '. Periods are never re-cut, so the date they were cut '
                 || 'from cannot move — the stored calendar would stop matching its own anchor. To '
                 || 'run a different calendar, create a new pay group starting on the date you want '
                 || 'and move the employments onto it with hr_employment_set_pay_group.');
      end if;
    end if;
  end if;

  perform hr.arm_write();$q$);
  end if;

  ---------------------------------------------------------------- 3. the UPDATE actually applies it
  if position('first_period_start_on = coalesce(v_anchor' in v_new) = 0 then
    v_new := replace(v_new,
      $q$    update hr.pay_group set
      name = coalesce($q$,
      $q$    update hr.pay_group set
      first_period_start_on = coalesce(v_anchor, first_period_start_on),
      name = coalesce($q$);
  end if;

  execute v_new;
end
$mig$;

-- ── STRUCTURAL SELF-CHECK: all three edits are present, or this migration did nothing. ───────────
do $chk$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_pay_group_upsert';
  if position('v_anchor date' in v_src) = 0 then
    raise exception 'hr_l3_94: the declaration did not land';
  end if;
  if position('pay_group_calendar_anchor_locked' in v_src) = 0 then
    raise exception 'hr_l3_94: the refusal did not land';
  end if;
  if position('first_period_start_on = coalesce(v_anchor' in v_src) = 0 then
    raise exception 'hr_l3_94: the UPDATE still does not apply first_period_start_on';
  end if;
  -- The door must still resolve to exactly one signature (check 34's property, asserted locally
  -- because a CREATE OR REPLACE with a changed arity would OVERLOAD rather than replace, and
  -- PostgREST answers PGRST203 to an ambiguous door — a silent outage.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_pay_group_upsert') <> 1 then
    raise exception 'hr_l3_94: hr_pay_group_upsert no longer resolves to one signature';
  end if;
end
$chk$;

-- ── THE CONTRACT ROW: this edit must not be discardable by a later re-emit (hr_l3_79). ───────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer, overloads_intended)
values
  ('public', 'hr_pay_group_upsert',
   'hr_l3_94_a_pay_group_calendar_anchor_cannot_move_silently',
   array['pay_group_calendar_anchor_locked', 'first_period_start_on = coalesce(v_anchor'],
   array[]::text[],
   'first_period_start_on is set by the INSERT branch and was absent from the UPDATE branch, so '
   || 'editing it returned ok and changed nothing — a success envelope for an apply that did not '
   || 'happen. The update now applies it, and refuses BY NAME once any pay period has been cut from '
   || 'it, because periods are generated from this date and are never re-cut (SPEC-TIME §1.3). A '
   || 're-emit of this function that drops either half restores a silent data-loss door.',
   true, true, false)
on conflict do nothing;
