-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Finding C: `time.recompute` is a DEAD DOOR — declared by three frozen endpoints, held by no role.
--
-- E-11 `POST /hr/time/recompute`, E-12 `.../exceptions/scan` and E-56 `.../overtime/scan` all gate on
-- `time.recompute`. Measured across every `hr.access_role.capabilities` array: **zero roles hold it**,
-- so all three return `hr_capability_denied` naming a capability no grant could ever supply. The
-- gate is in aidream's router, not in any SQL function — which is why a `prosrc` scan of the
-- database finds the token nowhere and sees nothing wrong.
--
-- 🚨 THIS ALREADY HAD A RULE AND A GATE. SPEC-ACCESS records THE DEAD-DOOR RULE (2026-08-26, after
-- L13 shipped five of these): "a capability token declared by an endpoint and held by no role is a
-- DEAD DOOR, and §1's builtin seed must cover every declared token", plus structural gate **T-41**
-- to assert it "as a token-set difference, not as 'can role X do Y', because a dead door refuses
-- everyone and therefore passes every leak-shaped test." T-41 was specified and **never built** —
-- no code anywhere references it. That is why this recurred five weeks later in a different lane.
-- This migration builds it.
--
-- 🚨 AND IT IS NOT ONE TOKEN, IT IS SIXTEEN. Of the 21 capability tokens declared by frozen `E-*`
-- endpoints in SPEC-CONTRACTS, **16 are held by no role**: background_check.request,
-- governance.calculate, leave.accrue, leave.calculate, offboarding.calculate, onboarding.calculate,
-- onboarding.report, rules.read, schedule.calculate, schedule.draft, schedule.read, settings.write,
-- time.calculate, time.recompute, training.calculate, verification.issue. Only five are live
-- (background_check.adjudicate, payroll.export, payroll.read, ssn.reveal, time.read).
--
-- SPEC-ACCESS §1.4 IS SILENT ON `time.recompute` — it does not appear anywhere in that spec, so
-- there is no frozen holder roster to honour. Per the ruling it is seeded onto the people who
-- process payroll: `hr_owner`, `hr_admin`, `payroll_admin`. Owed back to SPEC-ACCESS §1.4 with the
-- others.
--
-- Authority: coordinator ruling (finding C); SPEC-ACCESS THE DEAD-DOOR RULE + T-41;
-- SPEC-CONTRACTS §… E-11 / E-12 / E-56.
--
-- Applied live as `hr_l3_52_time_recompute_has_a_holder`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. SEEDED ON THE THREE PAYROLL ROLES, NOT ON `manager`. Recompute re-derives the hours a payroll
--    file is built from. `manager` holds `time.read` and approves timecards; re-deriving the
--    computed record is an HR/payroll act, and handing it to every manager would put the numbers
--    behind an approval back in the hands of the person who just approved them.
-- 2. THE ROLES ARE BUILTINS IN THE SYSTEM ORG. All nine `hr.access_role` rows live in
--    39c38960 (Matrx System) and are inherited by every employer, so one seed covers every org —
--    which is also why a missing token is missing EVERYWHERE, and why this is a platform defect
--    rather than a per-customer configuration mistake.
-- 3. T-41 SCANS TWO SOURCES, BECAUSE ONE IS NOT ENOUGH. Tokens gated by a live SQL function are
--    found automatically from `prosrc`. Tokens gated only in aidream cannot be — so the frozen
--    endpoint set is carried as a literal list sourced from SPEC-CONTRACTS. That list is the one
--    hand-maintained thing here, and it is the reason the check can see `time.recompute` at all.
-- 4. THE ALLOWLIST IS DATED AND VISIBLE, NOT A SILENCER. The other 15 dead doors belong to lanes
--    that have not yet seeded their roles, and I will not seed another domain's capabilities on my
--    own authority. They ride an explicit allowlist — which SPEC-ACCESS permits ("held-by-none is
--    allowed only as a stated decision") — each carrying the same honest reason and a date. The
--    check prints the whole allowlist in its detail on EVERY run, green or red, so it cannot become
--    the quiet place where dead doors go to be forgotten.
-- 5. AN ALLOWLISTED TOKEN THAT GAINS A HOLDER IS REPORTED, NOT FAILED. When a lane seeds its own
--    tokens, its allowlist entries become stale. The check surfaces those under
--    `allowlist_now_held` so they get pruned, but does not go red for them — turning another lane's
--    correct fix into my gate's failure is how gates get resented and then bypassed.

-- ── 1. the seed (decisions 1 and 2) ─────────────────────────────────────────────────────────
do $mig$
declare v_n int;
begin
  perform hr.arm_write();
  update hr.access_role r
     set capabilities = (select array_agg(distinct c order by c)
                           from unnest(r.capabilities || array['time.recompute']) c)
   where r.role_key in ('hr_owner','hr_admin','payroll_admin')
     and r.deleted_at is null
     and not ('time.recompute' = any(r.capabilities));
  get diagnostics v_n = row_count;
  raise notice 'hr_l3_52: time.recompute seeded onto % role(s)', v_n;
end
$mig$;

-- ── 2. T-41, the gate SPEC-ACCESS specified and nobody built ─────────────────────────────────
create or replace function hr.dead_capability_doors()
returns table(token text, declared_by text, holders integer, allowlisted boolean, reason text)
language sql stable security definer set search_path to 'hr','public'
as $fn$
  with endpoint_declared(tok) as (values
    -- decision 3: sourced from SPEC-CONTRACTS' frozen E-* endpoint table. These gate in aidream's
    -- router, so no scan of this database can discover them.
    ('background_check.adjudicate'),('background_check.request'),('governance.calculate'),
    ('leave.accrue'),('leave.calculate'),('offboarding.calculate'),('onboarding.calculate'),
    ('onboarding.report'),('payroll.export'),('payroll.read'),('rules.read'),
    ('schedule.calculate'),('schedule.draft'),('schedule.read'),('settings.write'),
    ('ssn.reveal'),('time.calculate'),('time.read'),('time.recompute'),
    ('training.calculate'),('verification.issue')
  ), sql_gated(tok) as (
    select distinct (regexp_matches(p.prosrc,
      '(?:hr\._?punch_capability|hr\.capability)\s*\(\s*[^,]+,\s*''([a-z_]+\.[a-z_]+)''', 'g'))[1]
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('hr','public') and p.prokind = 'f'
  ), declared as (
    select tok, 'frozen endpoint (SPEC-CONTRACTS)' src from endpoint_declared
    union
    select tok, 'live SQL gate' from sql_gated
  ), allow(tok, why) as (values
    -- decision 4: dated, stated, and printed on every run. NOT a silencer.
    ('background_check.request','2026-08-27: hiring lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('governance.calculate',   '2026-08-27: governance lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('leave.accrue',           '2026-08-27: leave lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('leave.calculate',        '2026-08-27: leave lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('offboarding.calculate',  '2026-08-27: offboarding lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('onboarding.calculate',   '2026-08-27: onboarding lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('onboarding.report',      '2026-08-27: onboarding lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('rules.read',             '2026-08-27: jurisdiction lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('schedule.calculate',     '2026-08-27: scheduling lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('schedule.draft',         '2026-08-27: scheduling lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('schedule.read',          '2026-08-27: scheduling lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('settings.write',         '2026-08-27: settings lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('time.calculate',         '2026-08-27: declared by a frozen endpoint L3 does not own - owed to SPEC-ACCESS §1.4'),
    ('training.calculate',     '2026-08-27: training lane has not seeded its roles - owed to SPEC-ACCESS §1.4'),
    ('verification.issue',     '2026-08-27: verification lane has not seeded its roles - owed to SPEC-ACCESS §1.4')
  )
  select d.tok,
         string_agg(distinct d.src, ' + ' order by d.src),
         (select count(*)::integer from hr.access_role r
           where r.deleted_at is null and r.is_active and d.tok = any(r.capabilities)),
         (a.tok is not null),
         a.why
    from declared d
    left join allow a on a.tok = d.tok
   group by d.tok, a.tok, a.why
   order by d.tok;
$fn$;

revoke execute on function hr.dead_capability_doors() from public, anon;

-- ── 3. wire T-41 into the standing gate ──────────────────────────────────────────────────────
do $mig$
declare
  v_def text;
  v_anchor text := ', not the row.'');' || E'\n  return next;\nend';
  v_block text;
begin
  v_def := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);

  if position('no_dead_capability_doors' in v_def) > 0 then
    raise notice 'hr_l3_52: T-41 is already wired';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_52: could not find the end of the conformance function; refusing to guess';
  end if;

  v_block :=
', not the row.'');
  return next;

  ---------------------------------------------------------------- 21. T-41: no dead capability doors
  check_key := ''no_dead_capability_doors'';
  select coalesce(jsonb_agg(jsonb_build_object(
           ''token'', d.token, ''declared_by'', d.declared_by) order by d.token), ''[]''::jsonb)
    into v_bad
    from hr.dead_capability_doors() d
   where d.holders = 0 and not d.allowlisted;
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(
    ''violations'', v_bad,
    -- decision 4: the allowlist is printed on EVERY run, so it cannot quietly rot
    ''allowlisted_dead_doors'', (select coalesce(jsonb_agg(jsonb_build_object(
          ''token'', d.token, ''reason'', d.reason) order by d.token), ''[]''::jsonb)
        from hr.dead_capability_doors() d where d.holders = 0 and d.allowlisted),
    -- decision 5: stale allowlist entries surface here rather than failing the check
    ''allowlist_now_held'', (select coalesce(jsonb_agg(d.token order by d.token), ''[]''::jsonb)
        from hr.dead_capability_doors() d where d.holders > 0 and d.allowlisted),
    ''why'', ''SPEC-ACCESS THE DEAD-DOOR RULE: a capability token declared by an endpoint and held ''
      || ''by no role refuses EVERYONE, so it passes every leak-shaped test and shows up only as a ''
      || ''403 nobody can clear. T-41 was specified on 2026-08-26 after L13 shipped five of them ''
      || ''and was never built; time.recompute was the sixteenth. Asserted as a token-set ''
      || ''difference, never as "can role X do Y".'');
  return next;
end';

  v_def := replace(v_def, v_anchor, v_block);
  execute v_def;
end
$mig$;

-- ── 4. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare v_n int; v_fail jsonb;
begin
  -- the reported defect is closed
  if (select count(*) from hr.access_role
       where deleted_at is null and is_active and 'time.recompute' = any(capabilities)) <> 3 then
    raise exception 'hr_l3_52: time.recompute is not held by exactly the three payroll roles';
  end if;
  if exists (select 1 from hr.dead_capability_doors()
              where token = 'time.recompute' and (holders = 0 or allowlisted)) then
    raise exception 'hr_l3_52: time.recompute is still a dead door, or was allowlisted instead of fixed';
  end if;

  -- decision 1: manager did NOT gain it
  if exists (select 1 from hr.access_role
              where role_key = 'manager' and 'time.recompute' = any(capabilities)) then
    raise exception 'hr_l3_52: manager was given time.recompute; decision 1 says otherwise';
  end if;

  -- T-41 is present, blocking, and green
  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n < 21 then
    raise exception 'hr_l3_52: expected at least 21 checks, found %', v_n;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('check', check_key, 'detail', detail)), '[]'::jsonb)
    into v_fail from hr.punch_write_path_conformance() where not ok;
  if v_fail <> '[]'::jsonb then
    raise exception 'hr_l3_52: the gate is red on arrival: %', v_fail::text;
  end if;

  -- and it can actually fail: every allowlisted token is a token it WOULD have caught
  if (select count(*) from hr.dead_capability_doors() where holders = 0 and allowlisted) <> 15 then
    raise exception 'hr_l3_52: the allowlist no longer covers exactly the 15 measured dead doors';
  end if;
end
$chk$;
