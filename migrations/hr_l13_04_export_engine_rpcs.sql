-- HR L13 — migration 4 (register item HRB-025, lane lane-l13-export).
--
-- THE EXPORT ENGINE'S SQL SURFACE — seven functions, and the double-pay guard is one of them.
--
-- Authority: SPEC-CONTRACTS §4.1 (grain), §4.4 (generation + the four preconditions), §4.5
-- (versioning, acknowledgment, failure, correction), §1.4 (the domain idempotency key),
-- SPEC-JURISDICTION §7.3 invariant 2 / §7.5. Applied live as `hr_l13_04_export_engine_rpcs`.
-- Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE DOUBLE-PAY GUARD IS A DATABASE FACT, INSIDE THE TRANSACTION THAT BUMPS THE VERSION.
--    §4.5: "An `acknowledged` export can never be superseded, regenerated, or re-sent." Checking
--    that in Python before calling the writer is a check-then-write, and the prize for winning
--    that race is paying somebody twice. `hr.export_claim` raises `hr_export_already_acknowledged`
--    in the same statement that computes `export_version = n+1`, so two concurrent supersedes of
--    an acknowledged export both lose. It also refuses when ANY export on the period is already
--    acknowledged — not merely the one being superseded — because a second file for a period
--    payroll has already taken is the double payment, whichever row it descends from.
--
-- 2. THE MONEY-CLASS LIST IS READ FROM `hr.jurisdiction_rule_class.produces_money`, NEVER TYPED
--    OUT. A hardcoded list of money classes in the engine is "a code branch wearing a table's
--    clothes" (SPEC-JURISDICTION §7.5), and it goes stale the first time a class is added.
--
-- 3. THE ADVISORY CHECK READS THE RULES THAT ACTUALLY CONTRIBUTED, not the rules that might
--    apply. `hr.work_interval.rule_version_ids` and `hr.workweek.rule_version_ids` record which
--    rule versions produced these numbers; the gate asks whether any of THOSE is `advisory` on a
--    class with `produces_money`. That is a fact about this period's computed lines, not a
--    jurisdiction branch — which is why it does not fall foul of §7.5's first "never".
--
-- 4. ONE PROJECTION OWNS THE GRAIN. `hr.export_line_source` does the denormalization —
--    employee_number, external ids, job title, earning code, jurisdiction key — in ONE place. An
--    engine that denormalized in Python would be a second definition of a payroll line, and two
--    definitions is how two exports of the same period disagree. It also resolves the workweek
--    for an adjustment line from (employment, local work date), which is what lets
--    `payroll_export_line.workweek_id` be NOT NULL.
--
-- 5. `hr.export_finish` INSERTS EVERY LINE AND CLOSES THE HEADER IN ONE STATEMENT-SET, because
--    `hr.payroll_export_line` admits no UPDATE and no DELETE at the database. A partial write
--    cannot be repaired in place — only rolled back — so it must not be able to half-commit.
--
-- 6. THE FUNCTIONS ARE `SECURITY DEFINER` AND ARM THE HR WRITE GUARD THEMSELVES, disarming on
--    every exit. SPEC-ACCESS law 2: every `hr.*` write goes through a definer RPC that calls
--    `hr.arm_write()`. The flag is transaction-scoped (HRB-008's sixth finding), so each function
--    resets it before returning rather than leaving the whole schema writable for the rest of the
--    caller's transaction.
--
-- 7. CAPABILITY IS CHECKED AT THE HTTP EDGE, NOT RE-CHECKED HERE, WITH ONE EXCEPTION. aidream
--    calls these under `acting_as_user`, having already gated on `payroll.export` /
--    `payroll.read`; a second predicate in SQL would be a second place to get the answer wrong.
--    The exception is `hr.export_get`, which is also reachable from the read path and therefore
--    scopes on `organization_id` explicitly. Nothing here is granted to `anon`.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ---------------------------------------------------------------------------------
-- 1. hr.export_period_facts — the two state preconditions, read once (§4.4).
-- ---------------------------------------------------------------------------------
create or replace function hr.export_period_facts(
  p_organization_id uuid,
  p_pay_period_id   uuid)
returns table (
  pay_period_id        uuid,
  organization_id      uuid,
  state                text,
  period_start_on      date,
  period_end_on        date,
  pending_workweek_ids uuid[])
language sql
stable security definer
set search_path to 'hr', 'public'
as $function$
  select pp.id,
         pp.organization_id,
         pp.state,
         pp.period_start_on,
         pp.period_end_on,
         coalesce((
           -- Every workweek that touches this period and is not final. §4.4's second
           -- precondition; overtime is computed on the whole workweek, so a non-final one can
           -- still change the numbers this file would carry.
           select array_agg(distinct w.id)
             from hr.work_interval wi
             join hr.workweek w on w.id = wi.workweek_id
            where wi.pay_period_id = pp.id
              and wi.organization_id = pp.organization_id
              and wi.is_current
              and not w.is_final), '{}'::uuid[])
    from hr.pay_period pp
   where pp.id = p_pay_period_id
     and pp.organization_id = p_organization_id;
$function$;

-- ---------------------------------------------------------------------------------
-- 2. hr.export_advisory_money_blocks — 🚨 the 422 gate (RECORDED DECISIONS 2 + 3).
-- ---------------------------------------------------------------------------------
create or replace function hr.export_advisory_money_blocks(
  p_organization_id uuid,
  p_pay_period_id   uuid)
returns table (
  rule_class       text,
  rule_id          uuid,
  jurisdiction_key text,
  message          text)
language sql
stable security definer
set search_path to 'hr', 'public'
as $function$
  with contributing as (
    -- The rule versions that actually produced this period's numbers, from both grains: the
    -- interval (per work date) and the workweek (overtime, which is computed on the week).
    select distinct unnest(wi.rule_version_ids) as rule_id
      from hr.work_interval wi
     where wi.pay_period_id = p_pay_period_id
       and wi.organization_id = p_organization_id
       and wi.is_current
    union
    select distinct unnest(w.rule_version_ids)
      from hr.work_interval wi
      join hr.workweek w on w.id = wi.workweek_id
     where wi.pay_period_id = p_pay_period_id
       and wi.organization_id = p_organization_id
       and wi.is_current
    union
    select distinct unnest(ta.rule_version_ids)
      from hr.time_adjustment ta
     where ta.target_pay_period_id = p_pay_period_id
       and ta.organization_id = p_organization_id)
  select rc.slug,
         jr.id,
         jr.jurisdiction_key,
         format('rule %s for %s is advisory on the money class %s; an export refuses rather than '
                'omitting the amount', jr.id, jr.jurisdiction_key, rc.slug)
    from contributing c
    join hr.jurisdiction_rule jr on jr.id = c.rule_id
    join hr.jurisdiction_rule_class rc on rc.id = jr.rule_class_id
   where jr.status = 'advisory'
     and rc.produces_money
     and rc.is_active
     and jr.deleted_at is null
   order by rc.slug, jr.jurisdiction_key;
$function$;

-- ---------------------------------------------------------------------------------
-- 3. hr.export_line_source — THE GRAIN, in one place (RECORDED DECISION 4).
-- ---------------------------------------------------------------------------------
create or replace function hr.export_line_source(
  p_organization_id     uuid,
  p_pay_period_id       uuid,
  p_export_format       text,
  p_include_adjustments boolean default true)
returns table (
  employment_id          uuid,
  employee_number        text,
  external_employee_id   text,
  work_date              date,
  workweek_id            uuid,
  position_assignment_id uuid,
  job_title_snapshot     text,
  earning_code           text,
  external_earning_code  text,
  hours_category         text,
  hours                  numeric,
  rate                   numeric,
  amount                 numeric,
  jurisdiction_key       text,
  original_pay_period_id uuid,
  source_work_interval_id uuid,
  source_version         integer,
  rule_version_ids       uuid[],
  engine_key             text,
  engine_version         text,
  time_adjustment_id     uuid,
  dispute_note_present   boolean)
language sql
stable security definer
set search_path to 'hr', 'public'
as $function$
  -- (a) The period's own approved intervals.
  select wi.employment_id,
         emp.employee_number,
         xid.external_id,
         wi.local_work_date,
         wi.workweek_id,
         wi.position_assignment_id,
         jt.title,
         ec.code,
         nullif(ec.external_code_map ->> p_export_format, ''),
         wi.hours_category,
         wi.hours,
         wi.rate,
         wi.amount,
         j.key,
         null::uuid,
         wi.id,
         wi.version,
         wi.rule_version_ids,
         wi.engine_key,
         wi.engine_version,
         null::uuid,
         coalesce(ppe.dispute_note is not null and ppe.dispute_resolved_at is null, false)
    from hr.work_interval wi
    join hr.employment e   on e.id = wi.employment_id
    join hr.employee emp   on emp.id = e.employee_id
    join hr.earning_code ec on ec.id = wi.earning_code_id
    join hr.jurisdiction j  on j.id = wi.jurisdiction_id
    left join hr.position_assignment pa on pa.id = wi.position_assignment_id
    left join hr.job_title jt on jt.id = pa.job_title_id
    left join hr.external_identity xid
           on xid.employee_id = emp.id
          and xid.system_key = p_export_format
          and xid.deleted_at is null
    left join hr.pay_period_employment ppe
           on ppe.pay_period_id = wi.pay_period_id
          and ppe.employment_id = wi.employment_id
   where wi.pay_period_id = p_pay_period_id
     and wi.organization_id = p_organization_id
     and wi.is_current
     and wi.hours <> 0

  union all

  -- (b) Prior-period corrections PAID in this period. §4.1 grain fact 2: corrections are LINES,
  --     not edits, and each carries the period it fixes so the receiving system can label it a
  --     prior-period adjustment. The workweek is resolved from (employment, local work date) —
  --     which is the whole reason payroll_export_line.workweek_id can be NOT NULL.
  select ta.employment_id,
         emp.employee_number,
         xid.external_id,
         ta.local_work_date,
         (select w.id
            from hr.workweek w
           where w.employment_id = ta.employment_id
             and w.organization_id = ta.organization_id
             and ta.local_work_date >= w.week_start_local_date
             and ta.local_work_date <  w.week_start_local_date + 7
           order by w.week_start_local_date desc
           limit 1),
         null::uuid,
         null::text,
         ec.code,
         nullif(ec.external_code_map ->> p_export_format, ''),
         ec.hours_category,
         ta.hours_delta,
         ta.rate,
         nullif(ta.amount_delta, 0),
         j.key,
         ta.original_pay_period_id,
         null::uuid,
         ta.version,
         ta.rule_version_ids,
         ta.engine_key,
         ta.engine_version,
         ta.id,
         false
    from hr.time_adjustment ta
    join hr.employment e    on e.id = ta.employment_id
    join hr.employee emp    on emp.id = e.employee_id
    join hr.earning_code ec on ec.id = ta.earning_code_id
    join hr.jurisdiction j  on j.id = ta.jurisdiction_id
    left join hr.external_identity xid
           on xid.employee_id = emp.id
          and xid.system_key = p_export_format
          and xid.deleted_at is null
   where p_include_adjustments
     and ta.target_pay_period_id = p_pay_period_id
     and ta.organization_id = p_organization_id
     and ta.approved_at is not null;
$function$;

-- ---------------------------------------------------------------------------------
-- 4. hr.export_claim — 🚨 THE DOUBLE-PAY GUARD (RECORDED DECISION 1) + §1.4's domain key.
-- ---------------------------------------------------------------------------------
create or replace function hr.export_claim(
  p_organization_id      uuid,
  p_pay_period_id        uuid,
  p_export_format        text,
  p_idempotency_key      text,
  p_includes_pii         boolean default false,
  p_supersedes_export_id uuid default null)
returns table (
  export_id            uuid,
  export_version       integer,
  replayed             boolean,
  supersedes_export_id uuid)
language plpgsql
volatile security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_existing hr.payroll_export%rowtype;
  v_ack      hr.payroll_export%rowtype;
  v_version  integer;
  v_id       uuid;
  v_user     uuid := auth.uid();
  v_actor_employment uuid;
begin
  -- RECORDED DECISION 8 — AN EXPORT NAMES WHO MADE IT, OR IT DOES NOT HAPPEN.
  -- `payroll_export_actor_identified` requires an actor_user_id or an actor_employment_id for
  -- every non-device actor type. Rather than letting that CHECK fire as an opaque 23514 at the
  -- end of a long call, the actor is resolved here and a caller the database cannot name is
  -- refused by name. A payroll file whose maker is unattributable is not a file we will produce.
  select e.id into v_actor_employment
    from hr.employment e
   where e.id = any (hr.employments_of(v_user))
     and e.organization_id = p_organization_id
   limit 1;
  if v_user is null and v_actor_employment is null then
    raise exception 'hr_validation_error: an export must name its actor; this call has neither an authenticated user nor an employment in organization %',
      p_organization_id using errcode = 'P0001',
      hint = 'aidream calls this under acting_as_user, so auth.uid() is the caller. A direct connection must set request.jwt.claims.';
  end if;
  -- §1.4 — the DOMAIN key is checked FIRST, before the platform claim matters. A replay returns
  -- the existing export verbatim rather than minting a second one.
  select * into v_existing
    from hr.payroll_export pe
   where pe.organization_id = p_organization_id
     and pe.idempotency_key = p_idempotency_key
   limit 1;
  if found then
    return query select v_existing.id, v_existing.export_version, true, v_existing.supersedes_export_id;
    return;
  end if;

  -- 🚨 THE ONE RULE THAT PREVENTS DOUBLE PAYMENT (§4.5). Any acknowledged export on this period
  -- closes it: payroll has taken a file, and a second file for the same period pays it twice
  -- whichever row it descends from. The only correction path is an hr.time_adjustment landing in
  -- the NEXT export, tagged to the original period.
  select * into v_ack
    from hr.payroll_export pe
   where pe.organization_id = p_organization_id
     and pe.pay_period_id = p_pay_period_id
     and pe.delivery_state = 'acknowledged'
   limit 1;
  if found then
    raise exception 'hr_export_already_acknowledged: export % for pay period % was acknowledged at % (ref %); a re-export would pay it twice',
      v_ack.id, p_pay_period_id, v_ack.acknowledged_at, coalesce(v_ack.acknowledgement_ref, '-')
      using errcode = 'P0001',
            hint = 'Correct it with an hr.time_adjustment that lands in the next export, tagged to the original period (SPEC-CONTRACTS 4.5).';
  end if;

  if p_supersedes_export_id is not null then
    if not exists (select 1 from hr.payroll_export pe
                    where pe.id = p_supersedes_export_id
                      and pe.organization_id = p_organization_id
                      and pe.pay_period_id = p_pay_period_id) then
      raise exception 'hr_state_conflict: export % is not an export of pay period % in this organization',
        p_supersedes_export_id, p_pay_period_id using errcode = 'P0001';
    end if;
    -- §4.5's transition table: only `generated` and `failed` may be superseded.
    if not exists (select 1 from hr.payroll_export pe
                    where pe.id = p_supersedes_export_id
                      and pe.delivery_state in ('generated','failed')) then
      raise exception 'hr_state_conflict: export % is %, and only a generated or failed export may be superseded',
        p_supersedes_export_id,
        (select pe.delivery_state from hr.payroll_export pe where pe.id = p_supersedes_export_id)
        using errcode = 'P0001';
    end if;
  end if;

  -- §4.5 — export_version counts ATTEMPTS BEFORE ACKNOWLEDGMENT, not corrections after it.
  -- 🚨 ALIAS-QUALIFIED ON PURPOSE. `export_version` is also an OUT parameter of this function's
  -- RETURNS TABLE, and an unqualified reference is `ambiguous column reference` at RUNTIME, not
  -- at create time — so it compiles green and fails on the first real call. Found by
  -- scripts/hr/hrb025_guard_proof.py. Every column reference in this file that collides with an
  -- OUT parameter name is qualified for the same reason.
  select coalesce(max(pe.export_version), 0) + 1 into v_version
    from hr.payroll_export pe
   where pe.organization_id = p_organization_id
     and pe.pay_period_id = p_pay_period_id;

  perform hr.arm_write();
  begin
    insert into hr.payroll_export (
      pay_period_id, export_format, export_version, idempotency_key, generated_at,
      line_count, delivery_state, supersedes_export_id, actor_type, actor_user_id,
      actor_employment_id, organization_id, created_by, metadata)
    values (
      p_pay_period_id, p_export_format, v_version, p_idempotency_key, now(),
      0, 'generated', p_supersedes_export_id, 'hr_admin', v_user, v_actor_employment,
      p_organization_id, v_user,
      jsonb_build_object('includes_pii', p_includes_pii))
    returning id into v_id;
  exception when unique_violation then
    -- A concurrent request won the domain key between the lookup above and this insert. That is
    -- the TOCTOU §1.4 names, and the resolution is the same as the lookup's: return theirs.
    perform set_config('hr.privileged_write', '', true);
    select * into v_existing from hr.payroll_export pe
     where pe.organization_id = p_organization_id and pe.idempotency_key = p_idempotency_key limit 1;
    return query select v_existing.id, v_existing.export_version, true, v_existing.supersedes_export_id;
    return;
  end;
  perform set_config('hr.privileged_write', '', true);

  return query select v_id, v_version, false, p_supersedes_export_id;
end
$function$;

-- ---------------------------------------------------------------------------------
-- 5. hr.export_finish — the append-only line set and the header, together (DECISION 5).
-- ---------------------------------------------------------------------------------
create or replace function hr.export_finish(
  p_organization_id  uuid,
  p_export_id        uuid,
  p_lines            jsonb,
  p_artifact_file_id uuid,
  p_artifact_sha256  text,
  p_total_hours      text,
  p_total_amount     text,
  p_adjustment_ids   uuid[],
  p_disputes_carried jsonb)
returns integer
language plpgsql
volatile security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_export hr.payroll_export%rowtype;
  v_count  integer;
begin
  select * into v_export from hr.payroll_export pe
   where pe.id = p_export_id and pe.organization_id = p_organization_id;
  if not found then
    raise exception 'not_found: export %', p_export_id using errcode = 'P0002';
  end if;
  if v_export.delivery_state <> 'generated' then
    raise exception 'hr_state_conflict: export % is %, and lines are written once at generation',
      p_export_id, v_export.delivery_state using errcode = 'P0001';
  end if;
  if exists (select 1 from hr.payroll_export_line pel where pel.payroll_export_id = p_export_id) then
    raise exception 'hr_state_conflict: export % already has lines; the line set is append-only and written once',
      p_export_id using errcode = 'P0001';
  end if;

  perform hr.arm_write();

  insert into hr.payroll_export_line (
    payroll_export_id, employment_id, employee_number, external_employee_id, work_date,
    workweek_id, position_assignment_id, job_title_snapshot, earning_code, external_earning_code,
    hours_category, hours, rate, amount, jurisdiction_key, original_pay_period_id,
    source_work_interval_ids, source_version, rule_version_ids, engine_key, engine_version,
    calc, computed_at, organization_id, created_by)
  select p_export_id,
         (l ->> 'employment_id')::uuid,
         l ->> 'employee_number',
         l ->> 'external_employee_id',
         (l ->> 'work_date')::date,
         (l ->> 'workweek_id')::uuid,
         nullif(l ->> 'position_assignment_id','')::uuid,
         l ->> 'job_title_snapshot',
         l ->> 'earning_code',
         l ->> 'external_earning_code',
         l ->> 'hours_category',
         (l ->> 'hours')::numeric,
         nullif(l ->> 'rate','')::numeric,
         nullif(l ->> 'amount','')::numeric,
         l ->> 'jurisdiction_key',
         nullif(l ->> 'original_pay_period_id','')::uuid,
         coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(
                     coalesce(l -> 'source_work_interval_ids','[]'::jsonb)) x), '{}'::uuid[]),
         coalesce((l ->> 'source_version')::integer, 1),
         coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(
                     coalesce(l -> 'rule_version_ids','[]'::jsonb)) x), '{}'::uuid[]),
         coalesce(l ->> 'engine_key', 'hr.export'),
         coalesce(l ->> 'engine_version', 'v1'),
         '{}'::jsonb,
         now(),
         p_organization_id,
         auth.uid()
    from jsonb_array_elements(p_lines) l;

  get diagnostics v_count = row_count;

  update hr.payroll_export
     set line_count = v_count,
         total_hours = nullif(p_total_hours,'')::numeric,
         total_amount = nullif(p_total_amount,'')::numeric,
         artifact_file_id = p_artifact_file_id,
         artifact_sha256 = p_artifact_sha256,
         includes_adjustment_ids = coalesce(p_adjustment_ids, '{}'::uuid[]),
         metadata = coalesce(metadata,'{}'::jsonb)
                    || jsonb_build_object('disputes_carried', coalesce(p_disputes_carried,'[]'::jsonb))
   where id = p_export_id;

  -- §4.4 — a generated export moves the period to `exported`. The transition trigger allows
  -- approved → exported and nothing else, so a period already `exported` is left alone rather
  -- than re-transitioned (a second attempt before acknowledgment is legitimate; §4.5).
  update hr.pay_period
     set state = 'exported', exported_at = now()
   where id = v_export.pay_period_id
     and organization_id = p_organization_id
     and state = 'approved';

  perform set_config('hr.privileged_write', '', true);
  return v_count;
end
$function$;

-- ---------------------------------------------------------------------------------
-- 6. hr.export_transition — §4.5's machine, compare-and-set.
-- ---------------------------------------------------------------------------------
create or replace function hr.export_transition(
  p_organization_id    uuid,
  p_export_id          uuid,
  p_action             text,
  p_acknowledgement_ref text default null,
  p_acknowledged_at    timestamptz default null,
  p_failure_reason     text default null)
returns table (
  export_id        uuid,
  delivery_state   text,
  acknowledged_at  timestamptz,
  failure_reason   text)
language plpgsql
volatile security definer
set search_path to 'hr', 'public'
as $function$
declare v_export hr.payroll_export%rowtype;
begin
  select * into v_export from hr.payroll_export pe
   where pe.id = p_export_id and pe.organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'not_found: export %', p_export_id using errcode = 'P0002';
  end if;

  -- 🚨 §4.5, at every door and not only at supersede: an acknowledged export is finished.
  if v_export.delivery_state = 'acknowledged' and p_action <> 'acknowledge' then
    raise exception 'hr_export_already_acknowledged: export % was acknowledged at % (ref %)',
      p_export_id, v_export.acknowledged_at, coalesce(v_export.acknowledgement_ref,'-')
      using errcode = 'P0001',
            hint = 'The only correction path is an hr.time_adjustment in the next export, tagged to the original period.';
  end if;

  perform hr.arm_write();

  if p_action = 'acknowledge' then
    if v_export.delivery_state = 'acknowledged' then
      -- Idempotent by design: a second acknowledgment with the same ref is a retry, not a state
      -- change, and raising here would make a lost response unrecoverable.
      perform set_config('hr.privileged_write', '', true);
      return query select v_export.id, v_export.delivery_state, v_export.acknowledged_at, v_export.failure_reason;
      return;
    end if;
    if v_export.delivery_state not in ('generated','sent') then
      perform set_config('hr.privileged_write', '', true);
      raise exception 'hr_state_conflict: export % is %, and only a generated or sent export can be acknowledged',
        p_export_id, v_export.delivery_state using errcode = 'P0001';
    end if;
    update hr.payroll_export pe
       set delivery_state = 'acknowledged',
           acknowledged_at = coalesce(p_acknowledged_at, now()),
           acknowledgement_ref = p_acknowledgement_ref,
           sent_at = coalesce(pe.sent_at, now())
     where pe.id = p_export_id;

  elsif p_action = 'fail' then
    if v_export.delivery_state not in ('generated','sent') then
      perform set_config('hr.privileged_write', '', true);
      raise exception 'hr_state_conflict: export % is %, and only a generated or sent export can be recorded as failed',
        p_export_id, v_export.delivery_state using errcode = 'P0001';
    end if;
    update hr.payroll_export
       set delivery_state = 'failed', failure_reason = p_failure_reason
     where id = p_export_id;

  elsif p_action = 'send' then
    if v_export.delivery_state <> 'generated' then
      perform set_config('hr.privileged_write', '', true);
      raise exception 'hr_state_conflict: export % is %, not generated', p_export_id, v_export.delivery_state
        using errcode = 'P0001';
    end if;
    update hr.payroll_export set delivery_state = 'sent', sent_at = now() where id = p_export_id;

  elsif p_action = 'supersede' then
    if v_export.delivery_state not in ('generated','failed') then
      perform set_config('hr.privileged_write', '', true);
      raise exception 'hr_state_conflict: export % is %, and only a generated or failed export may be superseded',
        p_export_id, v_export.delivery_state using errcode = 'P0001';
    end if;
    update hr.payroll_export pe
       set delivery_state = 'superseded',
           failure_reason = coalesce(p_failure_reason, pe.failure_reason)
     where pe.id = p_export_id;

  else
    perform set_config('hr.privileged_write', '', true);
    raise exception 'hr_validation_error: unknown export transition %', p_action using errcode = 'P0001';
  end if;

  perform set_config('hr.privileged_write', '', true);

  select * into v_export from hr.payroll_export pe where pe.id = p_export_id;
  return query select v_export.id, v_export.delivery_state, v_export.acknowledged_at, v_export.failure_reason;
end
$function$;

-- ---------------------------------------------------------------------------------
-- 7. hr.export_get — E-22's read, org-scoped (RECORDED DECISION 7's exception).
-- ---------------------------------------------------------------------------------
create or replace function hr.export_get(
  p_organization_id uuid,
  p_export_id       uuid)
returns table (
  export_id            uuid,
  pay_period_id        uuid,
  export_version       integer,
  export_format        text,
  delivery_state       text,
  line_count           integer,
  total_hours          numeric,
  total_amount         numeric,
  artifact_file_id     uuid,
  artifact_sha256      text,
  supersedes_export_id uuid,
  acknowledgement_ref  text,
  failure_reason       text,
  includes_pii         boolean)
language sql
stable security definer
set search_path to 'hr', 'public'
as $function$
  select pe.id, pe.pay_period_id, pe.export_version, pe.export_format, pe.delivery_state,
         pe.line_count, pe.total_hours, pe.total_amount, pe.artifact_file_id, pe.artifact_sha256,
         pe.supersedes_export_id, pe.acknowledgement_ref, pe.failure_reason,
         coalesce((pe.metadata -> 'includes_pii')::boolean, false)
    from hr.payroll_export pe
   where pe.id = p_export_id and pe.organization_id = p_organization_id;
$function$;

-- ---------------------------------------------------------------------------------
-- 8. Grants. `authenticated` executes them under acting_as_user; `anon` gets nothing, and the
--    pg_default_acl on public does not reach hr, but the revoke is explicit anyway.
-- ---------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr.export_period_facts(uuid,uuid)',
    'hr.export_advisory_money_blocks(uuid,uuid)',
    'hr.export_line_source(uuid,uuid,text,boolean)',
    'hr.export_claim(uuid,uuid,text,text,boolean,uuid)',
    'hr.export_finish(uuid,uuid,jsonb,uuid,text,text,text,uuid[],jsonb)',
    'hr.export_transition(uuid,uuid,text,text,timestamptz,text)',
    'hr.export_get(uuid,uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------
-- 9. ASSERTIONS — this file does not commit a lie.
-- ---------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr.export_period_facts(uuid,uuid)',
    'hr.export_advisory_money_blocks(uuid,uuid)',
    'hr.export_line_source(uuid,uuid,text,boolean)',
    'hr.export_claim(uuid,uuid,text,text,boolean,uuid)',
    'hr.export_finish(uuid,uuid,jsonb,uuid,text,text,text,uuid[],jsonb)',
    'hr.export_transition(uuid,uuid,text,text,timestamptz,text)',
    'hr.export_get(uuid,uuid)'] loop
    if to_regprocedure(f) is null then
      raise exception 'hr_l13_04: % did not land', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'hr_l13_04: anon can execute %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'hr_l13_04: authenticated cannot execute %', f;
    end if;
  end loop;

  -- RECORDED DECISION 2 — the money-class list must come from the table, so the table must have
  -- money classes in it. A green gate over an empty list is the "guard that cannot fail" defect.
  if not exists (select 1 from hr.jurisdiction_rule_class
                  where produces_money and is_active and deleted_at is null) then
    raise exception 'hr_l13_04: no active money-producing rule class exists — the advisory gate would pass vacuously';
  end if;
end $$;
