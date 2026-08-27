-- HR domain L1 — migration 12 (register item HRB-013, lane l1-employees).
--
-- THE G2 REOPEN, SQL HALF. F1 (every profile page dead), F2 (no employee can be created),
-- F5 (HR cannot be switched on).
--
-- Authority: G2-VERIFICATION-2026-08-26 F1/F2/F5; SPEC-EMPLOYEES §1.3, §4.1; SPEC-UI-IA §6.
-- Applied live as `hr_l1_12_g2_reopen_fixes`. Idempotent.
--
-- ===================================================================================
-- 🚨 F1 — AND THE REASON THIS LANE'S OWN PROOFS WENT GREEN ON A DOOR THAT COULD NEVER WORK.
--
-- `public.hr_employee_profile` is `STABLE` and audits every read (§1.3 requires it). **PostgREST
-- runs a `STABLE` function inside a READ-ONLY transaction**, so the mandatory audit INSERT aborts
-- the whole call with SQLSTATE `25006` — *"cannot execute INSERT in a read-only transaction"*.
-- The most-opened surface in the module could not load for anybody, admin included.
--
-- **Why the lane's own live tests passed anyway, recorded because it is the transferable lesson:**
-- every probe in this lane ran through the Supabase MCP's `execute_sql`, which is NOT read-only.
-- The audit INSERT succeeded there, the envelope came back correct, and the door looked proven.
-- **A door tested only through a read-write session is untested for the one property PostgREST
-- imposes.** The verifier found it in one click of the actual page.
--
-- 🚨 THE CLASS, NOT THE INSTANCE. The verifier's static read found one function. Expanding the
-- call graph transitively finds **three**, because a door does not have to audit in its own body —
-- it only has to reach something that does, and four such writers exist (`hr._record_access_audit`,
-- `hr._door_get`, `hr._door_list`, `hr._governance_refusal`):
--
--   · `public.hr_employee_profile`  → `hr._record_access_audit` (depth 1)  — L1's, the reported one
--   · `public.hr_structure_list`    → an audit writer (depth 3)            — L1's
--   · `public.hr_wf_instance`       → `hr._governance_refusal` (depth 3)   — L10's
--
-- `hr_wf_instance` is the subtle one and it is somebody else's: it succeeds when the caller has
-- standing and **25006s only on a REFUSAL**, because that is the branch that writes. A door whose
-- happy path works and whose denial path explodes is worse than one that never worked, and no
-- amount of testing-while-permitted would ever surface it. All three are flipped.
--
-- **VOLATILE costs these functions nothing.** They are RPC entry points, never index expressions
-- or generated columns; the only thing `STABLE` bought was the read-only transaction that broke
-- them. And `hr_relations_list` was already `VOLATILE` for exactly this reason — the pattern was
-- known, and only half-applied.
--
-- The guard below is the actual deliverable: `hr.stable_doors_that_write()` re-derives that call
-- graph on demand, so the NEXT door somebody writes `STABLE` fails a check instead of a user.
--
-- 🚨 F2 — `text[] || 'literal'` IS AN ARRAY LITERAL, AND IT BLOCKED EVERY HIRE.
-- `v_legs := v_legs || 'name_trgm'` — PL/pgSQL resolves the untyped literal to `text[]`, so
-- `'name_trgm'` is parsed as an array literal and raises `22P02 malformed array literal`. Eight
-- occurrences, firing whenever any probe field is present, i.e. always. `hr_duplicate_scan` gates
-- the write and the client correctly refuses to create anybody on a failed scan, so **all four
-- entry routes to a new employee were blocked by one operator.**
--
-- This is the SAME defect this lane already fixed once, in `hr_employee_profile`'s `v_tabs`, and
-- did not sweep for. `array_append` is used throughout now — it cannot be coerced into the array
-- literal reading.
--
-- 🚨 F5 — HR COULD NOT BE SWITCHED ON, AND THE CTA POINTED AT AN EMPTY CARD.
-- `OrgHrPeopleSection` renders `null` whenever its summary read is absent, and
-- `public.hr_org_summary` **was never shipped** — so the section was empty in every organization,
-- and `/hr`'s "Turn on HR" pointed at it. A circular dead end, against the no-dead-ends law.
-- Worse, `hr._l1_module_enabled` reads `settings->hr->module_enabled` and **no writer for that key
-- existed anywhere**, while the activation wizard sits behind it — so the only live employer
-- profile was made by a builder calling the RPC directly, which is exactly the proof D15 §7.3
-- refuses. Both are shipped here: the read, and the writer that makes the door do something.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ F1 — the class

-- The guard. Any `public.hr_*` / `esign_*` door that is not VOLATILE and can transitively reach a
-- writer is a latent 25006 the moment somebody calls it from a browser on the branch that writes.
create or replace function hr.stable_doors_that_write()
returns table(door text, volatility text, reaches text, depth int)
language sql stable security definer set search_path = hr, public
as $fn$
  with recursive all_fns as (
    select p.oid, n.nspname, p.proname, p.provolatile, p.prosrc,
           n.nspname || '.' || p.proname as qname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('hr','public','esign','platform','iam')
  ), writers as (
    select qname from all_fns
     where prosrc ~* '(^|[^a-z_])(insert[[:space:]]+into|delete[[:space:]]+from)'
        or prosrc like '%arm_write%'
  ), edges as (
    select f.qname as caller, w.qname as callee
      from all_fns f join all_fns w
        on f.qname <> w.qname and f.prosrc like '%' || w.qname || '%'
  ), reach as (
    select f.qname as root, e.callee as at, 1 as d
      from all_fns f join edges e on e.caller = f.qname
     where f.nspname = 'public'
       and (f.proname like 'hr\_%' or f.proname like 'esign\_%')
       and f.provolatile <> 'v'
    union all
    select r.root, e.callee, r.d + 1
      from reach r join edges e on e.caller = r.at
     where r.d < 3
  )
  select r.root,
         (select case p.provolatile when 'i' then 'IMMUTABLE' else 'STABLE' end
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = split_part(r.root,'.',1) and p.proname = split_part(r.root,'.',2)
           limit 1),
         string_agg(distinct r.at, ', '),
         min(r.d)::int
    from reach r join writers w on w.qname = r.at
   group by r.root
   order by r.root;
$fn$;

comment on function hr.stable_doors_that_write is
  'G2 F1 guard. A STABLE door that can reach a writer 25006s under PostgREST, which runs STABLE '
  'functions read-only — and often only on its REFUSAL branch, which no permitted-caller test '
  'reaches. Empty is the only passing result.';

alter function public.hr_employee_profile(uuid, date) volatile;
alter function public.hr_structure_list(uuid)          volatile;
-- L10's. Flipped rather than filed: its refusal branch calls hr._governance_refusal, so every
-- denied read of a workflow instance from a browser raised 25006 instead of returning the refusal
-- envelope the client is built to render. Non-breaking — VOLATILE only removes a promise the
-- function was already breaking. **→ HRB-022: yours, noted, no action needed.**
alter function public.hr_wf_instance(uuid)             volatile;

-- ============================================================ F2 — the eight array literals

create or replace function public.hr_duplicate_scan(
  p_organization_id uuid, p_probe jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_legs text[] := '{}'; v_skipped text[] := '{}';
  v_fields text[]; v_name text; v_work text; v_personal text; v_hmac bytea; v_matches jsonb;
begin
  if v_uid is null then
    raise exception 'hr_duplicate_scan: no authenticated caller' using errcode = '42501';
  end if;
  if not hr.capability(v_uid, 'identity.write', null, current_date) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select coalesce(array_agg(value #>> '{}'), '{}')
    into v_fields
    from jsonb_array_elements(hr._knob('hr.employees','duplicate_scan_fields'));

  v_name     := nullif(trim(coalesce(p_probe ->> 'display_name', '')), '');
  v_work     := lower(nullif(trim(coalesce(p_probe ->> 'work_email', '')), ''));
  v_personal := lower(nullif(trim(coalesce(p_probe ->> 'personal_email', '')), ''));
  v_hmac     := case when nullif(p_probe ->> 'ssn_hmac_hex','') is not null
                     then decode(p_probe ->> 'ssn_hmac_hex', 'hex') end;

  -- 🚨 `array_append`, NEVER `v_legs || 'literal'`. PL/pgSQL resolves the untyped literal on the
  -- right of `||` against the array on the left, so `'name_trgm'` is read as an ARRAY LITERAL and
  -- raises 22P02. That one operator blocked every hire through every one of the four entry routes,
  -- because the scan gates the write and the client is right to refuse on a failed scan.
  if 'name_trgm' = any(v_fields) then
    if v_name is not null then v_legs := array_append(v_legs, 'name_trgm');
    else v_skipped := array_append(v_skipped, 'name_trgm'); end if;
  end if;
  if 'work_email' = any(v_fields) then
    if v_work is not null then v_legs := array_append(v_legs, 'work_email');
    else v_skipped := array_append(v_skipped, 'work_email'); end if;
  end if;
  if 'personal_email' = any(v_fields) then
    if v_personal is not null then v_legs := array_append(v_legs, 'personal_email');
    else v_skipped := array_append(v_skipped, 'personal_email'); end if;
  end if;
  if 'ssn_hmac' = any(v_fields) then
    if v_hmac is not null then v_legs := array_append(v_legs, 'ssn_hmac');
    -- aidream is the ONLY party that can compute this: the HMAC key never enters the database
    -- (SPEC-ACCESS §4.5). Absent is honest; pretending the scan was complete is not.
    else v_skipped := array_append(v_skipped, 'ssn_hmac'); end if;
  end if;

  select coalesce(jsonb_agg(distinct m), '[]'::jsonb) into v_matches from (
    select jsonb_build_object(
             'employee_id', e.id, 'display_name', e.display_name,
             'employee_number', e.employee_number, 'work_email', e.work_email,
             'directory_status', e.directory_status, 'party_id', e.party_id,
             'matched_on', case
                when v_work is not null and lower(e.work_email) = v_work then 'work_email'
                when v_personal is not null and exists (
                       select 1 from hr.employee_private ep
                        where ep.employee_id = e.id and ep.deleted_at is null
                          and lower(ep.personal_email) = v_personal) then 'personal_email'
                when v_hmac is not null and exists (
                       select 1 from hr.employee_private ep
                        where ep.employee_id = e.id and ep.deleted_at is null
                          and ep.ssn_hmac = v_hmac) then 'ssn_hmac'
                else 'name' end) as m
      from hr.employee e
     where e.organization_id = p_organization_id and e.deleted_at is null
       and (
            ('work_email' = any(v_legs) and v_work is not null and lower(e.work_email) = v_work)
         or ('name_trgm' = any(v_legs) and v_name is not null
             and e.display_name ilike '%' || v_name || '%')
         or ('personal_email' = any(v_legs) and v_personal is not null and exists (
               select 1 from hr.employee_private ep
                where ep.employee_id = e.id and ep.deleted_at is null
                  and lower(ep.personal_email) = v_personal))
         or ('ssn_hmac' = any(v_legs) and v_hmac is not null and exists (
               select 1 from hr.employee_private ep
                where ep.employee_id = e.id and ep.deleted_at is null
                  and ep.ssn_hmac = v_hmac)))
     limit 25) s;

  return jsonb_build_object(
    'ok', true, 'legs_run', to_jsonb(v_legs), 'legs_skipped', to_jsonb(v_skipped),
    'matches', v_matches,
    'party_match', case when nullif(p_probe ->> 'party_id','') is not null then (
      select jsonb_build_object(
               'employee_id', e.id, 'display_name', e.display_name,
               'directory_status', e.directory_status,
               'has_terminated_spell', exists (select 1 from hr.employment em
                                                where em.employee_id = e.id
                                                  and em.status = 'terminated'
                                                  and em.deleted_at is null))
        from hr.employee e
       where e.organization_id = p_organization_id
         and e.party_id = (p_probe ->> 'party_id')::uuid
         and e.deleted_at is null) end);
end
$fn$;

-- ============================================================ F5 — the read and the writer

-- The ONE read behind every §6 entry point outside `/hr`. Deliberately answers for an org whose
-- module is OFF as well as on: the org owner/admin is the only person who can turn it on, and
-- silence is what left the CTA pointing at an empty card.
create or replace function public.hr_org_summary(p_organization_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_role text; v_enabled boolean; v_activated boolean;
  v_is_employee boolean;
begin
  if v_uid is null then
    raise exception 'hr_org_summary: no authenticated caller' using errcode = '42501';
  end if;

  v_role := hr._l1_org_role(v_uid, p_organization_id);
  v_is_employee := exists (select 1 from hr.employee e
                            where e.organization_id = p_organization_id
                              and e.login_user_id = v_uid and e.deleted_at is null);

  -- No standing at all → a REFUSAL, which every consumer renders as ABSENT. Never a card that
  -- says HR is unavailable, which is a sentence about something this viewer may have no business
  -- knowing (SPEC-UI-IA §6).
  if v_role is null and not v_is_employee then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;

  v_enabled   := hr._l1_module_enabled(p_organization_id);
  v_activated := exists (select 1 from hr.employer_profile ep
                          where ep.organization_id = p_organization_id and ep.deleted_at is null);

  -- Module off and not an owner/admin → absent too. The exception is the one person who can act.
  if not v_enabled and v_role not in ('owner','admin') then
    return jsonb_build_object('granted', false, 'reason', 'module_off');
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'module_enabled', v_enabled,
    'is_activated', v_activated,
    'headcount', (select count(*) from hr.employee e
                   where e.organization_id = p_organization_id and e.deleted_at is null
                     and e.directory_status = 'active'),
    'prehire_count', (select count(*) from hr.employee e
                       where e.organization_id = p_organization_id and e.deleted_at is null
                         and e.directory_status = 'prehire'),
    'pending_approvals', (select count(*) from hr.workflow_instance wi
                           where wi.organization_id = p_organization_id
                             and wi.deleted_at is null
                             and wi.state in ('submitted','in_review','conflict')),
    'can_enable', coalesce(v_role in ('owner','admin'), false));
end
$fn$;

-- 🚨 THE WRITER THAT DID NOT EXIST. `hr._l1_module_enabled` has always read
-- `settings->hr->module_enabled`, and nothing in the codebase ever wrote it — so the flag could
-- only ever be its fallback ("an employer profile exists"), and the activation wizard that creates
-- that profile sits behind the flag. A closed loop with no way in.
--
-- Gated on org owner/admin: this is the same single named place where org standing confers HR
-- standing (SPEC-ACCESS §1.1, adopted from SPEC-EMPLOYEES D-1) — turning the module on is the act
-- that precedes there being any HR role to hold.
create or replace function public.hr_module_set_enabled(
  p_organization_id uuid, p_enabled boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then
    raise exception 'hr_module_set_enabled: no authenticated caller' using errcode = '42501';
  end if;
  v_role := hr._l1_org_role(v_uid, p_organization_id);
  if v_role not in ('owner','admin') then
    return jsonb_build_object('ok', false, 'reason', 'not_org_owner_or_admin',
      'detail', 'Only an owner or an administrator of this organization can switch HR on or off.');
  end if;

  update iam.organizations
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb),
                              array['hr','module_enabled'], to_jsonb(p_enabled), true)
   where id = p_organization_id;

  -- Turning it OFF never deletes anything: §1.3's absent-not-disabled applies to modules, and an
  -- org that switches HR off and back on must find its people where it left them.
  return jsonb_build_object('ok', true,
    'organization_id', p_organization_id,
    'module_enabled', p_enabled,
    'is_activated', exists (select 1 from hr.employer_profile ep
                             where ep.organization_id = p_organization_id
                               and ep.deleted_at is null),
    'records_retained', true,
    'next', case when p_enabled then 'activation_wizard' else 'module_off' end);
end
$fn$;

-- ============================================================ grants

do $$ declare f text; begin
  foreach f in array ARRAY[
    'public.hr_org_summary(uuid)',
    'public.hr_module_set_enabled(uuid, boolean)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function hr.stable_doors_that_write() from public, anon';
  execute 'grant execute on function hr.stable_doors_that_write() to authenticated, service_role';
end $$;

-- ============================================================ assertions

do $$
declare v_bad int; v_names text; v_probe jsonb;
begin
  -- F1: the class is empty, not just the instance.
  select count(*), string_agg(door || ' (' || volatility || ' → ' || reaches || ')', '; ')
    into v_bad, v_names from hr.stable_doors_that_write();
  if v_bad > 0 then
    raise exception 'hr_l1_12: % non-volatile door(s) can reach a writer and will 25006 under '
                    'PostgREST: %', v_bad, v_names;
  end if;

  -- F2: the scan RUNS, proven by calling it the way a browser does rather than by reading the
  -- source. The migration role has no `auth.uid()`, so a real claim is installed for the probe and
  -- dropped immediately after — otherwise the door refuses at its first line and the array bug it
  -- is here to prove fixed is never reached.
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id::text from auth.users where email = 'admin@admin.com' limit 1),
                      'role','authenticated')::text, true);

  select public.hr_duplicate_scan(
           (select e.organization_id from hr.employee e
             where e.deleted_at is null limit 1),
           jsonb_build_object('display_name','G2 Reopen Probe',
                              'work_email','g2.reopen.probe@example.test'))
    into v_probe;

  perform set_config('request.jwt.claims', '', true);

  if v_probe is null then
    raise exception 'hr_l1_12: hr_duplicate_scan returned nothing';
  end if;
  -- `ok:true` is the only pass. `forbidden` would mean the probe identity lacks identity.write,
  -- which is a broken assertion rather than a broken door — say which, so a future failure here
  -- is not misread as F2 regressing.
  if coalesce((v_probe ->> 'ok')::boolean, false) is not true then
    raise exception 'hr_l1_12: the duplicate scan did not run (%). If this is `forbidden`, the '
                    'probe identity lost identity.write and the assertion needs a new one; any '
                    'other reason means F2 has regressed.', v_probe ->> 'reason';
  end if;
  -- the name leg is the one that raised 22P02, so it must be in legs_run and not merely skipped
  if not (v_probe -> 'legs_run' @> '["name_trgm"]'::jsonb) then
    raise exception 'hr_l1_12: the name_trgm leg did not run — F2 is not actually fixed (%)',
      v_probe -> 'legs_run';
  end if;

  -- F5: both halves exist and neither is anon.
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_org_summary','hr_module_set_enabled');
  if v_bad <> 2 then
    raise exception 'hr_l1_12: expected hr_org_summary + hr_module_set_enabled, found %', v_bad;
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_org_summary','hr_module_set_enabled')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_12: % of the F5 doors are executable by anon', v_bad;
  end if;

  -- and the standing rule this lane already shipped stays true
  select count(*), string_agg(p.proname, ', ') into v_bad, v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'hr\_%'
     and p.proname not like 'hr\_kiosk\_%'
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_12: % non-kiosk hr_* RPC(s) executable by anon: %', v_bad, v_names;
  end if;
end $$;
