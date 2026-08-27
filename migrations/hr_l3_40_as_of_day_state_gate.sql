-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 A BACK-DATED MANAGER ENTRY WAS JUDGED AGAINST TODAY'S CLOCK CHAIN.
--
-- `hr.punch_record` step 7 asked `hr._punch_state_of(p_employment_id)` whether the punch was a
-- legal transition. That function reads `hr._punch_open_chain`, which opens after the employee's
-- most recent `clock_out` **of all time** — it is, by construction, the state RIGHT NOW. For a
-- live punch that is exactly right and this migration does not change it. For a punch the manager
-- is entering for a day that has already ended, it is the wrong question asked of the wrong day,
-- and it fails in both directions:
--
--   * REFUSES WHAT IS LEGAL. Maria is clocked in right now. HR back-dates the `clock_in` she
--     forgot last Tuesday. Today's state is `clocked_in`, whose allowed kinds are
--     clock_out/break_start/meal_start/transfer, so the entry is refused as an illegal transition
--     — even though Tuesday's chain was `clocked_out` and a `clock_in` is the only legal thing
--     there. The manager is told to fix a conflict that does not exist on the day they are fixing.
--
--   * ACCEPTS WHAT IS ILLEGAL. The mirror case is worse because nothing complains: back-date a
--     `clock_out` into a Tuesday that never had a `clock_in`, and today's `clocked_in` state waves
--     it through. A `clock_out` with no open interval lands in raw, and the pairing detector opens
--     a `missed_pair` exception on a day the manager believed they had just corrected.
--
-- THE RULE (coordinator ruling, this batch): a punch is judged against the chain of the day it is
-- ENTERED FOR — the chain as it stood at the punch's own `occurred_at` — never against the chain
-- as it stands at the moment the row is typed. This is the same law as jurisdiction and `as_of`
-- everywhere else in the lane: authority and legality are read from the event's own date, never
-- from `now()`.
--
-- Authority: SPEC-TIME §3.1 (clock state machine), §4.1 (manager entry and correction);
-- SPEC-ACCESS §6.3; the lane law "as_of is the event date, never now()".
--
-- Applied live as `hr_l3_40_as_of_day_state_gate`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. ONE IMPLEMENTATION, TWO ENTRY POINTS. `hr._punch_open_chain(em)` is not left standing beside
--    a near-copy; it is redefined to delegate to `hr._punch_open_chain_as_of(em, 'infinity')`.
--    Two chain-walkers that must agree forever is a defect waiting to happen — the live clock and
--    the back-dated gate now walk literally the same code, so they cannot drift apart.
-- 2. `'infinity'` RATHER THAN `now()` FOR THE CURRENT-CHAIN CASE. `now()` would silently drop a
--    future-dated punch out of the current chain and change today's answer for the live clock;
--    `'infinity'` reproduces the old behaviour exactly, so this migration cannot move the live
--    surfaces at all. The as-of gate is the only new behaviour.
-- 3. STEP 9 MOVES TOO. The open-break lookup that feeds `worked_through_break` reads the same
--    chain. Left current, a back-dated `clock_out` would hunt for the open break in TODAY's chain
--    and either miss the real one or find an unrelated one from today. It is anchored to
--    `v_occurred` with the other two sites.
-- 4. WHAT THIS MIGRATION DOES NOT DO. It fixes the gate, not the forward chain: inserting a punch
--    into the middle of a completed day can still leave the punches AFTER it illegal. That is the
--    `hr._punch_chain_conflict` question, which `hr.punch_correct` already asks and
--    `hr.punch_record` does not. Naming it here so the gap is on the record rather than assumed
--    closed by this fix.

-- ── 1. the chain, as of an instant ──────────────────────────────────────────────────────────
create or replace function hr._punch_open_chain_as_of(p_employment_id uuid, p_at timestamptz)
returns table(id uuid, punch_kind text, occurred_at timestamptz, break_paid boolean, source text,
              tz text, local_work_date date, position_assignment_id uuid, attestation_response jsonb)
language sql stable security definer set search_path to 'hr','public'
as $fn$
  -- the chain open at p_at: everything after the last clock_out AT OR BEFORE p_at, and nothing
  -- that had not happened yet when p_at came around.
  with last_out as (
    select max(p.occurred_at) as at
      from hr.punch p
     where p.employment_id = p_employment_id
       and p.voided_at is null
       and p.punch_kind = 'clock_out'
       and p.occurred_at <= p_at)
  select p.id, p.punch_kind, p.occurred_at, p.break_paid, p.source, p.tz,
         p.local_work_date, p.position_assignment_id, p.attestation_response
    from hr.punch p, last_out lo
   where p.employment_id = p_employment_id
     and p.voided_at is null
     and p.occurred_at <= p_at
     and (lo.at is null or p.occurred_at > lo.at)
   order by p.occurred_at, hr._punch_kind_rank(p.punch_kind), p.server_received_at;
$fn$;

create or replace function hr._punch_state_as_of(p_employment_id uuid, p_at timestamptz)
returns text language plpgsql stable security definer set search_path to 'hr','public'
as $fn$
declare r record; v_state text := 'clocked_out';
begin
  for r in select * from hr._punch_open_chain_as_of(p_employment_id, p_at) loop
    v_state := hr._punch_next_state(v_state, r.punch_kind, r.break_paid);
  end loop;
  return v_state;
end
$fn$;

-- ── 2. the existing current-chain readers become thin delegations (decision 1) ───────────────
create or replace function hr._punch_open_chain(p_employment_id uuid)
returns table(id uuid, punch_kind text, occurred_at timestamptz, break_paid boolean, source text,
              tz text, local_work_date date, position_assignment_id uuid, attestation_response jsonb)
language sql stable security definer set search_path to 'hr','public'
as $fn$
  select * from hr._punch_open_chain_as_of(p_employment_id, 'infinity'::timestamptz);
$fn$;

create or replace function hr._punch_state_of(p_employment_id uuid)
returns text language sql stable security definer set search_path to 'hr','public'
as $fn$
  select hr._punch_state_as_of(p_employment_id, 'infinity'::timestamptz);
$fn$;

-- ── 3. anchor hr.punch_record's three chain reads to the punch's own instant ─────────────────
do $mig$
declare
  v_def text := pg_get_functiondef(
    'hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure);
  v_before int;
begin
  -- step 7, both sites: the legality gate and the re-read after an orphan auto-close.
  v_before := (length(v_def) - length(replace(v_def, 'hr._punch_state_of(p_employment_id)', ''))) / 35;
  if v_before not in (0, 2) then
    raise exception 'hr_l3_40: expected 0 or 2 state_of sites in punch_record, found %', v_before;
  end if;
  v_def := replace(v_def, 'hr._punch_state_of(p_employment_id)',
                          'hr._punch_state_as_of(p_employment_id, v_occurred)');

  -- step 9: the open break that feeds worked_through_break (decision 3).
  v_before := (length(v_def) - length(replace(v_def, 'hr._punch_open_chain(p_employment_id)', ''))) / 37;
  if v_before not in (0, 1) then
    raise exception 'hr_l3_40: expected 0 or 1 open_chain site in punch_record, found %', v_before;
  end if;
  v_def := replace(v_def, 'hr._punch_open_chain(p_employment_id)',
                          'hr._punch_open_chain_as_of(p_employment_id, v_occurred)');

  execute v_def;
end
$mig$;

-- ── 4. self-assertions: the gate is anchored and the live clock did not move ─────────────────
do $chk$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure;

  if position('hr._punch_state_as_of(p_employment_id, v_occurred)' in v_src) = 0 then
    raise exception 'hr_l3_40: the state gate is not anchored to v_occurred';
  end if;
  if position('hr._punch_open_chain_as_of(p_employment_id, v_occurred)' in v_src) = 0 then
    raise exception 'hr_l3_40: the step-9 break lookup is not anchored to v_occurred';
  end if;
  -- nothing in the write path may still ask the "right now" question
  if position('hr._punch_state_of(p_employment_id)' in v_src) > 0
     or position('hr._punch_open_chain(p_employment_id)' in v_src) > 0 then
    raise exception 'hr_l3_40: punch_record still reads the current chain somewhere';
  end if;

  -- decision 2: the current-chain readers must still answer for a live employment
  if hr._punch_state_of((select employment_id from hr.punch order by occurred_at desc limit 1)) is null then
    raise exception 'hr_l3_40: _punch_state_of stopped answering';
  end if;
end
$chk$;

