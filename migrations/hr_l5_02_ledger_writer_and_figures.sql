-- HR domain L5 — migration 2 (register item HRB-017, lane L5 Leave & PTO).
--
-- THE BALANCE LAW, made mechanical. `hr.leave_ledger` is the only authority for any balance
-- number anywhere in the product, so this file ships exactly three things:
--   1. `hr.leave_ledger_post` — the ONE inserter. Nothing else in this lane, or any other, writes
--      a ledger row. It serialises, it refuses a back-date, it computes `balance_after`, it
--      snapshots, and it refreshes the enrollment cache in the same transaction.
--   2. `hr.leave_figures` — the five figures of SPEC-LEAVE §5, computed from the ledger, with the
--      identity the §17 tests assert returned alongside them so a caller can check it.
--   3. `hr.leave_project_balance` — the ONE projector. The balance block's `as_of`, the request
--      validator's `projected_balance_at_start`, and the ledger view's as-of picker all call THIS.
--
-- Authority: SPEC-LEAVE §1, §1.1, §1.2, §3.4, §3.5, §5, §12; AD-11; AR2 LOCK 5/6;
--            SPEC-DATA-MODEL §9. R-L5 (a) B7/B8/B10/C11, U5, U6, U8, U9.
-- Applied live as `hr_l5_02_ledger_writer_and_figures`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 ONE WRITER, AND IT IS THE ONLY THING THAT MAY INSERT. `hr.leave_ledger` carries
--    `_zz_leave_ledger_no_update` and `_zz_leave_ledger_no_delete`, so a wrong row is permanent.
--    `balance_after` is only meaningful if inserts are serialised, so this function takes
--    `pg_advisory_xact_lock` on `(employment_id, leave_policy_id)` INSIDE the write transaction —
--    a concurrent approval and a concurrent accrual therefore cannot interleave and produce two
--    rows claiming the same predecessor. R-L5 U5's ruling, implemented.
--
-- 2. THE BACK-DATE REFUSAL IS THE POINT, NOT A GUARD. §1.1 rule 3: an insert whose `occurred_on`
--    precedes the latest entry's is refused with `LEAVE_LEDGER_BACKDATE`. A retroactive correction
--    is an `adjustment` or `reversal` dated TODAY whose note names the effective date. We never
--    rewrite what a balance WAS; we record what we now owe (AD-11 applied to a ledger).
--
-- 3. AN `unlimited` POLICY WRITES NO ENTRY, EVER — the writer refuses rather than the callers
--    remembering. §2.3: an unlimited policy has no balance, so the balance identity has nothing to
--    compare and §17 tests 1–3 scope past it by construction (R-L5 U9). A `none` policy accepts
--    only `adjustment` / `reversal`, which is exactly what "balance changes only by explicit
--    grant" means.
--
-- 4. THE SNAPSHOT IS WRITTEN BY THE WRITER, NOT BY THE ENGINES. §3.5 requires an
--    `hr.calculation_snapshot` on every accrual / carryover / forfeiture / carryover_expiry /
--    payout entry, and §12 renders a red "Unexplained entry" chip when one is missing. Leaving
--    that to five separate call sites is how four of them end up missing it. The writer takes the
--    inputs and writes the snapshot in the same transaction as the row it explains; a caller that
--    supplies no inputs still gets a snapshot recording that fact.
--
-- 5. `pending_hours` ON THE ENROLLMENT IS A CACHE, LIKE EVERY OTHER BALANCE COLUMN (R-L5 U8).
--    §5 defines "Pending approval" as a sum over `submitted` requests, and that is what
--    `hr.leave_figures` computes. The column is refreshed alongside the others so a directory list
--    can render 200 people without 200 aggregations — it is never read as the authority.
--
-- 6. 🚨 THE PROJECTOR REFUSES TO PROJECT WHAT IT CANNOT KNOW. A `per_hours_worked` policy earns
--    from hours the employee has not worked yet. Guessing a future accrual for a STATUTORY sick
--    balance and printing it as a number is the fabrication class this program keeps finding. So
--    for `per_hours_worked` the projector returns the posted balance with
--    `projection_basis='posted_only'` and `projects_future_accrual=false`, and the surface says
--    "we do not count hours you have not worked yet" rather than inventing a figure. Rate-based
--    methods project honestly, because a pay period that will close is a fact about the calendar.
-- ===================================================================================

-- -----------------------------------------------------------------------------------
-- 1. Small readers the writer and the figures share
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_policy_at(p_leave_policy_id uuid)
returns hr.leave_policy
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  select * from hr.leave_policy where id = p_leave_policy_id and deleted_at is null;
$function$;

comment on function hr._leave_policy_at(uuid) is
  'The policy row behind a ledger entry or a balance figure. Named so every reader resolves it the '
  'same way and a soft-deleted policy can never silently answer.';

-- -----------------------------------------------------------------------------------
-- 2. THE ONE INSERTER
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_ledger_post(
  p_employment_id           uuid,
  p_leave_policy_id         uuid,
  p_entry_kind              text,
  p_hours_delta             numeric,
  p_occurred_on             date    default current_date,
  p_note                    text    default null,
  p_leave_request_id        uuid    default null,
  p_reverses_entry_id       uuid    default null,
  p_source_workweek_id      uuid    default null,
  p_source_work_interval_id uuid    default null,
  p_amount                  numeric default null,
  p_rate                    numeric default null,
  p_engine_key              text    default 'leave_engine',
  p_engine_version          text    default '1',
  p_rule_version_ids        uuid[]  default '{}'::uuid[],
  p_calc                    jsonb   default '{}'::jsonb,
  p_actor_type              text    default 'automation',
  p_actor_employment_id     uuid    default null,
  p_actor_user_id           uuid    default null,
  p_period_key              text    default null,
  p_snapshot_inputs         jsonb   default '{}'::jsonb,
  p_clamps                  jsonb   default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_pol       hr.leave_policy%rowtype;
  v_org       uuid;
  v_last      hr.leave_ledger%rowtype;
  v_balance   numeric;
  v_existing  uuid;
  v_entry     hr.leave_ledger%rowtype;
  v_snap      uuid;
  v_calc      jsonb;
  v_juris     text;
begin
  if p_hours_delta is null then
    raise exception 'hr.leave_ledger_post: hours_delta is required' using errcode = 'P0001';
  end if;

  v_pol := hr._leave_policy_at(p_leave_policy_id);
  if v_pol.id is null then
    raise exception 'hr.leave_ledger_post: no such leave policy %', p_leave_policy_id
      using errcode = 'P0001';
  end if;

  select em.organization_id into v_org
    from hr.employment em where em.id = p_employment_id and em.deleted_at is null;
  if v_org is null then
    raise exception 'hr.leave_ledger_post: no such employment %', p_employment_id
      using errcode = 'P0001';
  end if;
  if v_org <> v_pol.organization_id then
    raise exception 'hr.leave_ledger_post: employment and policy belong to different organizations'
      using errcode = 'P0001';
  end if;

  -- decision 3: an unlimited policy has no balance, so it has no ledger.
  if v_pol.accrual_method = 'unlimited' then
    return jsonb_build_object(
      'ok', false, 'refused', 'LEAVE_POLICY_UNLIMITED',
      'detail', format('%s is an unlimited policy: it has no balance and writes no ledger entries.',
                       v_pol.name));
  end if;
  if v_pol.accrual_method = 'none'
     and p_entry_kind not in ('adjustment', 'reversal', 'opening_balance', 'payout') then
    return jsonb_build_object(
      'ok', false, 'refused', 'LEAVE_POLICY_GRANT_ONLY',
      'detail', format('%s changes only by an explicit grant, so a %s entry is not lawful on it.',
                       v_pol.name, p_entry_kind));
  end if;

  -- decision 1: serialise per (employment, policy) inside this transaction.
  perform pg_advisory_xact_lock(hashtextextended(p_employment_id::text || ':' || p_leave_policy_id::text, 0));

  -- §3.6 idempotency: a replayed run is a no-op, not a double accrual.
  if p_period_key is not null then
    select l.id into v_existing
      from hr.leave_ledger l
     where l.employment_id = p_employment_id
       and l.leave_policy_id = p_leave_policy_id
       and l.entry_kind = p_entry_kind
       and l.calc ->> 'period_key' = p_period_key
     limit 1;
    if v_existing is not null then
      select * into v_entry from hr.leave_ledger where id = v_existing;
      return jsonb_build_object('ok', true, 'idempotent_noop', true, 'entry_id', v_existing,
                                'balance_after', v_entry.balance_after,
                                'detail', 'an entry already exists for this period key');
    end if;
  end if;

  select * into v_last
    from hr.leave_ledger l
   where l.employment_id = p_employment_id and l.leave_policy_id = p_leave_policy_id
   order by l.occurred_on desc, l.created_at desc
   limit 1;

  -- decision 2: THE BACK-DATE REFUSAL.
  if v_last.id is not null and p_occurred_on < v_last.occurred_on then
    raise exception 'LEAVE_LEDGER_BACKDATE: an entry dated % precedes the latest entry, dated %',
                    p_occurred_on, v_last.occurred_on
      using errcode = 'P0001',
            hint = 'A retroactive correction is an adjustment or reversal dated TODAY whose note '
                || 'names the effective date and whose source ids name the origin (SPEC-LEAVE §1.1).';
  end if;

  v_balance := coalesce(v_last.balance_after, 0) + p_hours_delta;

  v_calc := coalesce(p_calc, '{}'::jsonb);
  if p_period_key is not null then
    v_calc := v_calc || jsonb_build_object('period_key', p_period_key);
  end if;
  if jsonb_array_length(coalesce(p_clamps, '[]'::jsonb)) > 0 then
    v_calc := v_calc || jsonb_build_object('clamps', p_clamps);
  end if;
  v_calc := v_calc || jsonb_build_object(
    'policy_version', v_pol.version,
    'prior_balance', coalesce(v_last.balance_after, 0),
    'accrual_method', v_pol.accrual_method);

  perform hr.arm_write();
  insert into hr.leave_ledger
    (employment_id, leave_policy_id, leave_request_id, entry_kind, occurred_on, hours_delta,
     balance_after, amount, rate, source_workweek_id, source_work_interval_id, reverses_entry_id,
     note, rule_version_ids, engine_key, engine_version, calc, computed_at,
     actor_type, actor_employment_id, actor_user_id, organization_id)
  values
    (p_employment_id, p_leave_policy_id, p_leave_request_id, p_entry_kind, p_occurred_on,
     p_hours_delta, v_balance, p_amount, p_rate, p_source_workweek_id, p_source_work_interval_id,
     p_reverses_entry_id, p_note, coalesce(p_rule_version_ids, '{}'::uuid[]), p_engine_key,
     p_engine_version, v_calc, now(),
     p_actor_type, p_actor_employment_id, coalesce(p_actor_user_id, auth.uid()), v_org)
  returning * into v_entry;

  -- decision 4: the writer writes the snapshot, so no entry of a computed kind can lack one.
  -- EVERY kind, not only §3.5's five. §12 is the stricter requirement — "every row has a rule
  -- door", and an entry with no snapshot renders a red "Unexplained entry" chip. A `usage` row
  -- with no door is the one an employee disputes most often ("where did my four hours go?"), so
  -- it is the last row that should be missing its explanation.
  if p_entry_kind is not null then
    -- 🚨 `hr._subject_jurisdiction_key` RAISES for `hr_employment` — SPEC-JURISDICTION §2.0 says
    -- jurisdiction is STAMPED on a record, and an employment carries no stamp. So the canonical
    -- resolver is asked first and its refusal is caught, not treated as an outage; the working
    -- record's own answer (the primary assignment's work location) is next; and only then the
    -- federal key. `hr.calculation_snapshot.jurisdiction_key` is NOT NULL, so a null here is not
    -- an option — but a fallback nobody can see IS a fabricated jurisdiction on a wage-adjacent
    -- record, which is why the last rung writes its own reason into the snapshot's inputs.
    begin
      v_juris := hr._subject_jurisdiction_key('hr_employment', p_employment_id);
    exception when others then
      v_juris := null;
    end;
    if v_juris is null then
      select j.key into v_juris
        from hr.position_assignment pa
        join hr.location loc on loc.id = pa.location_id
        join hr.jurisdiction j on j.id = loc.jurisdiction_id
       where pa.employment_id = p_employment_id and pa.is_primary and pa.deleted_at is null
       order by (pa.effective_from <= p_occurred_on
                 and (pa.effective_to is null or pa.effective_to > p_occurred_on)) desc,
                pa.effective_from desc
       limit 1;
    end if;
    if v_juris is null then
      v_juris := 'US';
      p_snapshot_inputs := coalesce(p_snapshot_inputs, '{}'::jsonb)
        || jsonb_build_object('jurisdiction_key_fallback', true,
             'jurisdiction_key_fallback_reason',
             'no jurisdiction resolves for this employment; the federal key was used');
    end if;

    v_snap := hr.write_calculation_snapshot(
      v_org, 'hr_leave_ledger', v_entry.id,
      case p_entry_kind when 'payout' then 'leave_payout'
                        when 'adjustment' then 'leave_adjustment'
                        else 'leave_accrual' end,
      v_juris, p_occurred_on, p_engine_key, p_engine_version,
      jsonb_build_object('rule_version_ids', to_jsonb(coalesce(p_rule_version_ids, '{}'::uuid[]))),
      '{}'::jsonb,
      coalesce(p_snapshot_inputs, '{}'::jsonb)
        || jsonb_build_object('prior_balance', coalesce(v_last.balance_after, 0),
                              'policy_version', v_pol.version,
                              'entry_kind', p_entry_kind),
      jsonb_build_object('hours_delta', p_hours_delta, 'balance_after', v_balance,
                         'amount', p_amount, 'rate', p_rate),
      p_actor_type, coalesce(p_actor_user_id, auth.uid()), p_employment_id,
      coalesce(p_clamps, '[]'::jsonb), false, null, null);
  end if;

  perform hr.leave_enrollment_refresh(p_employment_id, p_leave_policy_id);

  return jsonb_build_object('ok', true, 'entry_id', v_entry.id, 'balance_after', v_balance,
                            'occurred_on', p_occurred_on, 'snapshot_id', v_snap,
                            'idempotent_noop', false);
end
$function$;

comment on function hr.leave_ledger_post is
  'THE ONE INSERTER for hr.leave_ledger (SPEC-LEAVE §1 THE BALANCE LAW). Serialises per '
  '(employment, policy), refuses a back-date with LEAVE_LEDGER_BACKDATE, computes balance_after, '
  'writes the calculation snapshot for every computed kind, and refreshes the enrollment cache in '
  'the same transaction. Nothing else may insert into that table.';

revoke all on function hr.leave_ledger_post from public, anon, authenticated;

-- -----------------------------------------------------------------------------------
-- 3. The enrollment cache refresh — same transaction, never an authority
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_enrollment_refresh(p_employment_id uuid, p_leave_policy_id uuid)
returns void
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_balance numeric;
  v_accrued numeric;
  v_used    numeric;
  v_pending numeric;
  v_year    date;
begin
  select e.policy_year_start_on into v_year
    from hr.leave_enrollment e
   where e.employment_id = p_employment_id and e.leave_policy_id = p_leave_policy_id
     and e.deleted_at is null
   order by e.effective_from desc limit 1;
  v_year := coalesce(v_year, date_trunc('year', current_date)::date);

  select coalesce(l.balance_after, 0) into v_balance
    from hr.leave_ledger l
   where l.employment_id = p_employment_id and l.leave_policy_id = p_leave_policy_id
   order by l.occurred_on desc, l.created_at desc limit 1;

  select coalesce(sum(l.hours_delta) filter (
           where l.entry_kind in ('accrual','carryover','opening_balance','reinstatement')
             and l.occurred_on >= v_year), 0),
         coalesce(-sum(l.hours_delta) filter (
           where l.entry_kind = 'usage' and l.occurred_on >= v_year), 0)
    into v_accrued, v_used
    from hr.leave_ledger l
   where l.employment_id = p_employment_id and l.leave_policy_id = p_leave_policy_id;

  select coalesce(sum(r.requested_hours), 0) into v_pending
    from hr.leave_request r
   where r.employment_id = p_employment_id and r.leave_policy_id = p_leave_policy_id
     and r.state = 'submitted' and r.deleted_at is null;

  perform hr.arm_write();
  update hr.leave_enrollment
     set balance_hours     = coalesce(v_balance, 0),
         accrued_ytd_hours = coalesce(v_accrued, 0),
         used_ytd_hours    = coalesce(v_used, 0),
         pending_hours     = coalesce(v_pending, 0),
         last_accrual_at   = now()
   where employment_id = p_employment_id and leave_policy_id = p_leave_policy_id
     and deleted_at is null
     and (effective_to is null or effective_to >= current_date);
end
$function$;

comment on function hr.leave_enrollment_refresh(uuid, uuid) is
  'Refreshes the four cache columns on hr.leave_enrollment from the ledger and the request rows. '
  'THE LEDGER IS THE AUTHORITY (SPEC-LEAVE §1); these columns exist only so a directory list can '
  'render 200 people without 200 aggregations, and pending_hours is a cache of the same kind '
  '(R-L5 U8).';

revoke all on function hr.leave_enrollment_refresh(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------------
-- 4. THE FIVE FIGURES (SPEC-LEAVE §5) — computed from the ledger, with the identity returned
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_figures(
  p_employment_id   uuid,
  p_leave_policy_id uuid,
  p_as_of           date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_pol       hr.leave_policy%rowtype;
  v_accrued   numeric := 0;
  v_used      numeric := 0;
  v_upcoming  numeric := 0;
  v_pending   numeric := 0;
  v_removed   numeric := 0;
  v_balance   numeric := 0;
  v_identity  boolean;
  v_usable    date;
  v_hire      date;
begin
  v_pol := hr._leave_policy_at(p_leave_policy_id);
  if v_pol.id is null then
    return jsonb_build_object('ok', false, 'refused', 'LEAVE_POLICY_NOT_FOUND');
  end if;

  -- §2.3 / R-L5 U9: an unlimited policy renders the WORD, never a zero and never a bar.
  if v_pol.accrual_method = 'unlimited' then
    return jsonb_build_object(
      'ok', true, 'unlimited', true, 'as_of', p_as_of,
      'policy_id', v_pol.id, 'policy_name', v_pol.name, 'leave_kind', v_pol.leave_kind,
      'sentence', 'Unlimited — requests still need approval.');
  end if;

  select
    coalesce(sum(l.hours_delta) filter (
      where l.entry_kind in ('accrual','carryover','opening_balance','reinstatement')
         or (l.entry_kind = 'adjustment' and l.hours_delta > 0)), 0),
    coalesce(-sum(l.hours_delta) filter (
      where l.entry_kind in ('forfeiture','carryover_expiry','payout')
         or (l.entry_kind = 'adjustment' and l.hours_delta < 0)), 0)
   into v_accrued, v_removed
   from hr.leave_ledger l
  where l.employment_id = p_employment_id and l.leave_policy_id = p_leave_policy_id
    and l.occurred_on <= p_as_of;

  -- Used (taken) and Approved upcoming are both sums over `usage` entries, split by the state of
  -- the request that caused them, and both are NET OF REVERSALS — a cancelled day is not used
  -- time and is not committed time.
  select
    coalesce(-sum(l.hours_delta) filter (where r.state in ('taken','partially_taken')), 0),
    coalesce(-sum(l.hours_delta) filter (where r.state = 'approved' and r.ends_on >= current_date), 0)
   into v_used, v_upcoming
   from hr.leave_ledger l
   join hr.leave_request r on r.id = l.leave_request_id
  where l.employment_id = p_employment_id and l.leave_policy_id = p_leave_policy_id
    and l.entry_kind in ('usage','reversal')
    and l.occurred_on <= p_as_of;

  select coalesce(sum(r.requested_hours), 0) into v_pending
    from hr.leave_request r
   where r.employment_id = p_employment_id and r.leave_policy_id = p_leave_policy_id
     and r.state = 'submitted' and r.deleted_at is null;

  select coalesce(l.balance_after, 0) into v_balance
    from hr.leave_ledger l
   where l.employment_id = p_employment_id and l.leave_policy_id = p_leave_policy_id
     and l.occurred_on <= p_as_of
   order by l.occurred_on desc, l.created_at desc limit 1;
  v_balance := coalesce(v_balance, 0);

  -- §5 / §17 test 3: the identity the UI asserts. Returned rather than trusted, so a divergence
  -- renders as a loud banner instead of a wrong number.
  v_identity := round(v_accrued - v_used - v_upcoming - v_removed, 4) = round(v_balance, 4);

  select em.hire_date into v_hire from hr.employment em where em.id = p_employment_id;
  if v_pol.usable_after_days > 0 and v_hire is not null then
    v_usable := v_hire + v_pol.usable_after_days;
  end if;

  return jsonb_build_object(
    'ok', true, 'unlimited', false, 'as_of', p_as_of,
    'policy_id', v_pol.id, 'policy_name', v_pol.name, 'leave_kind', v_pol.leave_kind,
    'accrual_method', v_pol.accrual_method, 'accrual_rate', v_pol.accrual_rate,
    'accrual_per_units', v_pol.accrual_per_units, 'increment_minutes', v_pol.increment_minutes,
    'balance_cap', v_pol.balance_cap, 'carryover_allowed', v_pol.carryover_allowed,
    'negative_balance_allowed', v_pol.negative_balance_allowed,
    'negative_balance_floor', v_pol.negative_balance_floor,
    'statutory_basis_rule_class', v_pol.statutory_basis_rule_class,
    'usable_on', v_usable,
    'accrued_to_date',   round(v_accrued, 4),
    'used_taken',        round(v_used, 4),
    'approved_upcoming', round(v_upcoming, 4),
    'pending_approval',  round(v_pending, 4),
    'removed',           round(v_removed, 4),
    'ledger_balance',    round(v_balance, 4),
    'available',         round(v_balance - v_pending, 4),
    'identity_holds',    v_identity);
end
$function$;

comment on function hr.leave_figures(uuid, uuid, date) is
  'SPEC-LEAVE §5 THE HONESTY LAW: a balance is five numbers and a sentence, or it is a lie. Every '
  'balance block in the product renders THIS, and `identity_holds` is the §17 test 3 assertion '
  'returned to the caller so a divergence is loud rather than silent.';

-- -----------------------------------------------------------------------------------
-- 5. THE ONE PROJECTOR
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_project_balance(
  p_employment_id   uuid,
  p_leave_policy_id uuid,
  p_as_of           date
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_pol      hr.leave_policy%rowtype;
  v_org      uuid;
  v_fig      jsonb;
  v_horizon  integer;
  v_periods  numeric := 0;
  v_earn     numeric := 0;
  v_committed numeric := 0;
  v_basis    text;
  v_project  boolean := true;
  v_balance  numeric;
begin
  v_pol := hr._leave_policy_at(p_leave_policy_id);
  if v_pol.id is null then
    return jsonb_build_object('ok', false, 'refused', 'LEAVE_POLICY_NOT_FOUND');
  end if;
  select em.organization_id into v_org from hr.employment em where em.id = p_employment_id;

  -- The past is not a projection: replay the ledger and say so.
  if p_as_of <= current_date then
    v_fig := hr.leave_figures(p_employment_id, p_leave_policy_id, p_as_of);
    return v_fig || jsonb_build_object('projected', false, 'projection_basis', 'ledger_replay');
  end if;

  v_horizon := (hr._hr_knob('hr.leave','balance_projection_horizon_days', v_org, null) #>> '{}')::integer;
  if p_as_of > current_date + v_horizon then
    return jsonb_build_object(
      'ok', false, 'refused', 'LEAVE_PROJECTION_BEYOND_HORIZON',
      'horizon_days', v_horizon,
      'detail', format('We project balances up to %s days ahead. Beyond that we would be guessing.',
                       v_horizon));
  end if;

  v_fig := hr.leave_figures(p_employment_id, p_leave_policy_id, current_date);
  if coalesce((v_fig ->> 'unlimited')::boolean, false) then
    return v_fig || jsonb_build_object('projected', true, 'projection_basis', 'unlimited');
  end if;
  v_balance := (v_fig ->> 'ledger_balance')::numeric;

  -- decision 6: what we will not guess.
  if v_pol.accrual_method in ('per_hours_worked', 'none') then
    v_project := false;
    v_basis := 'posted_only';
  elsif v_pol.accrual_method = 'per_pay_period' then
    -- Column names read off the live catalog, not remembered: `hr.pay_period` carries
    -- `period_start_on` / `period_end_on` and has no `deleted_at`. An earlier draft of this
    -- function guessed `ends_on`, and the first real request through the door raised
    -- `42703 column pp.ends_on does not exist` — which is why the proof runs as a real user
    -- before anything is called finished.
    select count(*) into v_periods
      from hr.pay_period pp
      join hr.employment em on em.id = p_employment_id
     where pp.organization_id = em.organization_id
       and pp.period_end_on > current_date and pp.period_end_on <= p_as_of;
    v_earn := coalesce(v_pol.accrual_rate, 0) * v_periods;
    v_basis := 'pay_periods_closing';
  elsif v_pol.accrual_method = 'per_month' then
    v_periods := greatest(0, (extract(year from age(p_as_of, current_date)) * 12
                            + extract(month from age(p_as_of, current_date)))::numeric);
    v_earn := coalesce(v_pol.accrual_rate, 0) * v_periods;
    v_basis := 'month_boundaries';
  elsif v_pol.accrual_method in ('annual_lump', 'anniversary_lump') then
    v_periods := case when p_as_of >= current_date + 365 then 1 else 0 end;
    v_earn := coalesce(v_pol.accrual_rate, 0) * v_periods;
    v_basis := 'anniversary_crossings';
  else
    v_project := false;
    v_basis := 'posted_only';
  end if;

  -- §3.4: the cap applies to a projection exactly as it applies to a run.
  if v_pol.balance_cap is not null then
    v_earn := greatest(0, least(v_earn, v_pol.balance_cap - v_balance));
  end if;

  -- Approved leave between today and the as-of date is already committed and already deducted at
  -- approval (§1.2 encumbrance), so it is NOT subtracted again here. What is subtracted is leave
  -- still awaiting a decision, because it is not in the ledger at all.
  select coalesce(sum(r.requested_hours), 0) into v_committed
    from hr.leave_request r
   where r.employment_id = p_employment_id and r.leave_policy_id = p_leave_policy_id
     and r.state = 'submitted' and r.deleted_at is null and r.starts_on <= p_as_of;

  return v_fig || jsonb_build_object(
    'projected', true,
    'projection_basis', v_basis,
    'projects_future_accrual', v_project,
    'as_of', p_as_of,
    'projected_accrual', round(v_earn, 4),
    'projected_balance', round(v_balance + v_earn, 4),
    'projected_available', round(v_balance + v_earn - v_committed, 4),
    'projection_note', case
      when not v_project and v_pol.accrual_method = 'per_hours_worked'
        then 'You earn this time by working, so we do not count hours you have not worked yet.'
      when not v_project then 'This policy changes only by an explicit grant, so there is nothing to project.'
      else null end);
end
$function$;

comment on function hr.leave_project_balance(uuid, uuid, date) is
  'THE ONE PROJECTOR (SPEC-LEAVE §5). The balance block''s as_of, the request validator''s '
  'projected_balance_at_start and the ledger view''s as-of picker all call this — two '
  'implementations of this arithmetic is a defect. Never writes a ledger entry, never refreshes '
  'the cache, never projects a per_hours_worked accrual it would have to invent.';

-- -----------------------------------------------------------------------------------
-- 6. Self-proof
-- -----------------------------------------------------------------------------------

do $$
declare v_missing text;
begin
  select string_agg(f, ', ') into v_missing from unnest(array[
    'hr._leave_policy_at','hr.leave_ledger_post','hr.leave_enrollment_refresh',
    'hr.leave_figures','hr.leave_project_balance']) f
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = split_part(f,'.',1) and p.proname = split_part(f,'.',2));
  if v_missing is not null then
    raise exception 'hr_l5_02: these objects did not land: %', v_missing;
  end if;

  -- the writer must be unreachable from a client role: only the doors in hr_l5_04 may call it
  if has_function_privilege('authenticated', 'hr.leave_ledger_post(uuid,uuid,text,numeric,date,text,uuid,uuid,uuid,uuid,numeric,numeric,text,text,uuid[],jsonb,text,uuid,uuid,text,jsonb,jsonb)', 'execute') then
    raise exception 'hr_l5_02: authenticated can call the ledger writer directly';
  end if;
end $$;
