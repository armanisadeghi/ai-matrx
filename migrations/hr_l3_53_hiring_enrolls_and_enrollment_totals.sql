-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Finding E: the third enrollment direction, and the stale zero all three left behind.
--
-- 🚨 (a) HIRING INTO A PAY GROUP DID NOT ENROLL. `public.hr_employee_create` writes
-- `employment.pay_group_id` and never calls `hr._enroll_pay_period_rows`. Measured live: the two
-- other directions call it (`hr.pay_period_generate` when a period is created,
-- `public.hr_employment_set_pay_group` when the group changes) and the hire path calls it zero
-- times. So a person hired into an existing, already-generated pay group has no
-- `hr.pay_period_employment` row until something else happens to trigger enrollment — no timecard,
-- no attestation, no line on the approval grid. They are simply absent from the period they worked.
--
-- 🚨 (b) AND ENROLLMENT AFTER COMPUTATION READS ZERO. `hr._enroll_pay_period_rows` creates the row
-- with `total_hours 0.00, calc {}, engine_key 'hr.pay_period_enrollment'` — honest at enrollment
-- time, because nothing has been computed. But when the enrollment happens AFTER intervals already
-- exist (a late hire backfilled, a pay-group correction, or now the hire path itself), the row sits
-- on that zero until the next recompute. Same shape as blocker S6: not a broken page anybody
-- reports, a number a manager approves.
--
-- Authority: coordinator ruling (finding E). Effective dating and terminal-period rules are
-- untouched — `hr._enroll_pay_period_rows` already enforces both and this migration does not go
-- near them.
--
-- Applied live as `hr_l3_53_hiring_enrolls_and_enrollment_totals`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE FIX FOR (b) GOES IN THE SHARED WRITER, SO ALL THREE DIRECTIONS GET IT. The ruling asks
--    that enrollment not leave a stale zero; putting that in `hr._enroll_pay_period_rows` means the
--    hire path, the period-generation path and the pay-group-change path are covered by one change,
--    and a fourth direction added later inherits it. Three call sites each remembering to refresh
--    is how the first three directions came to differ in the first place.
-- 2. 🚨 IT REFRESHES *AND* ENQUEUES, BECAUSE THE ENQUEUE ALONE CANNOT DELIVER THE RULING. The
--    ruling says enqueue a recompute so the row never sits on a stale zero. Verified: no
--    `hr_time_recompute` handler is registered, so `hr._recompute_enqueue` returns
--    `{enqueued:false, reason:'no_registered_handler'}` and the row would stay at zero exactly as
--    before. So the row is ALSO totalled in-transaction through `hr._ppe_rollup_refresh` — the one
--    rollup writer from hr_l3_44 — which is what actually makes the stated outcome true today. The
--    enqueue is still made, because a real re-derivation is the engine's job and overtime is
--    computed on the whole workweek, which a rollup of existing intervals cannot re-decide.
-- 3. ONLY WHERE INTERVALS ALREADY EXIST. A row enrolled before any work is computed is *correctly*
--    zero, and refreshing it would flip `engine_key` off the honest `hr.pay_period_enrollment`
--    placeholder onto `hr.time_engine` while claiming an engine had run. The refresh and the
--    enqueue fire only for pairs that actually have current intervals in that period.
-- 4. ENQUEUED PER WORKWEEK, NOT PER DAY. The unit of recompute is the workweek (overtime is
--    computed on the whole week), so the distinct set is taken through
--    `hr._recompute_workweek_start` — a fortnight of daily intervals produces two enqueues, not
--    fourteen.
-- 5. THE HIRE PATH REPORTS WHAT IT ENROLLED. `hr_employee_create` returns
--    `enrolled_pay_period_rows`, so a hire into a pay group with no generated periods (a real and
--    correct case, answering 0) is distinguishable from a hire that silently failed to enrol.

-- ── 1. the shared writer totals what it enrols (decisions 1–4) ───────────────────────────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr._enroll_pay_period_rows(uuid,uuid)'::regprocedure);

  if position('_ppe_rollup_refresh' in v_def) > 0 then
    raise notice 'hr_l3_53: the shared writer already totals what it enrols';
    return;
  end if;
  if position('    returning 1' in v_def) = 0
     or position('  select count(*)::integer into v_n from ins;' in v_def) = 0 then
    raise exception 'hr_l3_53: _enroll_pay_period_rows does not match what this migration expects';
  end if;

  v_def := replace(v_def,
    'declare v_n integer := 0;',
    'declare v_n integer := 0; v_new jsonb; r record; v_wk date; v_org uuid;');

  v_def := replace(v_def, '    returning 1', '    returning pay_period_id, employment_id');

  v_def := replace(v_def,
    '  select count(*)::integer into v_n from ins;',
    '  select count(*)::integer,' || E'\n' ||
    '         coalesce(jsonb_agg(jsonb_build_object(''pay_period_id'', i.pay_period_id,' || E'\n' ||
    '                                               ''employment_id'', i.employment_id)), ''[]''::jsonb)' || E'\n' ||
    '    into v_n, v_new' || E'\n' ||
    '    from ins i;' || E'\n\n' ||
    '  -- hr_l3_53: a row enrolled AFTER the hours were computed would read 0.00 until the next' || E'\n' ||
    '  -- recompute. Decision 3: only for pairs that actually have current intervals -- a row' || E'\n' ||
    '  -- enrolled before any work exists is correctly zero and keeps its honest placeholder.' || E'\n' ||
    '  for r in select (x ->> ''pay_period_id'')::uuid pid, (x ->> ''employment_id'')::uuid eid' || E'\n' ||
    '             from jsonb_array_elements(coalesce(v_new, ''[]''::jsonb)) x' || E'\n' ||
    '  loop' || E'\n' ||
    '    if exists (select 1 from hr.work_interval wi' || E'\n' ||
    '                where wi.employment_id = r.eid and wi.is_current' || E'\n' ||
    '                  and wi.pay_period_id = r.pid) then' || E'\n' ||
    '      -- decision 2: the totals land NOW, through the one rollup writer' || E'\n' ||
    '      perform hr._ppe_rollup_refresh(r.pid, r.eid);' || E'\n' ||
    '      select em.organization_id into v_org from hr.employment em where em.id = r.eid;' || E'\n' ||
    '      -- decision 4: the unit is the workweek, so the engine is asked once per week' || E'\n' ||
    '      for v_wk in select distinct hr._recompute_workweek_start(r.eid, wi.local_work_date)' || E'\n' ||
    '                    from hr.work_interval wi' || E'\n' ||
    '                   where wi.employment_id = r.eid and wi.is_current' || E'\n' ||
    '                     and wi.pay_period_id = r.pid' || E'\n' ||
    '      loop' || E'\n' ||
    '        perform hr._recompute_enqueue(r.eid, v_wk, v_org, ''pay_period_enrollment'');' || E'\n' ||
    '      end loop;' || E'\n' ||
    '    end if;' || E'\n' ||
    '  end loop;');

  execute v_def;
end
$mig$;

-- ── 2. the third direction: hiring into a pay group (decision 5) ─────────────────────────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_employee_create(jsonb)'::regprocedure);

  if position('_enroll_pay_period_rows' in v_def) > 0 then
    raise notice 'hr_l3_53: the hire path already enrols';
    return;
  end if;
  if position('  v_loc uuid; v_jur uuid; v_audit uuid; v_display text; v_spell int;' in v_def) = 0
     or position('  v_audit := hr._l1_write_audit(v_org, ''hr_employee'', ''create'', ARRAY[v_employee],' in v_def) = 0
     or position('    ''is_prehire'', v_hire > current_date, ''audit_id'', v_audit,' in v_def) = 0 then
    raise exception 'hr_l3_53: hr_employee_create does not match what this migration expects';
  end if;

  v_def := replace(v_def,
    '  v_loc uuid; v_jur uuid; v_audit uuid; v_display text; v_spell int;',
    '  v_loc uuid; v_jur uuid; v_audit uuid; v_display text; v_spell int;' || E'\n' ||
    '  v_enrolled integer := 0;');

  -- after every write, before the audit line that closes the door
  v_def := replace(v_def,
    '  v_audit := hr._l1_write_audit(v_org, ''hr_employee'', ''create'', ARRAY[v_employee],',
    '  -- hr_l3_53: THE THIRD ENROLMENT DIRECTION. Hiring into an already-generated pay group left' || E'\n' ||
    '  -- the person with no hr.pay_period_employment row at all -- no timecard, no attestation, no' || E'\n' ||
    '  -- line on the approval grid for a period they worked. Same shared writer as the other two;' || E'\n' ||
    '  -- it owns the effective-dating and terminal-period rules and they are unchanged.' || E'\n' ||
    '  v_enrolled := hr._enroll_pay_period_rows(null, v_employment);' || E'\n\n' ||
    '  v_audit := hr._l1_write_audit(v_org, ''hr_employee'', ''create'', ARRAY[v_employee],');

  v_def := replace(v_def,
    '    ''is_prehire'', v_hire > current_date, ''audit_id'', v_audit,',
    '    ''is_prehire'', v_hire > current_date, ''audit_id'', v_audit,' || E'\n' ||
    '    ''enrolled_pay_period_rows'', v_enrolled,');

  execute v_def;
end
$mig$;

-- ── 3. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare v_bad text;
begin
  -- all three directions route through the one shared writer
  select string_agg(x.fn, ', ') into v_bad from (
    select f.fn from (values
        ('pay_period_generate'), ('hr_employment_set_pay_group'), ('hr_employee_create')
      ) f(fn)
     where not exists (
       select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('hr','public') and p.proname = f.fn
          and p.prosrc ~ '_enroll_pay_period_rows')
  ) x;
  if v_bad is not null then
    raise exception 'hr_l3_53: an enrolment direction does not call the shared writer: %', v_bad;
  end if;

  -- decision 1: the totalling lives in the shared writer, not at a call site
  if (select prosrc from pg_proc where oid = 'hr._enroll_pay_period_rows(uuid,uuid)'::regprocedure)
     !~ '_ppe_rollup_refresh' then
    raise exception 'hr_l3_53: the shared writer does not total what it enrols';
  end if;
  if (select prosrc from pg_proc where oid = 'hr._enroll_pay_period_rows(uuid,uuid)'::regprocedure)
     !~ '_recompute_enqueue' then
    raise exception 'hr_l3_53: the shared writer does not enqueue a recompute';
  end if;

  -- decision 3: the refresh must be conditional on intervals existing
  if (select prosrc from pg_proc where oid = 'hr._enroll_pay_period_rows(uuid,uuid)'::regprocedure)
     !~ 'if exists \(select 1 from hr\.work_interval' then
    raise exception 'hr_l3_53: the refresh is unconditional; a pre-computation row would claim an engine ran';
  end if;

  -- the effective-dating and terminal-period rules are untouched (ruling)
  if (select prosrc from pg_proc where oid = 'hr._enroll_pay_period_rows(uuid,uuid)'::regprocedure)
     !~ 'em\.hire_date <= pp\.period_end_on'
     or (select prosrc from pg_proc where oid = 'hr._enroll_pay_period_rows(uuid,uuid)'::regprocedure)
     !~ 'pp\.state in \(''open'',''submitted'',''approved'',''reopened''\)' then
    raise exception 'hr_l3_53: the effective-dating or terminal-period rule was disturbed';
  end if;
end
$chk$;
