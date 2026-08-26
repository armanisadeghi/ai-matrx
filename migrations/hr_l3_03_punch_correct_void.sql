-- HR domain L3 — migration 3 of 7 (register item HRB-015, lane L3 punch + kiosk).
--
-- `hr.punch_correct` (void + replacement, over a SET of punches sharing one reason) and
-- `hr.punch_void` (the duplicate case, no replacement). Plus the chain-legality simulator they
-- both refuse on, and the punch-edited notification that is not org-overridable.
--
-- Authority: SPEC-TIME §1.1, §4.1 (Arman's ruling, 2026-08-25), §12, §14 D7;
--            SPEC-DATA-MODEL §7.1, §7.3; SPEC-ACCESS §4.2;
--            R-L3-READINESS L3-08, L3-09, L3-40.
-- Applied live as `hr_l3_03_punch_correct_void`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE SIGNATURE TAKES AN ARRAY, AND THE AUDIT-TRAIL COUNT ALWAYS EQUALS THE PUNCH COUNT.
--    SPEC-TIME §1.1 writes `hr.punch_correct(p_punch_id, …)`; §4.1's ruling — later, and Arman's —
--    requires a manager fixing the same clock-in error across nine days to perform ONE reasoned
--    action with ONE reason and NINE audit trails. A scalar signature cannot express that, so the
--    parameter is `p_punch_ids uuid[]`. The returned `audit_trails` figure is asserted equal to
--    `cardinality(voided_punch_ids)` before the function returns, so "one quiet action with one
--    audit trail" is unrepresentable rather than merely discouraged.
--    **AMENDMENT OWED: SPEC-TIME §1.1's row still shows the scalar.**
--
-- 2. `p_new_values` ACCEPTS A PER-PUNCH MAP *OR* ONE OBJECT FOR THE WHOLE SET, BECAUSE THE BULK
--    CASE IS THE REASON THE ARRAY EXISTS. Nine days of the same 15-minute clock-in error do not
--    share an `occurred_at`; they share a DELTA. So the object understands
--    `{"shift_minutes": -15}` (relative, applied to every punch) as well as absolute
--    `{"occurred_at": …, "punch_kind": …, "break_paid": …}`, and a top-level key that parses as one
--    of the punch ids switches the whole payload into per-punch mode. Any other key is refused by
--    name rather than ignored — silently dropping a field the caller believed they set is how a
--    manager comes to think they fixed something they did not.
--
-- 3. 🚨 THE CHAIN IS SIMULATED BEFORE ANYTHING IS WRITTEN, AND THE REFUSAL NAMES THE CONFLICT.
--    `hr._punch_chain_conflict` replays the affected day with the voids removed and the
--    replacements inserted, walking the same state machine `hr.punch_record` enforces — through the
--    SAME `hr._punch_next_state` function, so the two can never drift. A `meal_end` before its
--    `meal_start`, or a `clock_out` before its `clock_in`, comes back as a sentence naming the
--    punch and the time, not as "invalid".
--
-- 4. A CORRECTION NEVER MOVES A PUNCH ACROSS `local_work_date`. Recomputing the stamp from the new
--    instant and comparing is the whole check; when they differ the refusal says, in words, that
--    the fix is a void plus a new punch on the correct day, and hands back both dates.
--
-- 5. THE PERIOD LOCK IS A TYPED REFUSAL THAT ROUTES, NOT A DEAD END. `locked`/`closed` returns
--    `hr_period_locked` (the `423` semantics of SPEC-CONTRACTS) naming the period, its state, and
--    `hr.time_adjustment_create` as the door. `exported` is NOT a lock — SPEC-DATA-MODEL §7.3's
--    machine has `exported` before `locked`, and refusing there would block a correction the spec
--    explicitly expects to still be possible.
--
-- 6. 🚨 THE EMPLOYEE IS NOTIFIED, ALWAYS, AND THE ROW IS WRITTEN EVEN WHEN THE EVENT TYPE IS NOT
--    SEEDED YET. §4.1's ruling makes `hr.time.punch_edited` non-org-overridable: a silently edited
--    timecard is a wage claim. Skipping the notification until the vocabulary lands would make the
--    law conditional on a seed, so the writer falls back to `in_app` and writes anyway.
--    `hr.punch_edit_notify_debt()` reports the state.
--
--    🚨 **AMENDED 2026-08-26 (builder SQL-1) — THE CHANNEL SHAPE, AND WHY THIS FILE HAD TO CHANGE.**
--    As first written this function read `default_channels` with `jsonb_array_elements_text`. Two
--    things then happened: `hr_l10_01_notification_channel_shape.sql` made that column an OBJECT
--    (`{"in_app":true,…}`) under a CHECK, and `hr_l3_22_notification_events.sql` seeded the 26
--    `hr.time.*` rows. From that moment the array read raised `22023 cannot extract elements from an
--    object` — proven live — so EVERY `hr.punch_correct` and `hr.punch_void` call failed before it
--    could return. `hr_l10_02_notify_channel_readers.sql` repaired the LIVE body by a surgical
--    prosrc rewrite, but **this file still carried the array read, so re-applying it re-broke the
--    lane.** The body below now calls `hr._notify_channels(event_key, org)` — the ONE shared
--    resolver, hr_l10_02's — and this lane keeps no second copy of it. Corrective applied live as
--    `hr_l3_03a_punch_notify_uses_shared_resolver`.
--
-- 7. THIS LANE DOES NOT RECOMPUTE. `hr.work_interval` is written by the recompute engine (E-11,
--    another lane). `punch_correct` returns the affected interval rows marked `is_stale` with the
--    recompute door named, rather than fabricating figures or silently returning the pre-edit ones
--    as if they were current. Superseding them here would be this lane writing computed hours,
--    which §0 law 2 and law 4 both forbid it.
--
-- 8. EXCEPTIONS ATTACHED TO A VOIDED PUNCH ARE CLOSED AS `corrected`, AND NOTHING ELSE IS TOUCHED.
--    The scope is deliberately narrow — `punch_id = <a punch this very call voided>` — so this can
--    never collide with `hr.attendance_exception_resolve`'s general lane.
-- ===================================================================================

-- -----------------------------------------------------------------------------------
-- 1. One state machine, used by both the writer and the simulator (decision 3)
-- -----------------------------------------------------------------------------------

create or replace function hr._punch_next_state(p_state text, p_kind text, p_break_paid boolean)
returns text
language sql
immutable
as $$
  select case p_kind
    when 'clock_in'    then 'clocked_in'
    when 'transfer'    then 'clocked_in'
    when 'break_end'   then 'clocked_in'
    when 'meal_end'    then 'clocked_in'
    when 'clock_out'   then 'clocked_out'
    when 'break_start' then case when coalesce(p_break_paid, true) then 'on_paid_break' else 'on_unpaid_break' end
    when 'meal_start'  then 'on_meal'
    else p_state end;
$$;

-- Re-pointed at the shared machine so the projection and the simulator cannot drift.
create or replace function hr._punch_state_of(p_employment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare r record; v_state text := 'clocked_out';
begin
  for r in select * from hr._punch_open_chain(p_employment_id) loop
    v_state := hr._punch_next_state(v_state, r.punch_kind, r.break_paid);
  end loop;
  return v_state;
end
$$;

-- -----------------------------------------------------------------------------------
-- 2. The chain simulator — returns NULL when legal, a NAMED conflict sentence otherwise
-- -----------------------------------------------------------------------------------

create or replace function hr._punch_chain_conflict(
  p_employment_id uuid, p_date date, p_void_ids uuid[], p_add jsonb)
returns text
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare
  r record; v_state text := 'clocked_out'; v_tz text; v_prior record;
begin
  select p.tz into v_tz from hr.punch p
   where p.employment_id = p_employment_id and p.local_work_date = p_date limit 1;
  v_tz := coalesce(v_tz, 'UTC');

  -- the state the day INHERITS from the previous day's tail (a cross-midnight shift is one chain)
  select p.punch_kind, p.break_paid into v_prior
    from hr.punch p
   where p.employment_id = p_employment_id
     and p.voided_at is null
     and not (p.id = any(coalesce(p_void_ids, '{}'::uuid[])))
     and p.local_work_date < p_date
   order by p.occurred_at desc, hr._punch_kind_rank(p.punch_kind) desc
   limit 1;
  if found then
    v_state := hr._punch_next_state('clocked_out', v_prior.punch_kind, v_prior.break_paid);
  end if;

  for r in
    select k, at, bp from (
      select p.punch_kind as k, p.occurred_at as at, p.break_paid as bp
        from hr.punch p
       where p.employment_id = p_employment_id
         and p.local_work_date = p_date
         and p.voided_at is null
         and not (p.id = any(coalesce(p_void_ids, '{}'::uuid[])))
      union all
      select a ->> 'punch_kind', (a ->> 'occurred_at')::timestamptz, (a ->> 'break_paid')::boolean
        from jsonb_array_elements(coalesce(p_add, '[]'::jsonb)) a
    ) s
    order by at, hr._punch_kind_rank(k)
  loop
    if not (r.k = any(hr._punch_allowed_kinds(v_state))) then
      return case
        when r.k = 'meal_end'  and v_state <> 'on_meal' then
          'A meal end at ' || to_char(r.at at time zone v_tz, 'HH12:MI AM') ||
          ' has no meal start before it.'
        when r.k = 'break_end' and v_state not in ('on_paid_break','on_unpaid_break') then
          'A break end at ' || to_char(r.at at time zone v_tz, 'HH12:MI AM') ||
          ' has no break start before it.'
        when r.k = 'clock_out' and v_state = 'clocked_out' then
          'A clock out at ' || to_char(r.at at time zone v_tz, 'HH12:MI AM') ||
          ' has no clock in before it.'
        when r.k = 'clock_in'  and v_state <> 'clocked_out' then
          'A clock in at ' || to_char(r.at at time zone v_tz, 'HH12:MI AM') ||
          ' lands while the employee is already ' || replace(v_state, '_', ' ') || '.'
        else
          'A ' || replace(r.k, '_', ' ') || ' at ' || to_char(r.at at time zone v_tz, 'HH12:MI AM') ||
          ' is not possible while the day is ' || replace(v_state, '_', ' ') || ' at that point.'
      end;
    end if;
    v_state := hr._punch_next_state(v_state, r.k, r.bp);
  end loop;
  return null;
end
$$;

-- -----------------------------------------------------------------------------------
-- 3. The period-lock predicate (decision 5)
-- -----------------------------------------------------------------------------------

create or replace function hr._punch_period_lock(p_employment_id uuid, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare v_pp hr.pay_period%rowtype;
begin
  select pp.* into v_pp
    from hr.pay_period pp
    join hr.employment em on em.pay_group_id = pp.pay_group_id
   where em.id = p_employment_id
     and pp.period_start_on <= p_date and pp.period_end_on >= p_date
   order by pp.sequence_number desc limit 1;
  if not found then
    return jsonb_build_object('locked', false, 'pay_period_id', null);
  end if;
  return jsonb_build_object(
    'locked', v_pp.state in ('locked','closed'),
    'pay_period_id', v_pp.id, 'state', v_pp.state,
    'period_start_on', v_pp.period_start_on, 'period_end_on', v_pp.period_end_on);
end
$$;

-- -----------------------------------------------------------------------------------
-- 4. The punch-edited notification (decision 6) — a law, not a preference
-- -----------------------------------------------------------------------------------

create or replace function hr._punch_notify_edited(
  p_organization_id uuid, p_employment_id uuid,
  p_voided_punch_id uuid, p_replacement_punch_id uuid,
  p_reason text, p_actor_user uuid, p_change jsonb)
returns integer
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_user uuid; v_channels text[]; v_basis text; ch text; v_n integer := 0;
  v_payload jsonb; v_link text;
begin
  select e.login_user_id into v_user
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where em.id = p_employment_id;
  if v_user is null then return 0; end if;      -- nobody to reach; the punch row still records it

  -- THE ONE RESOLVER (hr_l10_02). ARRAY['in_app'] for an unregistered event, '{}' when every
  -- channel is explicitly off.
  v_channels := hr._notify_channels('hr.time.punch_edited', p_organization_id);
  if v_channels is null or cardinality(v_channels) = 0 then
    v_channels := array['in_app']; v_basis := 'law_overrides_empty_channel_set';   -- RD 4
  else
    v_basis := 'notify_channels_resolver';
  end if;

  v_link := '/hr/me/timesheet?punch=' || coalesce(p_replacement_punch_id, p_voided_punch_id)::text;
  v_payload := jsonb_build_object(
    'voided_punch_id', p_voided_punch_id,
    'replacement_punch_id', p_replacement_punch_id,
    'reason', p_reason,
    'changed_by_user_id', p_actor_user,
    'change', p_change,
    'channel_basis', v_basis,
    'org_overridable', false,
    'deep_link', v_link);

  foreach ch in array v_channels loop
    insert into communication.notification
      (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
       target_kind, target_id, deep_link, dedupe_key, visibility)
    values (p_organization_id, 'hr.time.punch_edited', v_user, 'user', ch, v_payload,
            'hr_punch', coalesce(p_replacement_punch_id, p_voided_punch_id), v_link,
            'hrpunchedit:' || p_voided_punch_id::text || ':' || ch,
            'personal'::platform.visibility)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

create or replace function hr.punch_edit_notify_debt()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'event_key', 'hr.time.punch_edited',
    'seeded', exists (select 1 from communication.notification_event_type
                       where event_key = 'hr.time.punch_edited' and deleted_at is null),
    'resolved_channels', to_jsonb(hr._notify_channels('hr.time.punch_edited', null)),
    'fallback_channels', '["in_app"]'::jsonb,
    'resolver', 'hr._notify_channels (hr_l10_02) - this lane keeps no second copy',
    'owner', 'event seeded by HRB-022 (l10-inbox); the punch emitter is HRB-015 lane L3');
$$;

-- -----------------------------------------------------------------------------------
-- 5. `hr.punch_correct` — void + replacement, over a SET, on ONE reason
-- -----------------------------------------------------------------------------------

create or replace function hr.punch_correct(
  p_punch_ids uuid[], p_new_values jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_uid       uuid := auth.uid();
  v_ids       uuid[];
  v_id        uuid;
  v_p         hr.punch%rowtype;
  v_auth      jsonb;
  v_lock      jsonb;
  v_vals      jsonb;
  v_new_at    timestamptz;
  v_new_kind  text;
  v_new_paid  boolean;
  v_juris     jsonb;
  v_per_punch boolean := false;
  v_bad_keys  text[];
  v_pairs     jsonb := '[]'::jsonb;
  v_voided    uuid[] := '{}';
  v_repl      uuid[] := '{}';
  v_days      jsonb := '[]'::jsonb;    -- [{employment_id, local_work_date}]
  v_plan      jsonb := '[]'::jsonb;    -- validated plan, built before anything is written
  v_item      jsonb;
  v_conflict  text;
  v_rid       uuid;
  v_closed    jsonb := '[]'::jsonb;
  v_notified  integer := 0;
  d           record;
  k           text;
begin
  ---------------------------------------------------------------- 0. the reason (§4.1: never optional)
  if p_reason is null or length(btrim(p_reason)) < 2 then
    return hr._punch_refusal('hr_punch_reason_required',
      'A punch correction needs a written reason. A single character is not a reason.',
      jsonb_build_object('given', p_reason));
  end if;

  if p_punch_ids is null or cardinality(p_punch_ids) = 0 then
    return hr._punch_refusal('hr_punch_none_selected',
      'No punches were selected to correct.');
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_punch_ids) x;

  ---------------------------------------------------------------- 1. the shape of p_new_values (decision 2)
  if p_new_values is null or p_new_values = '{}'::jsonb then
    return hr._punch_refusal('hr_punch_no_change_requested',
      'A correction has to change something. To remove a punch without replacing it, use hr.punch_void.',
      jsonb_build_object('door', 'hr.punch_void'));
  end if;

  v_per_punch := exists (select 1 from jsonb_object_keys(p_new_values) kk
                          where kk ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

  if not v_per_punch then
    select array_agg(kk) into v_bad_keys from jsonb_object_keys(p_new_values) kk
     where kk not in ('occurred_at','punch_kind','break_paid','shift_minutes');
    if v_bad_keys is not null then
      return hr._punch_refusal('hr_punch_unknown_change_field',
        'These fields cannot be corrected on a punch: ' || array_to_string(v_bad_keys, ', ')
        || '. A punch is raw evidence; only its instant, its kind and whether the break was paid '
        || 'can be replaced.',
        jsonb_build_object('unknown', to_jsonb(v_bad_keys),
                           'allowed', jsonb_build_array('occurred_at','punch_kind','break_paid','shift_minutes')));
    end if;
  end if;

  ---------------------------------------------------------------- 2. VALIDATE EVERYTHING, WRITE NOTHING
  foreach v_id in array v_ids loop
    select * into v_p from hr.punch where id = v_id;
    if not found then
      return hr._punch_refusal('hr_punch_not_found',
        'One of the selected punches does not exist.', jsonb_build_object('punch_id', v_id));
    end if;
    if v_p.voided_at is not null then
      return hr._punch_refusal('hr_punch_already_voided',
        'That punch was already voided on ' || to_char(v_p.voided_at, 'YYYY-MM-DD')
        || '. Correct the replacement instead.',
        jsonb_build_object('punch_id', v_id, 'voided_at', v_p.voided_at,
                           'voided_by_punch_id', v_p.voided_by_punch_id));
    end if;

    v_auth := hr._can_edit_punch(v_uid, v_p.employment_id, v_p.local_work_date);
    if not (v_auth ->> 'ok')::boolean then
      return hr._punch_refusal('hr_no_punch_edit_authority',
        v_auth ->> 'message',
        coalesce(v_auth -> 'details', '{}'::jsonb) || jsonb_build_object('punch_id', v_id,
          'reason', v_auth ->> 'reason'));
    end if;

    v_lock := hr._punch_period_lock(v_p.employment_id, v_p.local_work_date);
    if (v_lock ->> 'locked')::boolean then
      return hr._punch_refusal('hr_period_locked',
        'The pay period covering ' || v_p.local_work_date::text || ' is ' || (v_lock ->> 'state')
        || ', so its punches can no longer be edited in place. File a time adjustment instead — it '
        || 'rides the next export, tagged to the original period.',
        v_lock || jsonb_build_object('punch_id', v_id, 'door', 'hr.time_adjustment_create',
                                     'http_semantics', 423));
    end if;

    ------------------------------------ resolve this punch's new values
    v_vals := case when v_per_punch then coalesce(p_new_values -> v_id::text, '{}'::jsonb)
                   else p_new_values end;
    if v_vals = '{}'::jsonb then
      return hr._punch_refusal('hr_punch_no_change_for_punch',
        'No change was given for one of the selected punches.',
        jsonb_build_object('punch_id', v_id));
    end if;

    v_new_kind := coalesce(v_vals ->> 'punch_kind', v_p.punch_kind);
    if v_new_kind not in ('clock_in','clock_out','break_start','break_end','meal_start','meal_end','transfer') then
      return hr._punch_refusal('hr_punch_kind_unknown',
        v_new_kind || ' is not a punch kind this system records.',
        jsonb_build_object('punch_id', v_id));
    end if;

    if v_vals ? 'occurred_at' then
      v_new_at := (v_vals ->> 'occurred_at')::timestamptz;
    elsif v_vals ? 'shift_minutes' then
      v_new_at := v_p.occurred_at + make_interval(mins => (v_vals ->> 'shift_minutes')::integer);
    else
      v_new_at := v_p.occurred_at;
    end if;

    v_new_paid := case when v_vals ? 'break_paid' then (v_vals ->> 'break_paid')::boolean
                       else v_p.break_paid end;
    if v_new_kind not in ('break_start','break_end','meal_start','meal_end') then
      v_new_paid := null;      -- punch_break_paid_only_on_break
    end if;

    if v_new_at = v_p.occurred_at and v_new_kind = v_p.punch_kind
       and v_new_paid is not distinct from v_p.break_paid then
      return hr._punch_refusal('hr_punch_change_is_a_no_op',
        'The values given for one of the punches are the values it already has. A void plus an '
        || 'identical replacement is a worse record than no change at all.',
        jsonb_build_object('punch_id', v_id));
    end if;

    ------------------------------------ decision 4: never across local_work_date
    v_juris := hr._punch_resolve_juris(v_p.employment_id, v_new_at);
    if not (v_juris ->> 'ok')::boolean then
      return hr._punch_refusal('hr_punch_no_jurisdiction',
        'The new time falls on a date with no position assignment, so the governing jurisdiction '
        || 'cannot be resolved for it.', v_juris || jsonb_build_object('punch_id', v_id));
    end if;
    if (v_juris ->> 'local_work_date')::date <> v_p.local_work_date then
      return hr._punch_refusal('hr_punch_cross_work_date',
        'That change would move the punch from ' || v_p.local_work_date::text || ' to '
        || (v_juris ->> 'local_work_date') || '. A punch never moves between work days: void this '
        || 'one and record a new punch on the correct day.',
        jsonb_build_object('punch_id', v_id, 'from', v_p.local_work_date,
                           'to', (v_juris ->> 'local_work_date')::date,
                           'door', 'hr.punch_void + hr.punch_record'));
    end if;

    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
      'punch_id', v_id, 'employment_id', v_p.employment_id,
      'organization_id', v_p.organization_id,
      'local_work_date', v_p.local_work_date,
      'new_occurred_at', v_new_at, 'new_punch_kind', v_new_kind, 'new_break_paid', v_new_paid,
      'position_assignment_id', v_juris ->> 'position_assignment_id',
      'work_location_id', v_juris ->> 'work_location_id',
      'jurisdiction_id', v_juris ->> 'jurisdiction_id',
      'tz', v_juris ->> 'tz',
      'original_values', to_jsonb(v_p)));

    if not (v_days @> jsonb_build_array(jsonb_build_object(
              'employment_id', v_p.employment_id, 'local_work_date', v_p.local_work_date))) then
      v_days := v_days || jsonb_build_array(jsonb_build_object(
        'employment_id', v_p.employment_id, 'local_work_date', v_p.local_work_date));
    end if;
  end loop;

  ---------------------------------------------------------------- 3. simulate every affected day (decision 3)
  for v_item in select * from jsonb_array_elements(v_days) loop
    v_conflict := hr._punch_chain_conflict(
      (v_item ->> 'employment_id')::uuid,
      (v_item ->> 'local_work_date')::date,
      (select array_agg((x ->> 'punch_id')::uuid) from jsonb_array_elements(v_plan) x
        where x ->> 'employment_id' = v_item ->> 'employment_id'
          and x ->> 'local_work_date' = v_item ->> 'local_work_date'),
      (select coalesce(jsonb_agg(jsonb_build_object(
                'punch_kind', x ->> 'new_punch_kind',
                'occurred_at', x ->> 'new_occurred_at',
                'break_paid', x -> 'new_break_paid')), '[]'::jsonb)
         from jsonb_array_elements(v_plan) x
        where x ->> 'employment_id' = v_item ->> 'employment_id'
          and x ->> 'local_work_date' = v_item ->> 'local_work_date'));
    if v_conflict is not null then
      return hr._punch_refusal('hr_punch_chain_conflict',
        'That correction would leave ' || (v_item ->> 'local_work_date') || ' impossible to read: '
        || v_conflict,
        jsonb_build_object('employment_id', (v_item ->> 'employment_id')::uuid,
                           'local_work_date', (v_item ->> 'local_work_date')::date,
                           'conflict', v_conflict));
    end if;
  end loop;

  ---------------------------------------------------------------- 4. WRITE — replacement first, then the void
  for v_item in select * from jsonb_array_elements(v_plan) loop
    perform hr.arm_write();
    insert into hr.punch (
      organization_id, employment_id, position_assignment_id, punch_kind, break_paid,
      occurred_at, source, idempotency_key, clock_skew_applied_seconds,
      work_location_id, jurisdiction_id, tz, local_work_date,
      actor_type, actor_user_id, actor_employment_id,
      entered_reason, original_values, metadata)
    values (
      (v_item ->> 'organization_id')::uuid, (v_item ->> 'employment_id')::uuid,
      (v_item ->> 'position_assignment_id')::uuid,
      v_item ->> 'new_punch_kind',
      case when jsonb_typeof(v_item -> 'new_break_paid') = 'boolean'
           then (v_item ->> 'new_break_paid')::boolean end,
      (v_item ->> 'new_occurred_at')::timestamptz, 'manager_entry',
      'correct:' || (v_item ->> 'punch_id'), 0,
      (v_item ->> 'work_location_id')::uuid, (v_item ->> 'jurisdiction_id')::uuid,
      v_item ->> 'tz', (v_item ->> 'local_work_date')::date,
      'manager', v_uid,
      (select em.id from hr.employment em
        where em.id = any(hr.employments_of(v_uid, (v_item ->> 'local_work_date')::date))
          and em.organization_id = (v_item ->> 'organization_id')::uuid limit 1),
      p_reason,
      v_item -> 'original_values',                        -- the pre-edit payload, verbatim
      jsonb_build_object('correction_of_punch_id', (v_item ->> 'punch_id')::uuid))
    returning id into v_rid;

    -- the original: ONLY the three void columns change; the immutability trigger enforces that
    perform hr.arm_write();
    update hr.punch
       set voided_at = now(), voided_reason = p_reason, voided_by_punch_id = v_rid
     where id = (v_item ->> 'punch_id')::uuid;

    v_voided := v_voided || (v_item ->> 'punch_id')::uuid;
    v_repl   := v_repl || v_rid;
    v_pairs  := v_pairs || jsonb_build_array(jsonb_build_object(
      'voided_punch_id', (v_item ->> 'punch_id')::uuid,
      'replacement_punch_id', v_rid,
      'original_values', v_item -> 'original_values',
      'new_occurred_at', (v_item ->> 'new_occurred_at')::timestamptz,
      'new_punch_kind', v_item ->> 'new_punch_kind'));

    -- decision 8: close only the exceptions attached to THIS voided punch
    perform hr.arm_write();
    with closed as (
      update hr.attendance_exception e
         set resolution_state = 'corrected', resolved_at = now(),
             resolution_note = 'Punch corrected: ' || p_reason
       where e.punch_id = (v_item ->> 'punch_id')::uuid
         and e.resolution_state = 'open'
      returning e.id, e.exception_kind)
    select v_closed || coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', exception_kind)), '[]'::jsonb)
      into v_closed from closed;

    -- 🚨 decision 6: the employee is told, always
    v_notified := v_notified + hr._punch_notify_edited(
      (v_item ->> 'organization_id')::uuid, (v_item ->> 'employment_id')::uuid,
      (v_item ->> 'punch_id')::uuid, v_rid, p_reason, v_uid,
      jsonb_build_object(
        'from', jsonb_build_object('occurred_at', v_item #> '{original_values,occurred_at}',
                                   'punch_kind',  v_item #> '{original_values,punch_kind}'),
        'to',   jsonb_build_object('occurred_at', v_item -> 'new_occurred_at',
                                   'punch_kind',  v_item -> 'new_punch_kind')));
  end loop;

  ---------------------------------------------------------------- 5. decision 1's invariant, asserted
  if cardinality(v_voided) <> cardinality(v_ids) or cardinality(v_repl) <> cardinality(v_ids) then
    raise exception 'hr.punch_correct: audit trail count (% voided / % replaced) does not equal the punch count (%)',
      cardinality(v_voided), cardinality(v_repl), cardinality(v_ids)
      using errcode = 'P0001';
  end if;

  ---------------------------------------------------------------- 6. the answer (decision 7)
  return jsonb_build_object(
    'ok', true,
    'reason', p_reason,
    'audit_trails', cardinality(v_voided),
    'voided_punch_ids', to_jsonb(v_voided),
    'replacement_punch_ids', to_jsonb(v_repl),
    'pairs', v_pairs,
    'exceptions_closed', v_closed,
    'exceptions_opened', '[]'::jsonb,
    'notifications', jsonb_build_object('event_key', 'hr.time.punch_edited',
                                        'rows_written', v_notified,
                                        'org_overridable', false),
    'intervals', jsonb_build_object(
      'is_stale', true,
      'recompute_door', 'POST /hr/time/recompute',
      'affected', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', w.id, 'local_work_date', w.local_work_date,
                     'hours', w.hours, 'earning_code_id', w.earning_code_id,
                     'is_current', w.is_current)), '[]'::jsonb)
                     from hr.work_interval w
                    where w.is_current
                      and exists (select 1 from jsonb_array_elements(v_days) dd
                                   where (dd ->> 'employment_id')::uuid = w.employment_id
                                     and (dd ->> 'local_work_date')::date = w.local_work_date))));
end
$$;

comment on function hr.punch_correct(uuid[], jsonb, text) is
  'L3-08: void + replacement over a SET of punches sharing ONE reason (SPEC-TIME 4.1, Arman 2026-08-25). '
  'The audit-trail count always equals the punch count. Fires hr.time.punch_edited to the employee, always.';

-- -----------------------------------------------------------------------------------
-- 6. `hr.punch_void` — the duplicate case, no replacement
-- -----------------------------------------------------------------------------------

create or replace function hr.punch_void(p_punch_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_p     hr.punch%rowtype;
  v_auth  jsonb;
  v_lock  jsonb;
  v_conflict text;
  v_closed jsonb := '[]'::jsonb;
  v_notified integer;
begin
  if p_reason is null or length(btrim(p_reason)) < 2 then
    return hr._punch_refusal('hr_punch_reason_required',
      'Voiding a punch needs a written reason. A single character is not a reason.',
      jsonb_build_object('given', p_reason));
  end if;

  select * into v_p from hr.punch where id = p_punch_id;
  if not found then
    return hr._punch_refusal('hr_punch_not_found', 'That punch does not exist.',
      jsonb_build_object('punch_id', p_punch_id));
  end if;
  if v_p.voided_at is not null then
    return hr._punch_refusal('hr_punch_already_voided',
      'That punch was already voided on ' || to_char(v_p.voided_at, 'YYYY-MM-DD') || '.',
      jsonb_build_object('punch_id', p_punch_id, 'voided_at', v_p.voided_at));
  end if;

  v_auth := hr._can_edit_punch(v_uid, v_p.employment_id, v_p.local_work_date);
  if not (v_auth ->> 'ok')::boolean then
    return hr._punch_refusal('hr_no_punch_edit_authority', v_auth ->> 'message',
      coalesce(v_auth -> 'details', '{}'::jsonb)
      || jsonb_build_object('punch_id', p_punch_id, 'reason', v_auth ->> 'reason'));
  end if;

  v_lock := hr._punch_period_lock(v_p.employment_id, v_p.local_work_date);
  if (v_lock ->> 'locked')::boolean then
    return hr._punch_refusal('hr_period_locked',
      'The pay period covering ' || v_p.local_work_date::text || ' is ' || (v_lock ->> 'state')
      || ', so its punches can no longer be voided in place. File a time adjustment instead.',
      v_lock || jsonb_build_object('punch_id', p_punch_id, 'door', 'hr.time_adjustment_create',
                                   'http_semantics', 423));
  end if;

  v_conflict := hr._punch_chain_conflict(v_p.employment_id, v_p.local_work_date,
                                         array[p_punch_id], '[]'::jsonb);
  if v_conflict is not null then
    return hr._punch_refusal('hr_punch_chain_conflict',
      'Voiding that punch would leave ' || v_p.local_work_date::text
      || ' impossible to read: ' || v_conflict,
      jsonb_build_object('punch_id', p_punch_id, 'conflict', v_conflict));
  end if;

  perform hr.arm_write();
  update hr.punch set voided_at = now(), voided_reason = p_reason where id = p_punch_id;

  perform hr.arm_write();
  with closed as (
    update hr.attendance_exception e
       set resolution_state = 'corrected', resolved_at = now(),
           resolution_note = 'Punch voided: ' || p_reason
     where e.punch_id = p_punch_id and e.resolution_state = 'open'
    returning e.id, e.exception_kind)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', exception_kind)), '[]'::jsonb)
    into v_closed from closed;

  v_notified := hr._punch_notify_edited(v_p.organization_id, v_p.employment_id, p_punch_id, null,
    p_reason, v_uid, jsonb_build_object('voided', true,
      'from', jsonb_build_object('occurred_at', v_p.occurred_at, 'punch_kind', v_p.punch_kind),
      'to', null));

  return jsonb_build_object(
    'ok', true,
    'reason', p_reason,
    'audit_trails', 1,
    'voided_punch_ids', jsonb_build_array(p_punch_id),
    'replacement_punch_ids', '[]'::jsonb,
    'exceptions_closed', v_closed,
    'notifications', jsonb_build_object('event_key', 'hr.time.punch_edited',
                                        'rows_written', v_notified, 'org_overridable', false),
    'clock_state', hr.clock_state(v_p.employment_id),
    'intervals', jsonb_build_object('is_stale', true, 'recompute_door', 'POST /hr/time/recompute'));
end
$$;

comment on function hr.punch_void(uuid, text) is
  'L3-09: void with no replacement (the duplicate case). Same refusals as hr.punch_correct.';

do $$
declare missing text;
begin
  select string_agg(f, ', ') into missing from unnest(array[
    'hr._punch_next_state','hr._punch_chain_conflict','hr._punch_period_lock',
    'hr._punch_notify_edited','hr.punch_edit_notify_debt','hr.punch_correct','hr.punch_void']) f
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = split_part(f,'.',1) and p.proname = split_part(f,'.',2));
  if missing is not null then
    raise exception 'hr_l3_03: these objects did not land: %', missing;
  end if;
end $$;
