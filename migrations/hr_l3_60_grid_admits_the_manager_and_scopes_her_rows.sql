-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Round-15: the person approvals route to could not see the surface approvals happen on —
-- and, it turns out, could not approve either.
--
-- `hr.timesheet_period_grid` gated on `hr._time_has_timecard_approve`, which reads explicit
-- `hr.approval_authority` rows. Priya (ca9e12da, uid 20149d3f) manages XMID and FIX through the
-- primary reporting line, holds `time.read` over both (verified: true / true), opens each timesheet
-- individually — and was refused the grid.
--
-- 🚨 BUT THE RULING'S PREMISE DOES NOT HOLD, AND THE TRUTH IS WORSE. The ruling says to admit
-- whoever the timecard-approval resolver would resolve. Measured before building anything: the
-- resolver would NOT resolve her either.
--
--   hr.approval_authority rows in this database ............................ 0 (none, any action)
--   hr.can_approve(priya, 'timecard_approve', XMID's timecard) ............. FALSE
--   hr.can_approve(priya, 'timecard_approve', FIX's timecard)  ............. FALSE
--
-- `hr.wf_resolve_approvers`'s chain does produce her at the `reporting_line` rung, but its RECORDED
-- DECISION 1 — "THE PREDICATE HAS THE LAST WORD" — then filters every candidate through
-- `hr.can_approve`, and `hr.can_approve` has NO reporting-line rung: RULE 2 needs an authority row,
-- and RULE 3 (top of chart) is gated on `if not v_has_mgr`. So for any subject who HAS a manager,
-- with no authority rows seeded, the chain yields nobody. Measured across every login in the org
-- for the shared period:
--
--   XMID  approvable by: NOBODY (not the hr_owner, not their own manager)
--   FIX   approvable by: NOBODY
--   CAOT  approvable by: the hr_owner only — because CAOT has no manager, so RULE 3 fires
--
-- Implementing the ruling literally would therefore have changed nothing: the gate would call the
-- resolver, the resolver would still refuse her, and the proof would fail. So this migration takes
-- the ruling's OTHER sanctioned option — "or the derived-manager lane the read doors use" — and the
-- predicate defect is reported to the workflow lane rather than fixed here on my own authority.
--
-- Authority: coordinator ruling (round-15), second option; SPEC-TIME §8.2.
--
-- Applied live as `hr_l3_60_grid_admits_the_manager_and_scopes_her_rows`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE GRID ADMITS ON THE READ-DOOR LANE, NOT A SECOND COPY OF THE FALLBACK CHAIN. The predicate
--    is `hr.capability(user, 'time.read', employment, at)` — the very predicate `hr.timesheet_get`
--    uses to decide whether she may open that timesheet individually. So the grid can admit exactly
--    the people who can already open the rows it would show, by construction, with no new reach
--    invented and no fallback logic duplicated.
-- 2. 🚨 THE ROW SET IS SCOPED, AND IT WAS NOT BEFORE. The grid's `base` CTE filtered only on
--    pay period and worker class — every enrolled row, for anyone who passed the gate. Admitting
--    the manager without scoping would have handed her CAOT's and MULTI's timecards, which she
--    cannot open individually. The same predicate now filters the rows, so the grid shows precisely
--    what the reader could reach one at a time. Verified: Priya reads XMID and FIX, and neither
--    CAOT nor MULTI.
-- 3. HR'S LANE IS UNTOUCHED, AND FALLS OUT OF THE SAME PREDICATE. An HR holder passes
--    `hr.capability(..., 'time.read', <any employment>, ...)` org-wide, so they gate in and see
--    every row without a branch. One predicate for the gate and the rows, one for HR and managers —
--    fewer places to disagree.
-- 4. THE AUTHORITY LANE IS KEPT AS A DISJUNCT, NOT REPLACED. An explicit `timecard_approve` holder
--    who somehow lacks `time.read` still gates in through `hr._time_has_timecard_approve`. Removing
--    it would narrow the door while widening it, and the ruling only widens.
-- 7. THE ROW SCOPE ADMITS WHAT YOU MAY APPROVE AS WELL AS WHAT YOU MAY READ. Scoping on
--    `time.read` alone would let an explicit `timecard_approve` holder through the gate and then
--    show them nothing — a granted, empty grid with no explanation, which is a worse answer than a
--    refusal. Measured while proving this: the only two actively-employed logins in the fixture org
--    are HR and the manager, so an authority-only holder had to be constructed to see it at all.
--    The approve disjunct is `hr.can_approve` — the resolver's own predicate, which the ruling
--    names — so gate and rows stay one question: you see what you may read or act on.
-- 5. THE REFUSAL NOW DESCRIBES WHAT IS ACTUALLY CHECKED. It said "timecard_approve authority
--    somewhere in this pay group, or HR" — which was already the wrong sentence for a manager, and
--    would be a worse one now. It names the manager lane too, and keeps naming the date.
-- 6. ⚠️ WHAT THIS MIGRATION DOES NOT FIX, AND MUST NOT. `hr.can_approve` refusing the reporting-line
--    manager makes XMID's and FIX's timecards unapprovable BY ANYONE. That is a defect in the
--    approval predicate — who may act on payroll — not in a read surface's gate, and widening it
--    from this lane on my own authority would be granting approval rights by side effect. Reported
--    for a ruling. The grid opening for Priya does not make her able to approve, and this migration
--    is careful not to imply otherwise.

-- ── 1. the reach predicate the read doors already use (decisions 1 and 3) ───────────────────
create or replace function hr._time_grid_reach(p_user uuid, p_pay_period_id uuid, p_at date)
returns boolean
language sql stable security definer set search_path to 'hr','public'
as $fn$
  -- "is there anything on this grid this person could open individually?"  Same predicate
  -- hr.timesheet_get gates a single timecard on; no second copy of §2.2's fallback chain.
  select exists (
    select 1
      from hr.pay_period_employment ppe
     where ppe.pay_period_id = p_pay_period_id
       and hr.capability(p_user, 'time.read', ppe.employment_id, p_at));
$fn$;

revoke execute on function hr._time_grid_reach(uuid,uuid,date) from public, anon;

-- ── 2. the gate admits the manager, and the rows are scoped to her reach ────────────────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.timesheet_period_grid(uuid,jsonb,jsonb)'::regprocedure);

  if position('_time_grid_reach' in v_def) > 0 then
    raise notice 'hr_l3_60: the grid already admits and scopes on the read-door lane';
    return;
  end if;

  ---------------------------------------------------------------- the gate (decisions 1, 4, 5)
  if position('  if not hr._time_has_timecard_approve(v_uid, v_per.organization_id, current_date) then' in v_def) = 0 then
    raise exception 'hr_l3_60: the grid gate has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '  if not hr._time_has_timecard_approve(v_uid, v_per.organization_id, current_date) then',
    '  -- hr_l3_60: the authority lane is KEPT (decision 4) and the read-door lane is added beside' || E'\n' ||
    '  -- it. The person approvals route to must be able to see the surface approvals happen on.' || E'\n' ||
    '  if not hr._time_has_timecard_approve(v_uid, v_per.organization_id, current_date)' || E'\n' ||
    '     and not hr._time_grid_reach(v_uid, p_pay_period_id, current_date) then');

  if position('''detail'', ''the approval grid is readable by someone holding timecard_approve authority somewhere in this pay group, or by HR with time.read. You hold neither today.'',' in v_def) = 0 then
    raise exception 'hr_l3_60: the grid refusal sentence has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '''detail'', ''the approval grid is readable by someone holding timecard_approve authority somewhere in this pay group, or by HR with time.read. You hold neither today.'',',
    '''detail'', ''the approval grid is readable by HR, by someone holding timecard_approve ''' || E'\n' ||
    '        || ''authority in this pay group, or by a manager with reach over somebody on it. You ''' || E'\n' ||
    '        || ''are none of those today, so there is no row here you could open.'',');

  ---------------------------------------------------------------- the rows (decision 2)
  if position('     where ppe.pay_period_id = p_pay_period_id' in v_def) = 0 then
    raise exception 'hr_l3_60: the grid base CTE has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '     where ppe.pay_period_id = p_pay_period_id',
    '     where ppe.pay_period_id = p_pay_period_id' || E'\n' ||
    '       -- 🚨 hr_l3_60 decision 2: a row is shown when the reader could open that timesheet one' || E'\n' ||
    '       -- at a time, OR may approve it. Before this the grid showed every enrolled row to' || E'\n' ||
    '       -- anyone who passed the gate, so admitting a manager without scoping would hand her' || E'\n' ||
    '       -- timecards she cannot open. The approve disjunct is decision 7: an explicit authority' || E'\n' ||
    '       -- holder who lacks time.read would otherwise gate in to an empty grid.' || E'\n' ||
    '       and (hr.capability(v_uid, ''time.read'', ppe.employment_id, current_date)' || E'\n' ||
    '            or hr.can_approve(v_uid, ''timecard_approve'', ''hr.pay_period_employment'',' || E'\n' ||
    '                              ppe.id, current_date))');

  execute v_def;
end
$mig$;

-- ── 3. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare v_src text; v_org uuid;
begin
  select prosrc into v_src from pg_proc where oid='hr.timesheet_period_grid(uuid,jsonb,jsonb)'::regprocedure;

  -- decision 4: the authority lane survives as a disjunct
  if position('hr._time_has_timecard_approve(v_uid, v_per.organization_id, current_date)' in v_src) = 0 then
    raise exception 'hr_l3_60: the authority lane was replaced rather than widened';
  end if;
  if position('hr._time_grid_reach(v_uid, p_pay_period_id, current_date)' in v_src) = 0 then
    raise exception 'hr_l3_60: the manager lane was not added to the gate';
  end if;
  -- decision 2: the rows are scoped
  if position('hr.capability(v_uid, ''time.read'', ppe.employment_id, current_date)' in v_src) = 0
     or position('hr.can_approve(v_uid, ''timecard_approve''' in v_src) = 0 then
    raise exception 'hr_l3_60: the row set is unscoped, or drops the approve disjunct';
  end if;
  -- decision 1: no second copy of the fallback chain anywhere in the grid
  if v_src ~ 'reporting_line|top_of_chart|manager_as_of' then
    raise exception 'hr_l3_60: the grid grew its own copy of the fallback chain';
  end if;

  -- the reach predicate agrees with the read door, on the real subjects
  select organization_id into v_org from hr.employment where id='ca9e12da-35bb-402d-8bda-1b76fa4c678d';
  if not hr._time_grid_reach('20149d3f-6572-4263-b43c-7e52f0e42058',
                             '0ba99b47-4961-4189-87f4-424f1778e8cb', current_date) then
    raise exception 'hr_l3_60: the manager still has no reach into her own reports'' period';
  end if;
  if hr._time_grid_reach('f83af954-1fd1-46d5-bfc1-54cb27d98666',
                         '0ba99b47-4961-4189-87f4-424f1778e8cb', current_date) then
    raise exception 'hr_l3_60: a non-manager non-HR user was admitted';
  end if;

  -- decision 6: this migration must not have widened who may APPROVE
  if hr.can_approve('20149d3f-6572-4263-b43c-7e52f0e42058','timecard_approve','hr.pay_period_employment',
       (select id from hr.pay_period_employment
         where employment_id='e7f35912-37fd-4358-a077-041acefd7327'
           and pay_period_id='0ba99b47-4961-4189-87f4-424f1778e8cb'), current_date) then
    raise exception 'hr_l3_60: opening a read surface granted approval rights; that was not the ruling';
  end if;
end
$chk$;
