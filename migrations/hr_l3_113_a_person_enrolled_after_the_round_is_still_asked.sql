-- hr_l3_113 — A PERSON ENROLLED AFTER THE ROUND IS STILL ASKED.
--
-- 🚨 THE DEFECT (flagged out-of-scope by the hr_l3_112 repair, measured live 2026-08-29).
-- hr._enroll_pay_period_rows writes into periods whose state is `open | submitted | approved |
-- reopened` (hr_l3_28 decision 4 — only a period whose money has NOT left). Three of those four
-- states are AFTER the attestation round: hr.pay_period_transition opens one timecard_attestation
-- instance per included employment at open→submitted, exactly once, and never again. So a row that
-- arrives afterwards — a late transfer through hr_employment_set_pay_group, a backdated correction
-- through hr_employee_create — lands with:
--
--     state = 'open'   ·   attestation_statement = NULL   ·   NO workflow instance at all
--
-- That person is never asked to attest their hours for that period. Route 5 has no step to offer
-- them (hr.wf_for_target returns nothing) and no wording to show them (hr.timesheet_get projects
-- the ROW). And the row is not merely unasked, it is UNDECIDABLE: hr.pay_period_transition counts
-- every row `not in (approved, exported, locked)` before it will approve a period, and the only
-- thing that moves a row out of `open` is hr.timecard_wf_apply — which needs an instance that does
-- not exist. One late transfer silently blocks the whole pay group's approval.
--
-- 🚨 WHY CHECK 38 IS GREEN ON IT. hr_l3_112's every_attestation_records_its_statement is scoped, on
-- purpose, to rows where somebody ACTUALLY attested (`attested_at is not null`). Nobody attested
-- here — that IS the defect — so the row is invisible to it. The two checks are complements: 38
-- asks "was the signature recorded against a wording?", 39 asks "was the person ever asked at all?"
--
-- MEASURED LIVE, 2026-08-29, before this migration: 1 row of 200 is in this exact state —
-- pay_period_employment a782f00d (employment ca9e12da, period 3fe8783c, period state `submitted`,
-- row state `open`, created 2026-08-27 06:34, period submitted 2026-08-28 12:34). It is the very
-- row hr_l3_91 was written from: that employment had moved pay groups, so the submit's pay-group
-- loop never visited it. hr_l3_91 (applied 12:40, SIX MINUTES after that submit) fixed the WRITER
-- and left the DATA — which is the second half of the same lesson hr_l3_112 recorded: a repaired
-- writer does not repair a row that already went past it.
--
-- WHAT SHOULD HAPPEN, PER SPEC. SPEC-TIME §7.1's flowchart node D: "Engine opens ONE
-- timecard_attestation instance per INCLUDED employment", and hr_l3_91 already ruled what included
-- means — "A PERIOD'S MEMBERSHIP IS ITS ROWS, NOT ITS PAY GROUP". A row added later is an included
-- employment; nothing in the spec scopes inclusion to the instant of submit. SPEC-TIME §2.2 fixes
-- WHEN the wording binds — at OFFER: "the exact text shown is stored on
-- hr.pay_period_employment.attestation_statement", "the text shown is copied onto the row — an edit
-- is never retroactive". For a late enrolment the offer is now, so the stamp is now. And SPEC-TIME
-- §3.2's law — "An attestation to an unstated number is not an attestation" — is why the stamp and
-- the step must land together rather than the step alone.
--
-- THE FIX, in four parts:
--
--   1. hr._enroll_pay_period_rows — a SECOND PHASE. After enrolment, every row IN SCOPE whose
--      period has already passed submit and which carries no timecard flow gets its wording stamped
--      (null-guarded, the hr_l3_112 pattern: it can only ever FILL a NULL) and its own step opened,
--      under the SAME idempotency key hr.pay_period_transition uses, so the two writers can never
--      produce two instances for one timecard.
--
--      🚨 Phase 2 runs over ROWS IN SCOPE, not over the rows THIS CALL INSERTED. That is the whole
--      lesson of hr_l3_112 ("`do nothing` MEANT `record nothing`") applied to the second half of
--      the same function: an insert that conflicts does not mean the work is done. It also makes
--      hr.pay_period_generate — which already sweeps EVERY period of a pay group and whose hr_l3_28
--      comment already promises "a re-run backfills and duplicates nothing" — the repair door for
--      any row that was missed, including one whose employment has since moved pay groups. No new
--      door is added: `Generate periods` on route 32/33 is the act.
--
--   2. THE EXCLUSION IS HONEST, NOT SILENT. Phase 2 repeats hr.pay_period_transition's opening rule
--      verbatim — employment not deleted, status in (active, on_leave, suspended, terminated),
--      worker_class in hr._time_punch_enabled_worker_classes() as of period_end_on, and the flow
--      chosen by hr.time_and_attendance.employee_attestation_required. A row outside that rule gets
--      no step here for exactly the reason it would have got none at submit (SPEC-TIME §8 — a
--      contractor is not asked to attest), and check 39 REPORTS that exclusion set by name and
--      count instead of quietly filtering it away.
--
--   3. hr.timecards_never_asked_to_attest() + punch battery check 39 — the state becomes
--      detectable. `repairable` distinguishes a period that can still ask (submitted / approved /
--      reopened → re-run hr_pay_period_generate) from one whose money has left (exported / locked /
--      closed → SPEC-TIME §7.1's adjustment lane is the only door, and attestation is not it).
--
--   4. THE CHECK SHIPS RED, on the one live row above, and says exactly which act clears it. It is
--      NOT backfilled here: hr.wf_request refuses `no_caller` when auth.uid() is NULL, and a
--      migration runs as postgres. Forging a caller to manufacture a workflow instance for an act
--      no human took is precisely what this migration exists to prevent.
--
-- LEGAL-RECORD SAFETY: no row is deleted; no non-null attestation_statement is written over by any
-- path added here (every write is a coalesce that reads the OLD value); no row's state is moved; no
-- attestation is recorded on anybody's behalf. The only new writes are a wording onto an empty
-- column, a provenance note in metadata, and a workflow instance that ASKS.
--
-- SPEC-TIME §2.2, §3.2, §7.1, §8, §14 D6/D7. Sibling of hr_l3_28 (enrolment), hr_l3_91 (membership
-- is rows), hr_l3_112 (the statement is stamped at offer).

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 0. THE STATE THIS MIGRATION EXISTS FOR, RECORDED BEFORE ANYTHING CHANGES.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
do $red$
declare v_rows jsonb; v_n integer;
begin
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
           'pay_period_employment_id', ppe.id, 'pay_period_id', ppe.pay_period_id,
           'employment_id', ppe.employment_id, 'period_state', pp.state, 'row_state', ppe.state,
           'row_created_at', ppe.created_at, 'period_submitted_at', pp.submitted_at,
           'employment_pay_group', em.pay_group_id, 'period_pay_group', pp.pay_group_id)), '[]'::jsonb)
    into v_n, v_rows
    from hr.pay_period_employment ppe
    join hr.pay_period pp on pp.id = ppe.pay_period_id
    join hr.employment em on em.id = ppe.employment_id
   where pp.state <> 'open'
     and not exists (select 1 from hr.workflow_instance wi
                      where wi.target_token = 'hr_pay_period_employment'
                        and wi.target_id = ppe.id
                        and wi.flow_key in ('timecard_attestation','timecard_approval'));
  raise notice 'hr_l3_113 RED (pre-fix): % timecard(s) sit in a post-submit period with no '
               'attestation step and nobody asked: %', v_n, v_rows;
end
$red$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE WRITER — enrolment finishes the job it starts.
--
-- Phase 1 (insert + rollup + recompute enqueue) is hr_l3_28 / hr_l3_53, unchanged byte for byte.
-- Phase 2 is new.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr._enroll_pay_period_rows(
  p_pay_period_id uuid default null, p_employment_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_n integer := 0; v_new jsonb; r record; v_wk date; v_org uuid;
  -- hr_l3_113 — phase 2 state
  v_classes text[];      -- the worker classes that may be asked (SPEC-TIME §8)
  v_stmt    text;        -- the wording currently configured, offered to a row that carries none
  v_flow    text;        -- timecard_attestation, or timecard_approval where attestation is off
  v_asked   integer := 0;
  v_failed  integer := 0;
  v_req     jsonb;
begin
  perform hr.arm_write();

  with eligible as (
    select pp.id as pay_period_id, em.id as employment_id, pp.organization_id
      from hr.pay_period pp
      join hr.employment em on em.pay_group_id = pp.pay_group_id
     where (p_pay_period_id is null or pp.id = p_pay_period_id)
       and (p_employment_id is null or em.id = p_employment_id)
       and em.deleted_at is null
       -- decision 4: never a period whose money has already left
       and pp.state in ('open','submitted','approved','reopened')
       -- decision 3: the employment must actually overlap the period
       and em.hire_date <= pp.period_end_on
       and (em.termination_date is null or em.termination_date >= pp.period_start_on)
  ), ins as (
    insert into hr.pay_period_employment
      (pay_period_id, employment_id, organization_id, engine_key, engine_version)
    select e.pay_period_id, e.employment_id, e.organization_id,
           -- decision 2: honest provenance - nothing has been computed on this row
           'hr.pay_period_enrollment', 'enrollment'
      from eligible e
    on conflict (pay_period_id, employment_id) do nothing
    returning pay_period_id, employment_id
  )
  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object('pay_period_id', i.pay_period_id,
                                               'employment_id', i.employment_id)), '[]'::jsonb)
    into v_n, v_new
    from ins i;

  -- hr_l3_53: a row enrolled AFTER the hours were computed would read 0.00 until the next
  -- recompute. Decision 3: only for pairs that actually have current intervals -- a row
  -- enrolled before any work exists is correctly zero and keeps its honest placeholder.
  for r in select (x ->> 'pay_period_id')::uuid pid, (x ->> 'employment_id')::uuid eid
             from jsonb_array_elements(coalesce(v_new, '[]'::jsonb)) x
  loop
    if exists (select 1 from hr.work_interval wi
                where wi.employment_id = r.eid and wi.is_current
                  and wi.pay_period_id = r.pid) then
      -- decision 2: the totals land NOW, through the one rollup writer
      perform hr._ppe_rollup_refresh(r.pid, r.eid);
      select em.organization_id into v_org from hr.employment em where em.id = r.eid;
      -- decision 4: the unit is the workweek, so the engine is asked once per week
      for v_wk in select distinct hr._recompute_workweek_start(r.eid, wi.local_work_date)
                    from hr.work_interval wi
                   where wi.employment_id = r.eid and wi.is_current
                     and wi.pay_period_id = r.pid
      loop
        perform hr._recompute_enqueue(r.eid, v_wk, v_org, 'pay_period_enrollment');
      end loop;
    end if;
  end loop;

  -- ═══════════════════════════════════════════════════════════════════════════════════════════════
  -- 🚨 hr_l3_113 — PHASE 2: A ROW THAT ARRIVES AFTER THE ROUND IS STILL ASKED.
  --
  -- hr.pay_period_transition opens the attestation instances exactly once, at open→submitted.
  -- Everything enrolled into a `submitted | approved | reopened` period arrives after that moment
  -- and would otherwise carry no step, no wording, and no way out of `open` — SPEC-TIME §7.1's
  -- "ONE timecard_attestation instance per INCLUDED employment", unhonoured for a member that
  -- joined late. This closes it at OFFER time, which for such a row is now (SPEC-TIME §2.2).
  --
  -- Scoped to rows IN SCOPE of this call, not to rows this call INSERTED: an `on conflict do
  -- nothing` that swallowed the insert never meant the work was done (hr_l3_112). That is also what
  -- makes hr.pay_period_generate — which sweeps every period of a pay group — the repair path for a
  -- row the submit missed, including one whose employment has since moved pay groups (hr_l3_91).
  -- ═══════════════════════════════════════════════════════════════════════════════════════════════
  v_classes := hr._time_punch_enabled_worker_classes();
  v_stmt    := hr._knob('hr.time_and_attendance','attestation_statement') #>> '{}';
  v_flow    := case when coalesce((hr._knob('hr.time_and_attendance','employee_attestation_required')
                                     #>> '{}')::boolean, true)
                    then 'timecard_attestation' else 'timecard_approval' end;

  for r in
    select ppe.id            as ppe_id,
           ppe.pay_period_id as pay_period_id,
           ppe.employment_id as employment_id,
           ppe.organization_id,
           ppe.attestation_statement as prior,
           pp.state          as period_state,
           pp.period_end_on
      from hr.pay_period_employment ppe
      join hr.pay_period pp on pp.id = ppe.pay_period_id
      join hr.employment em on em.id = ppe.employment_id
      -- the same effective-dated applicability read hr.pay_period_transition uses, as of the
      -- period's end date (SPEC-TIME §0 law 3 — the fact in force for the period, not today's)
      left join lateral (
        select pa.worker_class from hr.position_assignment pa
         where pa.employment_id = em.id and pa.deleted_at is null
           and pa.effective_from <= pp.period_end_on
           and (pa.effective_to is null or pa.effective_to >= pp.period_end_on)
         order by pa.is_primary desc, pa.effective_from desc limit 1
      ) pa on true
     where (p_pay_period_id is null or ppe.pay_period_id = p_pay_period_id)
       and (p_employment_id is null or ppe.employment_id = p_employment_id)
       -- the round has already run for these three; `open` is not repaired here because the submit
       -- has not happened yet and hr.pay_period_transition will visit this row when it does.
       -- exported | locked | closed are never enrolled into (hr_l3_28 decision 4) and are never
       -- asked retroactively: the money has left and SPEC-TIME §7.1 routes that to the adjustment
       -- lane. Check 39 reports any such row rather than this function silently inventing a step.
       and pp.state in ('submitted','approved','reopened')
       -- 🚨 hr.pay_period_transition's opening rule, repeated verbatim on purpose. A row outside it
       -- is HONESTLY EXCLUDED — it would have got no step at submit either — and check 39 names and
       -- counts that exclusion set rather than letting the filter hide it.
       and em.deleted_at is null
       and em.status in ('active','on_leave','suspended','terminated')
       and coalesce(pa.worker_class, 'employee') = any (v_classes)
       and not exists (select 1 from hr.workflow_instance wi
                        where wi.target_token = 'hr_pay_period_employment'
                          and wi.target_id    = ppe.id
                          and wi.flow_key in ('timecard_attestation','timecard_approval'))
  loop
    -- 🚨 THE WORDING IS STAMPED AT OFFER, AND CAN ONLY EVER FILL AN EMPTY COLUMN. coalesce() reads
    -- the OLD value, so a statement already standing on this row is what survives — SPEC-TIME §2.2,
    -- an org's later edit is never retroactive. Unlike hr.pay_period_transition, a non-null prior
    -- here is NOT a divergence to refuse over: it is the ordinary repair case (the submit stamped
    -- the row and its routing failed), and refusing would block the only repair there is.
    perform hr.arm_write();
    update hr.pay_period_employment ppe
       set attestation_statement =
             case when v_flow = 'timecard_attestation'
                  then coalesce(ppe.attestation_statement, v_stmt)
                  else ppe.attestation_statement end,
           -- metadata, not calc: hr._ppe_rollup_refresh REPLACES calc wholesale on every recompute,
           -- so a provenance note left there is erased by the next drain. metadata is where
           -- hr.timecard_wf_apply and hr._timecard_reject_reopen already record lifecycle facts.
           metadata = coalesce(ppe.metadata, '{}'::jsonb) || jsonb_build_object(
             'attestation_opened_after_the_round', true,
             'opened_by', 'hr._enroll_pay_period_rows',
             'period_state_when_opened', r.period_state,
             'flow_opened', v_flow,
             'note', 'This timecard was in a period whose attestation round had already run and it '
                  || 'carried no step, so the step was opened here rather than by '
                  || 'hr.pay_period_transition. SPEC-TIME 2.2 binds the wording at OFFER, and for '
                  || 'this row the offer is this moment. Nothing was attested on anybody''s behalf.')
     where ppe.id = r.ppe_id;

    -- The SAME idempotency key hr.pay_period_transition uses, so the two writers can never open two
    -- instances for one timecard: a replay RETURNS the existing instance (hr.wf_request §4.2).
    v_req := hr.wf_request(v_flow, 'hr_pay_period_employment', r.ppe_id, r.organization_id,
               jsonb_build_object('pay_period_id', r.pay_period_id,
                                  'employment_id', r.employment_id,
                                  'period_end_on', r.period_end_on,
                                  -- the ROW's own wording wins over the knob (hr_l3_112 part 3):
                                  -- route 5 renders the row, so payload and row must never differ
                                  'attestation_statement',
                                    case when v_flow = 'timecard_attestation'
                                         then coalesce(r.prior, v_stmt) else null end,
                                  'opened_after_the_round', true,
                                  'period_state_when_opened', r.period_state),
               r.employment_id, false,
               format('period:%s:emp:%s:%s', r.pay_period_id, r.employment_id, v_flow));

    if coalesce((v_req ->> 'granted')::boolean, false) then
      v_asked := v_asked + 1;
    else
      -- 🚨 A REFUSAL IS NEVER DISCARDED (hr_l3_91's law, restated). This function returns an
      -- integer row count and cannot carry an envelope, so the failure screams twice: here, in the
      -- log, at the moment it happens; and durably, because the row keeps no instance and punch
      -- battery check 39 goes RED naming it until somebody opens one.
      v_failed := v_failed + 1;
      raise warning 'hr_l3_113: could NOT open % for pay_period_employment % (employment %, period '
                    '%, period state %): % / %. Nobody has been asked to attest this timecard and '
                    'the row cannot leave `open`. Punch battery check 39 '
                    '(every_timecard_in_a_submitted_period_was_asked) reports it.',
                    v_flow, r.ppe_id, r.employment_id, r.pay_period_id, r.period_state,
                    v_req ->> 'reason', v_req ->> 'detail';
    end if;
  end loop;

  if v_asked > 0 or v_failed > 0 then
    raise notice 'hr_l3_113: % timecard(s) enrolled after the attestation round were asked, % could '
                 'not be routed.', v_asked, v_failed;
  end if;

  return v_n;
end
$fn$;

comment on function hr._enroll_pay_period_rows(uuid, uuid) is
  'hr_l3_28 / hr_l3_53 / hr_l3_113 — THE one enrolment writer for hr.pay_period_employment, and the '
  'only place the eligibility rule lives. Phase 1 enrols every eligible employment into every '
  'non-terminal period (effective-dated, idempotent, never a period whose money has left) and lands '
  'the totals for a pair that already has intervals. Phase 2 (hr_l3_113) opens the timecard flow, '
  'and stamps the attestation wording at offer, for every row IN SCOPE that sits in a period whose '
  'attestation round has already run and carries no step -- a late transfer, a backdated hire, or a '
  'row the submit missed. Scoped to rows in scope rather than rows inserted, which is what makes '
  'hr.pay_period_generate the repair door. Never overwrites a non-null attestation_statement and '
  'never attests on anybody''s behalf. Not client-reachable.';

revoke all on function hr._enroll_pay_period_rows(uuid, uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE DETECTOR — a timecard in a post-submit period that nobody was ever asked about.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr.timecards_never_asked_to_attest()
returns table(pay_period_employment_id uuid, pay_period_id uuid, employment_id uuid,
              period_state text, row_state text, worker_class text, employment_status text,
              row_created_at timestamptz, period_submitted_at timestamptz,
              carries_a_statement boolean, repairable boolean, repair text)
language sql
stable
security definer
set search_path to 'hr', 'public'
as $fn$
  -- Every row in a period that has ALREADY been submitted and that carries no timecard flow of any
  -- kind -- so nobody was ever asked, and hr.timecard_wf_apply has nothing to apply, so the row can
  -- never leave `open` and the period can never be approved.
  --
  -- Restricted to employments that SHOULD have been asked: hr.pay_period_transition's own opening
  -- rule. A row outside it (deleted, a status the submit skips, a worker class that may not punch --
  -- SPEC-TIME §8) is HONESTLY EXCLUDED here and counted, by name, in check 39's
  -- `sanctioned_exclusions`, so the filter is visible instead of silent.
  select ppe.id, ppe.pay_period_id, ppe.employment_id, pp.state, ppe.state,
         coalesce(pa.worker_class, 'employee'), em.status,
         ppe.created_at, pp.submitted_at,
         ppe.attestation_statement is not null,
         pp.state in ('submitted','approved','reopened'),
         case when pp.state in ('submitted','approved','reopened')
              then 'A payroll admin re-runs Generate periods for this pay group (route 32/33, '
                || 'public.hr_pay_period_generate). hr._enroll_pay_period_rows phase 2 stamps the '
                || 'wording and opens this row''s step. Idempotent; opens nothing that already exists.'
              else 'NOT repairable by attestation: this period is past export, so asking now would '
                || 'ask somebody to attest hours that have already been paid. SPEC-TIME 7.1 -- the '
                || 'adjustment lane (hr.time_adjustment_create) is the only door left.' end
    from hr.pay_period_employment ppe
    join hr.pay_period pp on pp.id = ppe.pay_period_id
    join hr.employment em on em.id = ppe.employment_id
    left join lateral (
      select pa2.worker_class from hr.position_assignment pa2
       where pa2.employment_id = em.id and pa2.deleted_at is null
         and pa2.effective_from <= pp.period_end_on
         and (pa2.effective_to is null or pa2.effective_to >= pp.period_end_on)
       order by pa2.is_primary desc, pa2.effective_from desc limit 1) pa on true
   where pp.state <> 'open'
     and em.deleted_at is null
     and em.status in ('active','on_leave','suspended','terminated')
     and coalesce(pa.worker_class, 'employee') = any (hr._time_punch_enabled_worker_classes())
     and not exists (select 1 from hr.workflow_instance wi
                      where wi.target_token = 'hr_pay_period_employment'
                        and wi.target_id    = ppe.id
                        and wi.flow_key in ('timecard_attestation','timecard_approval'));
$fn$;

comment on function hr.timecards_never_asked_to_attest() is
  'hr_l3_113: rows in a period whose attestation round has already run that carry no timecard flow '
  'at all -- nobody was ever asked, and the row cannot leave `open`. Read by '
  'hr.punch_write_path_conformance check 39. Complements check 38, which only sees rows where '
  'somebody DID attest. Not client-reachable.';

revoke all on function hr.timecards_never_asked_to_attest() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 3. PUNCH BATTERY CHECK 39.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
do $mig$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance';
  if v_src is null then
    raise exception 'hr_l3_113: hr.punch_write_path_conformance does not exist';
  end if;
  if position('every_timecard_in_a_submitted_period_was_asked' in v_src) > 0 then
    raise notice 'hr_l3_113: check 39 already present — skipping';
    return;
  end if;
  if position($anchor$  return next;

end
$function$$anchor$ in v_src) = 0 then
    raise exception 'hr_l3_113: tail anchor not found in hr.punch_write_path_conformance — refusing to guess';
  end if;

  v_new := replace(v_src,
$anchor$  return next;

end
$function$$anchor$,
$anchor$  return next;

  ---------------------------------------------------------------- 39. every timecard in a submitted period was actually asked
  check_key := 'every_timecard_in_a_submitted_period_was_asked';
  select coalesce(jsonb_agg(jsonb_build_object(
           'pay_period_employment_id', t.pay_period_employment_id,
           'pay_period_id', t.pay_period_id,
           'employment_id', t.employment_id,
           'period_state', t.period_state,
           'row_state', t.row_state,
           'worker_class', t.worker_class,
           'employment_status', t.employment_status,
           'row_created_at', t.row_created_at,
           'period_submitted_at', t.period_submitted_at,
           'carries_a_statement', t.carries_a_statement,
           'repairable', t.repairable,
           'repair', t.repair)
           order by t.period_submitted_at, t.row_created_at), '[]'::jsonb)
    into v_bad from hr.timecards_never_asked_to_attest() t;
  ok       := (v_bad = '[]'::jsonb);
  severity := 'blocking';
  detail   := jsonb_build_object(
    'violations', v_bad,
    'rows_in_post_submit_periods', (select count(*) from hr.pay_period_employment ppe
                                      join hr.pay_period pp on pp.id = ppe.pay_period_id
                                     where pp.state <> 'open'),
    -- 🚨 THE EXCLUSIONS ARE SHOWN, NOT HIDDEN. These rows are in a post-submit period with no step
    -- and are NOT counted as violations, because hr.pay_period_transition would not have asked them
    -- either (SPEC-TIME 8 -- a contractor is never asked to attest). A filter nobody can see is a
    -- filter nobody audits, so the reason and the count are printed here every run.
    'sanctioned_exclusions', coalesce((
      select jsonb_object_agg(x.why, x.n) from (
        select case when em.deleted_at is not null then 'employment_deleted'
                    when em.status not in ('active','on_leave','suspended','terminated')
                         then 'employment_status:' || em.status
                    else 'worker_class_may_not_punch:' || coalesce(pa.worker_class, 'employee') end as why,
               count(*) as n
          from hr.pay_period_employment ppe
          join hr.pay_period pp on pp.id = ppe.pay_period_id
          join hr.employment em on em.id = ppe.employment_id
          left join lateral (
            select pa2.worker_class from hr.position_assignment pa2
             where pa2.employment_id = em.id and pa2.deleted_at is null
               and pa2.effective_from <= pp.period_end_on
               and (pa2.effective_to is null or pa2.effective_to >= pp.period_end_on)
             order by pa2.is_primary desc, pa2.effective_from desc limit 1) pa on true
         where pp.state <> 'open'
           and not exists (select 1 from hr.workflow_instance wi
                            where wi.target_token = 'hr_pay_period_employment'
                              and wi.target_id    = ppe.id
                              and wi.flow_key in ('timecard_attestation','timecard_approval'))
           and (em.deleted_at is not null
                or em.status not in ('active','on_leave','suspended','terminated')
                or coalesce(pa.worker_class, 'employee') <> all (hr._time_punch_enabled_worker_classes()))
         group by 1) x), '{}'::jsonb),
    'why', 'hr_l3_113: hr.pay_period_transition opens ONE timecard flow per included employment at '
      || 'open->submitted, exactly once. hr._enroll_pay_period_rows writes rows into submitted, '
      || 'approved and reopened periods too (hr_l3_28 decision 4), so a late transfer or a backdated '
      || 'hire landed with state=open, attestation_statement NULL and NO workflow instance: that '
      || 'person is never asked to attest their hours, route 5 has no step to offer them, and the '
      || 'row cannot leave `open`, which blocks the whole period from being approved. Check 38 '
      || 'stays GREEN on this because nobody attested -- 38 asks whether a signature recorded its '
      || 'wording, 39 asks whether the person was ever asked at all. Measured live 2026-08-29: 1 of '
      || '200 rows, pay_period_employment a782f00d, whose employment had moved pay groups before '
      || 'hr_l3_91 taught the submit that a period''s membership is its ROWS. SPEC-TIME 7.1 -- ONE '
      || 'instance per INCLUDED employment; SPEC-TIME 2.2 -- the wording binds at OFFER, which for a '
      || 'late row is when it arrives. Detector: hr.timecards_never_asked_to_attest(). Each '
      || 'violation carries its own `repair` sentence; `sanctioned_exclusions` names every row the '
      || 'detector deliberately does not count.');
  return next;

end
$function$$anchor$);
  execute v_new;
end
$mig$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE CONTRACTS — a re-emit that drops any of this is a failure, not a merge.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
delete from hr.function_contract
 where home_migration = 'hr_l3_113_a_person_enrolled_after_the_round_is_still_asked';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
values
  ('hr', '_enroll_pay_period_rows', 'hr_l3_113_a_person_enrolled_after_the_round_is_still_asked',
   array[
     'A ROW THAT ARRIVES AFTER THE ROUND IS STILL ASKED',
     'hr.wf_request',
     $q$pp.state in ('submitted','approved','reopened')$q$,
     $q$format('period:%s:emp:%s:%s', r.pay_period_id, r.employment_id, v_flow)$q$,
     'coalesce(ppe.attestation_statement, v_stmt)',
     'attestation_opened_after_the_round',
     'every_timecard_in_a_submitted_period_was_asked'],
   array[]::text[],
   'ENROLMENT FINISHES THE JOB IT STARTS. hr.pay_period_transition opens the timecard flow exactly '
   || 'once, at open->submitted. This function writes rows into submitted, approved and reopened '
   || 'periods, so without phase 2 a late transfer or backdated hire is never asked to attest, '
   || 'carries no wording, and cannot leave `open` -- which blocks the period. Phase 2 must (a) run '
   || 'over rows IN SCOPE, never only rows this call inserted (an on-conflict-do-nothing insert '
   || 'never meant the work was done -- hr_l3_112 -- and scoping to inserts would also destroy the '
   || 'hr.pay_period_generate repair path), (b) reuse hr.pay_period_transition''s idempotency key so '
   || 'two writers can never open two instances for one timecard, (c) stamp the wording through a '
   || 'coalesce that reads the OLD value so it can only ever FILL a NULL (SPEC-TIME 2.2 -- an org''s '
   || 'edit is never retroactive), and (d) restrict itself to the three post-submit states that are '
   || 'still askable: a period past export is the adjustment lane, not a new attestation.',
   true),
  ('hr', 'timecards_never_asked_to_attest', 'hr_l3_113_a_person_enrolled_after_the_round_is_still_asked',
   array['flow_key in (''timecard_attestation'',''timecard_approval'')',
         $q$pp.state <> 'open'$q$,
         'hr._time_punch_enabled_worker_classes()'],
   array[]::text[],
   'The detector behind check 39. It must look for the ABSENCE of a flow of EITHER kind (an org '
   || 'with employee_attestation_required off opens timecard_approval instead, and a row carrying '
   || 'that one has been asked), must scope to periods past `open` (an open period has not run its '
   || 'round yet and its rows are correctly stepless), and must apply '
   || 'hr._time_punch_enabled_worker_classes() so a contractor -- who is never asked to attest, '
   || 'SPEC-TIME 8 -- is an honest exclusion rather than a permanent false positive that gets the '
   || 'check muted.',
   true),
  ('hr', 'punch_write_path_conformance', 'hr_l3_113_a_person_enrolled_after_the_round_is_still_asked',
   array['every_timecard_in_a_submitted_period_was_asked',
         'hr.timecards_never_asked_to_attest',
         'sanctioned_exclusions'],
   array[]::text[],
   'Check 39 asserts that everybody holding a timecard in a period whose attestation round has run '
   || 'was actually ASKED. It is the complement of check 38, not a duplicate: 38 is scoped to rows '
   || 'where somebody attested (attested_at is not null) and is structurally blind to the row where '
   || 'nobody ever was. A re-emit of the conformance function that drops check 39 restores that '
   || 'blindness in silence, which is exactly how the gap survived hr_l3_91 and hr_l3_112. '
   || '`sanctioned_exclusions` is named here too: a check that filters rows away without printing '
   || 'what it filtered is a check nobody can audit.',
   true);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 5. WHERE THE CHECK STANDS AFTER THE FIX.
--
-- The WRITER is repaired for every future late enrolment. The one live row measured in section 0 is
-- NOT backfilled: hr.wf_request refuses `no_caller` when auth.uid() is NULL and a migration runs as
-- postgres, so opening its instance from here would mean forging a caller to manufacture a workflow
-- instance for an act no human took -- the exact fabrication this migration exists to prevent. The
-- check therefore ships RED, names the row, and names the act that clears it: a payroll admin runs
-- Generate periods for that pay group (public.hr_pay_period_generate), which reaches phase 2.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare v_n integer; v_row record; v_detail jsonb;
begin
  select count(*) into v_n from hr.timecards_never_asked_to_attest();
  select detail into v_detail from hr.punch_write_path_conformance()
   where check_key = 'every_timecard_in_a_submitted_period_was_asked';
  if v_detail is null then
    raise exception 'hr_l3_113: check 39 did not come back from hr.punch_write_path_conformance()';
  end if;
  raise notice 'hr_l3_113 check 39: % violation(s); sanctioned_exclusions=%; violations=%',
    v_n, v_detail -> 'sanctioned_exclusions', v_detail -> 'violations';
  for v_row in select * from hr.timecards_never_asked_to_attest() loop
    raise notice 'hr_l3_113 UNASKED: ppe=% employment=% period=% (%) repairable=% -> %',
      v_row.pay_period_employment_id, v_row.employment_id, v_row.pay_period_id,
      v_row.period_state, v_row.repairable, v_row.repair;
  end loop;
end
$post$;

commit;
