-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- The standing check for what round-15 actually uncovered: timecards nobody can approve.
--
-- hr_l3_60 opened the approval GRID to the reporting-line manager. While proving it, the deeper
-- defect surfaced: `hr.can_approve` refuses her too, so the timecards she manages can be approved
-- by NOBODY. Measured across every login, for every enrolled employment with computed hours in a
-- non-terminal period — 3 of 7 have zero possible approvers, in two distinct shapes:
--
--   SHAPE A — the subject HAS a manager (FIX, XMID). `hr.wf_resolve_approvers` produces the manager
--   at its `reporting_line` rung, then its RECORDED DECISION 1 ("the predicate has the last word")
--   filters her through `hr.can_approve`, which has NO reporting-line rung: RULE 2 needs an
--   authority row (this database has zero, for any action) and RULE 3 is gated on `not v_has_mgr`.
--   The rung is structurally dead, so the chain yields nobody.
--
--   SHAPE B — the sole HR owner's OWN timecard (Armani). Top of chart resolves to him; RULE 1
--   forbids self-approval and admits no override. `sole_authority_mode` exists for exactly this
--   collision but resolves to `require_second_actor`, so there is no second actor to require.
--
-- 🚨 THIS IS NOT MINE TO FIX. Widening `hr.can_approve` decides who may act on payroll. Doing that
-- from a read lane, as a side effect of opening a grid, would be granting approval rights by
-- accident — the precise inverse of the over-tightening this round set out to correct. So it is
-- made VISIBLE and left for the workflow lane's ruling.
--
-- Authority: coordinator ruling (round-15) surfaced it; SPEC-WORKFLOW-ENGINE §2.2 (the fallback
-- chain), SPEC-ACCESS §1.3 (the predicate).
--
-- Applied live as `hr_l3_61_gate_every_timecard_has_an_approver`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. GREEN TODAY VIA A DATED ALLOWLIST, NOT VIA A LOOSER QUESTION. The three known pairs ride an
--    explicit allowlist carrying the shape and the date, exactly as T-41's dead doors do. Weakening
--    the check until it passed would have buried the finding; a red-on-arrival blocking check would
--    have broken the gate for a defect this lane cannot fix. The allowlist is printed in the detail
--    on EVERY run, so it cannot become the quiet place these go to be forgotten, and it shrinks by
--    deletion as the workflow lane closes them.
-- 2. IT ASKS THE PREDICATE, NOT THE SELECTOR. `hr.can_approve` is what actually decides whether an
--    act is permitted, and the selector defers to it by construction. Asking the selector would
--    need a live workflow step per row; asking the predicate needs only the target.
-- 3. SCOPED TO TIMECARDS WITH HOURS IN A LIVE PERIOD. An enrolled row with no computed intervals has
--    nothing to approve yet, and a closed or exported period is past approving. Both would be noise.
-- 4. THE TWO SHAPES ARE REPORTED SEPARATELY. "Has a manager" and "is the sole approver" have
--    different fixes — a reporting-line rung in the predicate versus a sole-authority mode — so the
--    check names which one each row is rather than lumping them into one count.

create or replace function hr.timecards_without_an_approver()
returns table(pay_period_employment_id uuid, employment_id uuid, subject text,
              pay_period_id uuid, has_manager boolean, shape text)
language sql stable security definer set search_path to 'hr','public'
as $fn$
  with cand as (
    -- decision 3: something to approve, and a period still open to approving it
    select ppe.id, ppe.employment_id, e.display_name, ppe.pay_period_id,
           hr.manager_as_of(ppe.employment_id, current_date) is not null has_mgr
      from hr.pay_period_employment ppe
      join hr.pay_period pp on pp.id = ppe.pay_period_id
      join hr.employment em on em.id = ppe.employment_id
      join hr.employee   e  on e.id  = em.employee_id
     where pp.state in ('open','submitted','approved','reopened')
       and exists (select 1 from hr.work_interval wi
                    where wi.employment_id = ppe.employment_id and wi.is_current
                      and wi.pay_period_id = ppe.pay_period_id)
  ), logins as (
    select distinct e.login_user_id uid
      from hr.employee e join hr.employment em on em.employee_id = e.id
     where e.login_user_id is not null and em.deleted_at is null
  )
  select c.id, c.employment_id, c.display_name, c.pay_period_id, c.has_mgr,
         -- decision 4: the two shapes have different fixes, so they are named apart
         case when c.has_mgr then 'reporting_line_rung_absent_from_predicate'
              else 'sole_approver_cannot_self_approve' end
    from cand c
   where not exists (
     -- decision 2: the predicate, which is what the selector defers to
     select 1 from logins l
      where hr.can_approve(l.uid, 'timecard_approve', 'hr.pay_period_employment', c.id, current_date));
$fn$;

revoke execute on function hr.timecards_without_an_approver() from public, anon;

do $mig$
declare
  v_def text;
  v_anchor text := 'A marker is an array or it is absent; it is never a JSON null.'');'
    || E'\n  return next;\nend';
  v_block text;
begin
  v_def := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  if position('every_timecard_has_an_approver' in v_def) > 0 then
    raise notice 'hr_l3_61: the check is already wired'; return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_61: could not find the end of the conformance function; refusing to guess';
  end if;

  v_block :=
'A marker is an array or it is absent; it is never a JSON null.'');
  return next;

  ---------------------------------------------------------------- 26. every live timecard has somebody who can approve it
  check_key := ''every_timecard_has_an_approver'';
  select coalesce(jsonb_agg(jsonb_build_object(
           ''subject'', t.subject, ''pay_period_id'', t.pay_period_id,
           ''has_manager'', t.has_manager, ''shape'', t.shape) order by t.subject), ''[]''::jsonb)
    into v_bad
    from hr.timecards_without_an_approver() t
    -- decision 1: dated, stated, printed below on every run, and shrinking by deletion
   where t.pay_period_employment_id not in (
     select ppe.id from hr.pay_period_employment ppe
      join hr.employment em on em.id = ppe.employment_id
      join hr.employee e on e.id = em.employee_id
     where e.display_name in (''G2S-FIX Fiona Xavier'', ''G2S-XMID Ximena Delgado'', ''Armani Sadeghi''));
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(
    ''violations'', v_bad,
    ''known_2026_08_27'', (select coalesce(jsonb_agg(jsonb_build_object(
          ''subject'', t.subject, ''shape'', t.shape) order by t.subject), ''[]''::jsonb)
        from hr.timecards_without_an_approver() t),
    ''why'', ''A timecard nobody can approve stalls payroll with no error anywhere -- the surface ''
      || ''simply never advances. Two shapes exist today. Where the subject HAS a manager, ''
      || ''hr.wf_resolve_approvers produces her at its reporting_line rung and then filters her ''
      || ''through hr.can_approve, which has no reporting-line rung, so the rung is structurally ''
      || ''dead. Where the subject IS the sole approver, RULE 1 forbids self-approval and ''
      || ''sole_authority_mode resolves to require_second_actor with no second actor to require. ''
      || ''Both belong to the workflow lane: widening the predicate decides who may act on payroll ''
      || ''and must not happen as a side effect of opening a read surface.'');
  return next;
end';

  v_def := replace(v_def, v_anchor, v_block);
  execute v_def;
end
$mig$;

-- ── self-assertions ─────────────────────────────────────────────────────────────────────────
do $chk$
declare v_n int; v_fail jsonb;
begin
  -- the finding is real and still measurable
  if (select count(*) from hr.timecards_without_an_approver()) < 3 then
    raise exception 'hr_l3_61: the unapprovable set shrank unexpectedly; re-verify before trusting the allowlist';
  end if;
  -- both shapes are represented, or decision 4 is meaningless
  if (select count(distinct shape) from hr.timecards_without_an_approver()) <> 2 then
    raise exception 'hr_l3_61: expected both shapes in the measured set';
  end if;

  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n < 26 then
    raise exception 'hr_l3_61: expected at least 26 checks, found %', v_n;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('check', check_key, 'detail', detail)), '[]'::jsonb)
    into v_fail from hr.punch_write_path_conformance() where not ok;
  if v_fail <> '[]'::jsonb then
    raise exception 'hr_l3_61: the gate is red on arrival: %', v_fail::text;
  end if;
end
$chk$;
