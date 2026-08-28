-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Two findings from the drain diagnosis, both about a computation that succeeded while producing
-- something nobody can pay.
--
-- 🚨 1. NINE LIVE INTERVALS CARRY `pay_period_id = NULL` AND NOTHING SAYS SO. `hr._period_for_day`
--    returns NULL when no pay period covers the interval-day — the employment is in no pay group,
--    the pay group has generated no periods, or the calendar starts after the week (the
--    anchor-after-week case). `hr.recompute_apply` then loops its rollups over
--    `where ... pay_period_id is not null`, so those intervals contribute to NO rollup, and the
--    envelope returns `ok: true` with hours written. A timesheet that no payroll file can include
--    reads as a clean success. Measured: 9 current intervals, 1 employment, disclosed nowhere.
--
--    The marker rides where `split_pending` rides — with one structural difference that decides
--    the design: `hr._ppe_rollup_refresh` writes `hr.pay_period_employment`, keyed by
--    (pay_period_id, employment_id), and an interval belonging to NO period HAS NO SUCH ROW. So the
--    marker cannot live only there or it would be invisible in exactly the case it describes. It is
--    written in three places, each of which an administrator actually reads: the WORKWEEK it names
--    (persisting after the call), the recompute envelope (the drain's own answer), and the
--    pay-period rollup (for the partially-stamped week, where a period's totals are real but are
--    not the whole picture).
--
-- 🚨 2. TWO DERIVATIONS OF ONE BOUNDARY. `hr._recompute_workweek_start` reads
--    `pay_group.workweek_start_dow` and `coalesce(…, 0)` — so a pay-group-less employment silently
--    gets **dow 0, Sunday**, which is how 2026-08-23 (a Sunday) was produced. The Python resolver
--    refuses to guess for the same input. Two answers to "when does the week begin" is the drift
--    class, and on a wage surface the boundary decides the overtime.
--
--    Reconciled per the ruling: the enqueue still enqueues (the punch must commit, and the drain
--    now fails NAMED, which is correct), the fallback stays because a week-start is required to key
--    the unit at all — but it is now a DECLARED CONVENTION rather than an accident of `coalesce`,
--    and every unit keyed on it is disclosed as PROVISIONAL so the drain and any reader can tell a
--    derived boundary from a configured one. That is the same shape as decision 1: the computation
--    proceeds, and it says what it assumed.
--
-- THE DECLARED CONVENTION: absent a pay group, the workweek begins **Sunday (dow 0)** — the FLSA's
-- own default workweek and the value `coalesce` was already silently producing, so this declares
-- the live behaviour rather than changing it. Changing the boundary would re-key existing weeks and
-- move overtime; that is a migration with a data plan, not a footnote in this one.
--
-- Authority: coordinator ruling (drain diagnosis, both items); hr_l3_58/59's `split_pending`
-- disclosure pattern and its absent-not-JSON-null law; the loud-patches law.
--
-- Applied live as `hr_l3_76_unpayable_weeks_disclose_and_one_week_start_rule`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE MARKER NAMES THE WEEK AND THE REASON, AND THE REASONS ARE DISTINGUISHED. "No pay period
--    covers this day" has three causes that need three different administrator actions: no pay
--    group on the employment (assign one), a pay group with no generated periods (generate them),
--    and a calendar that starts after the work date (the coordinator's own example — extend it
--    backwards or accept the gap). A single "unstamped" flag would send all three to the same dead
--    end. The sentence names the earliest period start where one exists, which is the fact that
--    tells an administrator whether this is a gap or a boundary.
-- 2. IT VANISHES BY BEING RECOMPUTED, NEVER BY BEING CLEARED ON SUCCESS. Every recompute writes the
--    marker or REMOVES the key outright — it is never written as a JSON null and never left behind
--    from a previous run. hr_l3_59 is this lane's standing lesson: `jsonb_build_object` writes the
--    KEY with a JSON null when its value is SQL NULL, and `(calc -> 'k') IS NULL` is FALSE for a
--    JSON null, so a reader testing presence reads a stale disclosure as current. Removal is
--    surgical (`calc - 'period_pending'`), not `jsonb_strip_nulls`, which would also strip
--    legitimately-null siblings.
-- 3. THE PROVISIONAL FLAG IS ON THE UNIT, NOT ON THE FUNCTION'S RETURN. `hr._recompute_workweek_start`
--    stays a pure `date`-returning SQL function — its callers key rows on it and must not have to
--    unwrap a jsonb to do so. Provisionality is a property of the WEEK that was keyed, so it is
--    disclosed on the workweek and in the envelope beside `period_pending`.
-- 4. THE CONVENTION IS DECLARED IN THREE PLACES THAT CANNOT DRIFT APART: the function body's own
--    comment, a `comment on function`, and the disclosed marker's `convention` string. A convention
--    documented only in a migration header is one nobody reads at the call site.

begin;

-- ── the marker ──────────────────────────────────────────────────────────────────────────────
create or replace function hr._period_pending(p_employment_id uuid, p_workweek_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = hr, public
as $fn$
declare
  v_days date[]; v_weeks jsonb; v_pg uuid; v_periods integer; v_first date; v_reason text;
begin
  select array_agg(distinct wi.local_work_date order by wi.local_work_date)
    into v_days
    from hr.work_interval wi
   where wi.employment_id = p_employment_id
     and wi.is_current
     and wi.pay_period_id is null
     and (p_workweek_id is null or wi.workweek_id = p_workweek_id);

  if v_days is null or cardinality(v_days) = 0 then
    return null;                                  -- decision 2: nothing to disclose
  end if;

  select em.pay_group_id into v_pg from hr.employment em where em.id = p_employment_id;
  select count(*), min(pp.period_start_on) into v_periods, v_first
    from hr.pay_period pp where pp.pay_group_id = v_pg;

  -- decision 1: three causes, three different administrator actions
  if v_pg is null then
    v_reason := format('no pay period covers %s — this employment is in no pay group, so no '
                    || 'calendar can cover any date', v_days[1]);
  elsif coalesce(v_periods, 0) = 0 then
    v_reason := format('no pay period covers %s — the pay group has no generated pay periods',
                       v_days[1]);
  else
    v_reason := format('no pay period covers %s — the pay group''s calendar starts %s',
                       v_days[1], v_first);
  end if;

  select coalesce(jsonb_agg(distinct jsonb_build_object(
           'workweek_id', wi.workweek_id, 'week_start_local_date', w.week_start_local_date)), '[]'::jsonb)
    into v_weeks
    from hr.work_interval wi
    join hr.workweek w on w.id = wi.workweek_id
   where wi.employment_id = p_employment_id
     and wi.is_current and wi.pay_period_id is null
     and (p_workweek_id is null or wi.workweek_id = p_workweek_id);

  return jsonb_build_object(
    'unpayable_days', to_jsonb(v_days),
    'weeks', v_weeks,
    'reason', v_reason,
    'note', 'These interval-days are stamped to NO pay period, so no payroll file can include '
         || 'them. The hours are real and the totals beside this marker are a true sum of what IS '
         || 'stamped — they are not the whole timesheet. This marker disappears on the recompute '
         || 'after a covering pay period exists.');
end
$fn$;

revoke all on function hr._period_pending(uuid, uuid) from public;
revoke all on function hr._period_pending(uuid, uuid) from anon;

-- ── the declared convention (decision 4) ────────────────────────────────────────────────────
create or replace function hr._recompute_workweek_start(p_employment_id uuid, p_local_work_date date)
returns date
language sql
stable
as $fn$
  -- 🚨 ONE WEEK-START RULE. The unit is the WORKWEEK, not the day: overtime is computed on the
  -- whole week. The boundary is `pay_group.workweek_start_dow` when the employment has a pay group.
  --
  -- DECLARED CONVENTION, absent a pay group: the workweek begins SUNDAY (dow 0) — the FLSA's own
  -- default workweek, and the value the previous `coalesce(..., 0)` was already producing silently.
  -- It is a convention, not a configuration, so any week keyed on it is disclosed as PROVISIONAL by
  -- hr.recompute_apply (`week_start_provisional`). Do not "fix" this to another dow without a data
  -- plan: changing the boundary re-keys existing workweeks and moves overtime between them.
  select p_local_work_date
       - ((extract(dow from p_local_work_date)::int
           - coalesce((select pg.workweek_start_dow from hr.employment em
                        join hr.pay_group pg on pg.id = em.pay_group_id
                       where em.id = p_employment_id), 0) + 7) % 7);
$fn$;

comment on function hr._recompute_workweek_start(uuid, date) is
  'Workweek start for an employment. Reads pay_group.workweek_start_dow; absent a pay group the '
  'DECLARED CONVENTION is Sunday (dow 0, the FLSA default). A week keyed on the convention rather '
  'than on configuration is disclosed as week_start_provisional by hr.recompute_apply. One rule: '
  'no other derivation of this boundary may exist (hr_l3_76).';

create or replace function hr._week_start_is_provisional(p_employment_id uuid)
returns boolean
language sql
stable
as $fn$
  select not exists (select 1 from hr.employment em
                      join hr.pay_group pg on pg.id = em.pay_group_id
                     where em.id = p_employment_id and pg.workweek_start_dow is not null);
$fn$;

-- ── the drain discloses: workweek row, envelope, and the rollup ─────────────────────────────
do $mig$
declare v_def text := pg_get_functiondef('hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure);
begin
  if position('period_pending' in v_def) > 0 then
    return;                                     -- already wired; replay is a no-op
  end if;
  if position(E'  ---------------------------------------------------------------- 8. the answer' in v_def) = 0 then
    raise exception 'hr_l3_76: recompute_apply''s answer block is not in the expected shape';
  end if;

  v_def := replace(v_def,
    E'  ---------------------------------------------------------------- 8. the answer\n'
 || E'  return jsonb_build_object(',
    E'  ---------------------------------------------------------------- 7b. what cannot be paid\n'
 || E'  -- hr_l3_76: intervals stamped to NO pay period contribute to no rollup, so without this the\n'
 || E'  -- envelope returns ok:true over hours no payroll file can include. Written to the WEEK it\n'
 || E'  -- names as well as returned, and REMOVED (never JSON-nulled) when a later stamp succeeds.\n'
 || E'  v_pending     := hr._period_pending(p_employment_id, v_ww_id);\n'
 || E'  v_provisional := hr._week_start_is_provisional(p_employment_id);\n'
 || E'  perform hr.arm_write();\n'
 || E'  update hr.workweek w\n'
 || E'     set calc = case when v_pending is null\n'
 || E'                     then (coalesce(w.calc, ''{}''::jsonb) - ''period_pending'')\n'
 || E'                     else coalesce(w.calc, ''{}''::jsonb) || jsonb_build_object(''period_pending'', v_pending)\n'
 || E'                end\n'
 || E'                || jsonb_build_object(''week_start_provisional'',\n'
 || E'                     case when v_provisional then jsonb_build_object(\n'
 || E'                            ''convention'', ''Sunday (dow 0), the FLSA default'',\n'
 || E'                            ''reason'', ''this employment has no pay group, so no configured '' ||\n'
 || E'                                        ''workweek_start_dow exists to read'') end)\n'
 || E'   where w.id = v_ww_id;\n'
 || E'  if not v_provisional then\n'
 || E'    perform hr.arm_write();\n'
 || E'    update hr.workweek w set calc = coalesce(w.calc,''{}''::jsonb) - ''week_start_provisional''\n'
 || E'     where w.id = v_ww_id;\n'
 || E'  end if;\n'
 || E'\n'
 || E'  ---------------------------------------------------------------- 8. the answer\n'
 || E'  return jsonb_strip_nulls(jsonb_build_object(');

  v_def := replace(v_def,
    E'    ''pay_period_id'', v_period,',
    E'    ''pay_period_id'', v_period,\n'
 || E'    ''period_pending'', v_pending,\n'
 || E'    ''week_start_provisional'', case when v_provisional then jsonb_build_object(\n'
 || E'        ''convention'', ''Sunday (dow 0), the FLSA default'',\n'
 || E'        ''reason'', ''this employment has no pay group'') end,');

  -- close the extra paren opened by jsonb_strip_nulls(
  v_def := replace(v_def,
    E'        from hr.work_interval w where w.workweek_id = v_ww_id and w.is_current));\nend',
    E'        from hr.work_interval w where w.workweek_id = v_ww_id and w.is_current)));\nend');

  v_def := replace(v_def,
    E'  v_rollups_missing jsonb := ''[]''::jsonb;',
    E'  v_rollups_missing jsonb := ''[]''::jsonb;\n  v_pending jsonb; v_provisional boolean;');

  execute v_def;
end
$mig$;

-- the rollup carries it too: a period whose totals are real but are not the whole timesheet
do $mig$
declare v_def text := pg_get_functiondef('hr._ppe_rollup_refresh(uuid,uuid,text,text,uuid)'::regprocedure);
begin
  if position('period_pending' in v_def) > 0 then
    return;
  end if;
  if position(E'           ''split_pending'',       v_split,' in v_def) = 0 then
    raise exception 'hr_l3_76: _ppe_rollup_refresh''s calc block is not in the expected shape';
  end if;
  v_def := replace(v_def,
    E'           ''split_pending'',       v_split,',
    E'           ''period_pending'',      hr._period_pending(p_employment_id, null),\n'
 || E'           ''period_pending_note'', case when hr._period_pending(p_employment_id, null) is not null then\n'
 || E'              ''This employment has interval-days stamped to NO pay period. The totals above are ''\n'
 || E'              || ''a true sum of what IS stamped to this period and are not the whole timesheet; ''\n'
 || E'              || ''the unpayable days are named in period_pending.''\n'
 || E'             end,\n'
 || E'           ''split_pending'',       v_split,');
  execute v_def;
end
$mig$;

-- ── prove it in the same transaction ────────────────────────────────────────────────────────
-- NOTE ON WHAT IS ASSERTED HERE. The unpayable population is TRANSIENT by design — nine intervals
-- carried a null pay_period_id when this migration was written and another lane generated the
-- covering periods minutes later, which is precisely the marker's own vanish condition happening
-- for real. So the migration asserts STRUCTURE (both writers disclose, the helper is silent when
-- there is nothing to say, the convention is declared) and the positive case is proven against a
-- constructed, rolled-back fixture outside this file — recorded in the commit message. An
-- assertion that depended on a live defect existing would go green or red on another lane's timing.
do $chk$
declare v_emp uuid; v_with uuid;
begin
  -- absent, never JSON null, when there is nothing to disclose (hr_l3_59's law)
  select employment_id into v_emp from hr.work_interval
   where is_current and pay_period_id is not null limit 1;
  if v_emp is not null and hr._period_pending(v_emp, null) is not null then
    raise exception 'hr_l3_76: the marker fired on a fully-stamped employment';
  end if;

  -- both writers must disclose it
  if position('period_pending' in (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='hr' and p.proname='recompute_apply')) = 0 then
    raise exception 'hr_l3_76: recompute_apply does not disclose period_pending';
  end if;
  if position('period_pending' in (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='hr' and p.proname='_ppe_rollup_refresh')) = 0 then
    raise exception 'hr_l3_76: the rollup does not disclose period_pending';
  end if;

  -- ONE week-start rule, and the convention declared where a caller reads it
  if position('DECLARED CONVENTION' in (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='hr' and p.proname='_recompute_workweek_start')) = 0 then
    raise exception 'hr_l3_76: the week-start convention is not declared in the function body';
  end if;
  if (select obj_description('hr._recompute_workweek_start(uuid,date)'::regprocedure)) is null then
    raise exception 'hr_l3_76: the week-start function carries no comment';
  end if;

  -- provisionality must discriminate: both populations exist live
  select em.id into v_emp from hr.employment em where em.pay_group_id is null and em.deleted_at is null limit 1;
  select em.id into v_with from hr.employment em where em.pay_group_id is not null and em.deleted_at is null limit 1;
  if v_emp is not null and not hr._week_start_is_provisional(v_emp) then
    raise exception 'hr_l3_76: a pay-group-less employment is not reported provisional';
  end if;
  if v_with is not null and hr._week_start_is_provisional(v_with) then
    raise exception 'hr_l3_76: an employment WITH a pay group is reported provisional';
  end if;
end
$chk$;

commit;
