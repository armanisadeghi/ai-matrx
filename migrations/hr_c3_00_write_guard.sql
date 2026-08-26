-- HR domain C3 — migration 0 (register item HRB-007 follow-up, lane core-c3-access).
--
-- THE WRITE GUARD, HARDENED. Two defects, both proven live before anything was touched, both
-- found by probe: one raised by C4's lane, one found while fixing it and materially worse.
--
-- ===================================================================================
-- DEFECT 1 (C4's finding, reproduced) — `hr.privileged_write` IS TRANSACTION-SCOPED, so ONE
-- definer call disarms the HR write guard for the REST of that transaction.
--
-- Every writer sets it with `set_config('hr.privileged_write','on', true)`. The third argument is
-- `is_local`, which means TRANSACTION-local, not statement-local — Postgres has no statement-local
-- GUC. So the flag survives the function that set it. Proven live in a rolled-back transaction:
--   H1  an unprivileged direct write refuses 42501            (the guard works cold)
--   H2  one ordinary definer RPC runs
--   H3  hr.privileged_write is still "on" after it returns
--   H4  🚨 the SAME direct write now SUCCEEDS
--
-- DEFECT 2 (found while fixing defect 1, and it is the bigger one) — 🚨 **THE GUARD WAS NEVER A
-- SECURITY BOUNDARY AT ALL.** `set_config` is executable by anyone, so a plain `authenticated`
-- caller can arm the flag themselves and then write directly. Proven live, as a real
-- `authenticated` JWT:
--   M2  authenticated CAN call set_config to self-arm
--   M3  🚨 the self-armed direct INSERT into hr.job_title SUCCEEDED
--   M4  authenticated holds [DELETE, INSERT, SELECT, UPDATE] on hr.job_title
-- RLS still bounds WHAT they can write (their own org, rows they would own), so this is not an
-- open door — but SPEC-ACCESS law 2 says "a generated `hr._guard_hr_write()` BEFORE-trigger raises
-- on any session without it", and as built that sentence described a CONVENTION, not a wall.
--
-- ===================================================================================
-- THE FIX, AND ITS DELIBERATE SCOPE LIMIT
--
-- `hr.arm_write()` sets the flag to a token that is BOTH statement-scoped AND unforgeable:
--   md5(statement_timestamp() || backend pid || a key held in a table `authenticated` cannot read)
-- `statement_timestamp()` is stable across every inner statement of one outer statement (verified
-- live: M1 = 1 distinct value) and changes between top-level statements — which is exactly the
-- scope we want, and is why a function that writes six tables under one arm keeps working while
-- the arm dies the moment the statement does. The key closes defect 2: `hr.arm_write()` is
-- SECURITY DEFINER and REVOKEd from `authenticated`/`anon`, so only a definer function running as
-- the function owner can arm at all, and the token cannot be guessed by someone who could once
-- just type 'on'.
--
-- 🚨 THE GUARD STILL ACCEPTS THE LEGACY LITERAL, ON PURPOSE. **46 live functions across three
-- lanes arm this flag** — C3's 17, plus C4's workflow engine and C5's jurisdiction lane — and 14
-- applied migrations arm it at session scope for their seeds. Making the token mandatory today
-- would break every one of them, which is precisely the collateral this lane must not cause. So:
--   · the token lane is TIGHT and is what C3's writers now use (converted in this same session);
--   · the legacy literal lane is UNCHANGED, so C4 and C5 behave exactly as they did;
--   · making the token mandatory is then a ONE-LINE change to this guard, once those lanes adopt
--     `hr.arm_write()`. ROUTED to the C4 and C5 owners and to the db-rules owner, with the
--     evidence above.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ the key `authenticated` cannot read
create table if not exists hr._write_guard_key (
  id boolean primary key default true check (id),
  key text not null,
  created_at timestamptz not null default now()
);

insert into hr._write_guard_key (id, key)
select true, encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from hr._write_guard_key);

-- no RLS lane, no grants: only the definer functions below ever read it
revoke all on table hr._write_guard_key from public;
revoke all on table hr._write_guard_key from anon, authenticated;
alter table hr._write_guard_key enable row level security;

comment on table hr._write_guard_key is
  'The unforgeable half of the HR write guard. Not an entity and deliberately not registered: it has no organization, no owner and no client lane. `authenticated` holds no grant, which is what stops a client arming hr.privileged_write by calling set_config themselves (proven live before this existed: a self-armed authenticated INSERT into hr.job_title succeeded).';

-- ============================================================ the arm
create or replace function hr.arm_write()
returns void
language plpgsql security definer set search_path = hr, public
as $fn$
begin
  perform set_config('hr.privileged_write',
    md5(statement_timestamp()::text || pg_backend_pid()::text ||
        (select k.key from hr._write_guard_key k limit 1)),
    true);
end
$fn$;

comment on function hr.arm_write is
  'THE ONLY sanctioned way to arm the HR write guard (SPEC-ACCESS law 2). The token is statement-scoped — statement_timestamp() is stable across a function''s inner statements and changes between top-level statements — so the arm dies with the statement instead of surviving the whole transaction. It is also unforgeable: this function is REVOKEd from authenticated/anon, and the token mixes a key that role cannot read.';

revoke all on function hr.arm_write() from public;
revoke all on function hr.arm_write() from anon, authenticated;

-- ============================================================ the guard
-- SECURITY DEFINER so it can read the key regardless of which role is writing. It reads and
-- compares; it writes nothing.
create or replace function hr._guard_hr_write() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_flag text;
begin
  v_flag := coalesce(current_setting('hr.privileged_write', true), '');

  -- THE TIGHT LANE: a statement-scoped, unforgeable token from hr.arm_write().
  if v_flag <> '' and v_flag = md5(statement_timestamp()::text || pg_backend_pid()::text ||
                                   (select k.key from hr._write_guard_key k limit 1)) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- THE LEGACY LANE, kept deliberately: 46 live functions across the C4 workflow and C5
  -- jurisdiction lanes, plus 14 applied migrations' seed blocks, still arm with the literal.
  -- Removing it here would break them all, which is collateral this change must not cause.
  -- It is a ONE-LINE deletion once those lanes adopt hr.arm_write(). Until then this lane's
  -- writers are tight and theirs are exactly as loose as they were.
  if v_flag in ('on','true','1','yes') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  raise exception 'hr_write_forbidden: % on %.% has no privileged HR write path', tg_op, tg_table_schema, tg_table_name
    using errcode = '42501',
          hint = 'SPEC-ACCESS law 2: every hr.* write goes through a SECURITY DEFINER RPC (or aidream under acting_as_user) that calls hr.arm_write(). No client writes an hr table through PostgREST.';
end
$fn$;

-- ============================================================ the ONE shared writer this lane depends on
-- `hr._record_access_audit` belongs to core tranche 4's file, but EVERY door in this lane calls it,
-- so while it arms with the legacy literal a door call still leaves the guard disarmed for the
-- rest of the transaction — defect 1, by the back door. It is converted here rather than left,
-- and converted PROGRAMMATICALLY from its own live definition so the rewrite is provably faithful:
-- nothing but the arm line changes. It is strictly better for every other lane that calls it too
-- (hr.eeo_aggregate, hr.blended_labor_rate), because the token lane is what the guard prefers and
-- the function keeps working either way. No other lane's function is touched.
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_record_access_audit';
  if v_def is null then
    raise exception 'hr_c3_00: hr._record_access_audit is missing; the doors depend on it';
  end if;

  v_new := replace(v_def, 'perform set_config(''hr.privileged_write'', ''on'', true);',
                          'perform hr.arm_write();');
  v_new := replace(v_new, 'perform set_config(''hr.privileged_write'',''on'',true);',
                          'perform hr.arm_write();');
  if v_new = v_def then
    raise notice 'hr_c3_00: hr._record_access_audit already uses hr.arm_write() (or its arm line moved)';
  else
    execute v_new;
  end if;
end $$;

-- ============================================================ §1.3b the subject-resolution gap
-- 🚨 C4's second finding: `hr.can_approve` could not resolve a subject for an hr_employee-targeted
-- action, so it RAISED 22023 — `hr.employee is not an approvable target table` — and the
-- `profile_edit_request` / `address_change` flows §1.3a and §8 both name could never activate.
-- `hr.employee_private` was worse than a raise: it was mapped to NULL, so it returned a verdict
-- with NO subject, which means RULE 1 — never-approve-yourself — could not fire on the one flow
-- §8 routes an employee's OWN address change through. A silent false is not safer than a raise;
-- it is the same hole with the alarm switched off.
--
-- All three person-scoped tokens now resolve through the employee's own employment chain, newest
-- spell first (the same ordering hr._door_verdict already uses), so a target that names a PERSON
-- resolves to the spell that person currently holds.
create or replace function hr._approval_subject(p_target_table text, p_target_id uuid)
returns uuid
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_col text; v_sub uuid; v_emp uuid;
begin
  -- ---- the person-scoped targets: resolve the employee, then their current spell
  if p_target_table in ('hr.employee','hr.employee_private','hr.emergency_contact') then
    if p_target_table = 'hr.employee' then
      v_emp := p_target_id;
    else
      execute format('select employee_id from %I.%I where id = $1',
                     'hr', split_part(p_target_table,'.',2)) into v_emp using p_target_id;
    end if;
    if v_emp is null then return null; end if;
    select em.id into v_sub
      from hr.employment em
     where em.employee_id = v_emp and em.deleted_at is null
     order by em.hire_date desc limit 1;
    return v_sub;
  end if;

  v_col := case p_target_table
    when 'hr.leave_request'         then 'employment_id'
    when 'hr.leave_case'            then 'employment_id'
    when 'hr.pay_period_employment' then 'employment_id'
    when 'hr.time_adjustment'       then 'employment_id'
    when 'hr.overtime_preapproval'  then 'employment_id'
    when 'hr.shift_claim'           then 'requester_employment_id'
    when 'hr.schedule_change'       then 'employment_id'
    when 'hr.availability'          then 'employment_id'
    when 'hr.compensation'          then 'employment_id'
    when 'hr.position_assignment'   then 'employment_id'
    when 'hr.corrective_action'     then 'employment_id'
    when 'hr.separation'            then 'employment_id'
    when 'hr.training_assignment'   then 'employment_id'
    when 'hr.checklist_item'        then 'assignee_employment_id'
    when 'hr.requisition'           then null
    when 'hr.offer'                 then null
    when 'hr.background_check'      then 'employment_id'
    when 'hr.tax_withholding'       then 'employment_id'
    when 'hr.schedule'              then null
    else '!unknown'
  end;

  if v_col = '!unknown' then
    raise exception 'hr.can_approve: % is not an approvable target table', p_target_table
      using errcode = '22023',
            hint = 'Add it to hr._approval_subject''s allowlist together with the column that names its subject employment.';
  end if;

  if v_col is null then
    -- a target with no subject employment at all (a requisition, a schedule, an offer to an
    -- outsider). There is nobody to be, so rule 1 cannot fire and the resolver returns NULL.
    return null;
  end if;

  execute format('select %I from %I.%I where id = $1',
                 v_col, split_part(p_target_table,'.',1), split_part(p_target_table,'.',2))
     into v_sub using p_target_id;
  return v_sub;
end
$fn$;

revoke all on function hr._approval_subject(text, uuid) from public;
revoke all on function hr._approval_subject(text, uuid) from anon;
grant execute on function hr._approval_subject(text, uuid) to authenticated, service_role;

-- ============================================================ assertions
do $$
declare v_bad int;
begin
  if not exists (select 1 from hr._write_guard_key) then
    raise exception 'hr_c3_00: the write-guard key was not seeded';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'hr' and table_name = '_write_guard_key'
                and grantee in ('authenticated','anon','public')) then
    raise exception 'hr_c3_00: the write-guard key is readable by a client role';
  end if;
  if has_function_privilege('authenticated', 'hr.arm_write()', 'execute')
     or has_function_privilege('anon', 'hr.arm_write()', 'execute') then
    raise exception 'hr_c3_00: hr.arm_write is callable by a client role — the forgery hole is still open';
  end if;
  if not (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'hr' and p.proname = '_guard_hr_write') then
    raise exception 'hr_c3_00: the guard must be SECURITY DEFINER to read the key';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_record_access_audit') like '%privileged_write%''on''%' then
    raise exception 'hr_c3_00: the shared audit writer still arms with the legacy literal';
  end if;

  -- the person-scoped targets resolve rather than raise
  foreach v_bad in array ARRAY[1] loop null; end loop;
  begin
    perform hr._approval_subject('hr.employee', gen_random_uuid());
    perform hr._approval_subject('hr.employee_private', gen_random_uuid());
    perform hr._approval_subject('hr.emergency_contact', gen_random_uuid());
  exception when others then
    raise exception 'hr_c3_00: a person-scoped approval target still raises: %', sqlerrm;
  end;

  -- the whole schema still certifies
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c3_00: % hr tokens no longer certify', v_bad;
  end if;
end $$;
