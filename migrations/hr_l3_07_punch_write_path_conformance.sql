-- HR domain L3 — migration 7 of 9 (register item HRB-015, lane L3 punch + kiosk).
--
-- L3-80: the punch write-path conformance gate. SPEC-TIME §15 is blunt about why this exists —
-- "the `hr.punch_record` conformance query (SPEC-DATA-MODEL §18.5) is the only thing standing
-- between us and a client-direct insert into `hr.punch`. RLS does not prevent it. Wire that query
-- into CI, not into a review checklist."
--
-- Authority: SPEC-DATA-MODEL §7.1 (closing paragraph), §18.5; SPEC-TIME §15; SPEC-ACCESS §6.3;
--            FREEZE §4 D-10; R-L3-READINESS L3-80.
-- Applied live as `hr_l3_07_punch_write_path_conformance`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 §18.5 PUBLISHES QUERIES A–H AND NONE OF THEM IS THIS ONE. A–H are the DOMAIN-WIDE
--    conformance set (restricted children, component visibility columns, registration, org
--    triggers, retention, the write guard, record classes, schedule jurisdiction). SPEC-TIME §15
--    and R-L3 L3-80 both name a "`hr.punch_record` conformance query" that §18.5 does not actually
--    contain. Rather than cite a query that does not exist, this file WRITES it, in §18.5's idiom
--    (a set of independent checks, each with an expected empty result), and the property it
--    measures is exactly the one §7.1's closing paragraph names: a client-direct insert into
--    `hr.punch` is a defect that RLS will not stop, because `hr_punch` is a `component` whose write
--    policy admits anyone holding editor on the parent employment.
--    **AMENDMENT OWED: SPEC-DATA-MODEL §18.5 should carry this query alongside A–H.**
--
-- 2. THE CHECK IS "WHO CAN WRITE", NOT "WHO DID WRITE". It enumerates every function in the
--    database whose body contains an insert/update/delete against `hr.punch` and compares that set
--    against a named allowlist. That catches the real regression — somebody adding a second writer
--    in a later lane — which a row-level audit never would, because the wrong writer's rows look
--    exactly like the right writer's rows.
--
-- 3. ADDING A NAME TO `c_inserters` / `c_updaters` IS A RULING, NOT HOUSEKEEPING. It asserts that
--    the added function upholds every invariant `hr.punch_record` upholds: {{JURIS}} stamped from
--    the position assignment as of `local_work_date`, the {{ACTOR}} block set, idempotency replay
--    as a success path, the worker-class gate, and clock-state legality. Read the body before
--    adding one. The list is deliberately short and deliberately in the function, not in a config
--    row, so the diff is visible in review.
--
-- 4. THE REGEXES ARE BUILT BY CONCATENATION SO THE GATE CANNOT MATCH ITSELF. `'insert' ||
--    '\s+into\s+hr\s*\.\s*punch\y'` never contains the literal string it searches for, so this
--    function does not appear in its own findings. It is also excluded by name as a belt-and-braces
--    second measure — a self-flagging gate trains readers to ignore it, which is how a real
--    finding gets acknowledged unread.
--
-- 5. EVERY CHECK IS `blocking`, AND THE FILE REFUSES TO INSTALL RED. The trailing DO block runs the
--    gate and raises if any check fails at install time. A conformance gate that ships already
--    failing is a gate everybody learns to skip. It installed green on 2026-08-26.
--
-- 6. THE PostgREST PROJECTION IS `public.__hr_punch_write_path_conformance()`, matching the live
--    `public.__ddl_guard_unacked()` convention — `public` keeps functions, not tables, and the
--    double underscore marks it as machinery rather than a product surface. It is granted to
--    `authenticated` and `service_role` and NOT to `anon`: the gate's output names unsanctioned
--    write paths, which is a map of where to attack.
--
-- 7. CHECK 8 IS DELIBERATELY THE OPPOSITE POLARITY OF CHECK 7. Seven asserts `anon` CANNOT reach
--    the five client wrappers; eight asserts `anon` CAN reach the four kiosk doors. Over-tightening
--    is weighed exactly as heavily as a leak (SPEC-ACCESS §6 philosophy), and a wall tablet that
--    silently stops working is a whole location unable to clock in.
-- ===================================================================================

create or replace function hr.punch_write_path_conformance()
returns table (check_key text, ok boolean, severity text, detail jsonb)
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_schemas text;
  v_list    text[];
  v_bad     jsonb;
  -- decision 3: adding a name here is a RULING, not housekeeping.
  c_inserters constant text[] := array[
    'hr.punch_record',                 -- THE writer
    'hr._punch_auto_close_orphan',     -- 4.2 auto-close: a NEW punch, never an edit
    'hr.punch_correct'];               -- 4.1 replacement half of void + replacement
  c_updaters  constant text[] := array[
    'hr.punch_correct',                -- sets voided_* on the original
    'hr.punch_void'];                  -- sets voided_* with no replacement
begin
  ---------------------------------------------------------------- 1. hr is not a PostgREST schema
  select coalesce(array_to_string(s.setconfig, ' '), '') into v_schemas
    from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
   where r.rolname = 'authenticator';
  v_list := string_to_array(
              coalesce((regexp_match(coalesce(v_schemas, ''), 'pgrst\.db_schemas=([^ ]*)'))[1], ''), ',');

  check_key := 'pgrst_hr_not_exposed';
  ok        := not ('hr' = any(coalesce(v_list, '{}'::text[])));
  severity  := 'blocking';
  detail    := jsonb_build_object(
                 'exposed_schemas', to_jsonb(coalesce(v_list, '{}'::text[])),
                 'why', 'A browser can only reach hr.* if this list contains it. It does not, which '
                     || 'is why every client RPC ships as a public.hr_<name> wrapper (TD-1).');
  return next;

  ---------------------------------------------------------------- 2. the three punch triggers
  check_key := 'punch_triggers_present';
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_bad
    from unnest(array['_zz_guard_hr_write','_zz_punch_immutable','_zz_punch_no_delete']) t
   where not exists (select 1 from pg_trigger g
                      where g.tgrelid = 'hr.punch'::regclass and not g.tgisinternal
                        and g.tgname = t and g.tgenabled <> 'D');
  ok       := (v_bad = '[]'::jsonb);
  severity := 'blocking';
  detail   := jsonb_build_object('missing_or_disabled', v_bad,
                'why', 'A trigger function body proves nothing; only a live, enabled binding does.');
  return next;

  ---------------------------------------------------------------- 3. anon holds nothing on hr.punch
  check_key := 'anon_no_table_grants_on_punch';
  select coalesce(jsonb_agg(privilege_type), '[]'::jsonb) into v_bad
    from information_schema.role_table_grants
   where table_schema = 'hr' and table_name = 'punch' and grantee = 'anon';
  ok       := (v_bad = '[]'::jsonb);
  severity := 'blocking';
  detail   := jsonb_build_object('anon_privileges', v_bad,
                'why', 'SPEC-ACCESS 6.3: hr.punch carries zero anon table grants, so a leaked anon '
                    || 'key alone reaches nothing. The definer functions are the only door.');
  return next;

  ---------------------------------------------------------------- 4. only sanctioned INSERTers
  check_key := 'only_sanctioned_inserters';
  select coalesce(jsonb_agg(fn order by fn), '[]'::jsonb) into v_bad
    from (select n.nspname || '.' || p.proname as fn
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where p.prokind = 'f'
             and n.nspname not in ('pg_catalog','information_schema')
             -- decision 4: built by concatenation so the gate cannot match itself
             and pg_get_functiondef(p.oid) ~* ('insert' || '\s+into\s+hr\s*\.\s*punch\y')
             and not (n.nspname || '.' || p.proname = any(c_inserters))
             and p.proname <> 'punch_write_path_conformance') z;
  ok       := (v_bad = '[]'::jsonb);
  severity := 'blocking';
  detail   := jsonb_build_object('unsanctioned_inserters', v_bad,
                'sanctioned', to_jsonb(c_inserters),
                'why', 'hr.punch_record is the ONLY sanctioned writer (SPEC-DATA-MODEL 7.1). A '
                    || 'second inserter is a second set of invariants that will drift.');
  return next;

  ---------------------------------------------------------------- 5. only sanctioned UPDATErs
  check_key := 'only_sanctioned_updaters';
  select coalesce(jsonb_agg(fn order by fn), '[]'::jsonb) into v_bad
    from (select n.nspname || '.' || p.proname as fn
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where p.prokind = 'f'
             and n.nspname not in ('pg_catalog','information_schema')
             and pg_get_functiondef(p.oid) ~* ('update' || '\s+hr\s*\.\s*punch\y')
             and not (n.nspname || '.' || p.proname = any(c_updaters))
             and p.proname <> 'punch_write_path_conformance') z;
  ok       := (v_bad = '[]'::jsonb);
  severity := 'blocking';
  detail   := jsonb_build_object('unsanctioned_updaters', v_bad,
                'sanctioned', to_jsonb(c_updaters),
                'why', 'RAW IS RAW. Only voided_at / voided_reason / voided_by_punch_id may ever '
                    || 'change, and only through the void lane.');
  return next;

  ---------------------------------------------------------------- 6. nothing deletes a punch
  check_key := 'no_punch_deleters';
  select coalesce(jsonb_agg(fn order by fn), '[]'::jsonb) into v_bad
    from (select n.nspname || '.' || p.proname as fn
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where p.prokind = 'f'
             and n.nspname not in ('pg_catalog','information_schema')
             and pg_get_functiondef(p.oid) ~* ('delete' || '\s+from\s+hr\s*\.\s*punch\y')
             and p.proname <> 'punch_write_path_conformance') z;
  ok       := (v_bad = '[]'::jsonb);
  severity := 'blocking';
  detail   := jsonb_build_object('deleters', v_bad,
                'why', 'Never a DELETE. A correction is a void plus a new punch.');
  return next;

  ---------------------------------------------------------------- 7. the wrappers are authenticated-only
  check_key := 'wrappers_authenticated_only';
  select coalesce(jsonb_agg(jsonb_build_object('fn', f, 'problem', why)), '[]'::jsonb) into v_bad
    from (select f,
                 case when to_regprocedure(f) is null then 'missing'
                      when not (select prosecdef from pg_proc where oid = to_regprocedure(f))
                           then 'not security definer'
                      when not has_function_privilege('authenticated', to_regprocedure(f), 'EXECUTE')
                           then 'authenticated cannot execute'
                      when has_function_privilege('anon', to_regprocedure(f), 'EXECUTE')
                           then 'anon CAN execute'
                 end as why
            from unnest(array[
              'public.hr_punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)',
              'public.hr_clock_state(uuid)',
              'public.hr_punch_correct(uuid[],jsonb,text)',
              'public.hr_punch_void(uuid,text)',
              'public.hr_punch_register(jsonb,jsonb)']) f) z
   where why is not null;
  ok       := (v_bad = '[]'::jsonb);
  severity := 'blocking';
  detail   := jsonb_build_object('violations', v_bad,
                'why', 'TD-1: the five client RPCs reach the caller through auth.uid(). anon gets nothing.');
  return next;

  ---------------------------------------------------------------- 8. the kiosk doors ARE anon-reachable
  -- decision 7: the OPPOSITE polarity of check 7, on purpose.
  check_key := 'kiosk_doors_anon_reachable';
  select coalesce(jsonb_agg(f), '[]'::jsonb) into v_bad
    from unnest(array[
      'public.hr_kiosk_claim_pairing(text,text)',
      'public.hr_kiosk_punch(text,text,text,timestamptz,text,uuid,jsonb,jsonb)',
      'public.hr_kiosk_authenticate(uuid,text)',
      'public.hr_kiosk_session_open(text,text,text)']) f
   where to_regprocedure(f) is null
      or not has_function_privilege('anon', to_regprocedure(f), 'EXECUTE');
  ok       := (v_bad = '[]'::jsonb);
  severity := 'blocking';
  detail   := jsonb_build_object('unreachable', v_bad,
                'why', 'SPEC-ACCESS 6.3: the token IS the authorization. A kiosk tablet has no '
                    || 'auth.uid(); over-tightening here bricks every wall clock, which is weighed '
                    || 'exactly as heavily as a leak.');
  return next;

  ---------------------------------------------------------------- 9. the writer is a hardened definer
  check_key := 'punch_record_hardened';
  select coalesce(jsonb_agg(jsonb_build_object('fn', n.nspname||'.'||p.proname,
                                               'secdef', p.prosecdef,
                                               'search_path_set', p.proconfig is not null)), '[]'::jsonb)
    into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and p.proname in ('punch_record','punch_correct','punch_void','clock_state','punch_register')
     and (not p.prosecdef
          or p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
  ok       := (v_bad = '[]'::jsonb);
  severity := 'blocking';
  detail   := jsonb_build_object('violations', v_bad,
                'why', 'A SECURITY DEFINER without a pinned search_path is a privilege-escalation door.');
  return next;
end
$$;

comment on function hr.punch_write_path_conformance() is
  'L3-80 / SPEC-DATA-MODEL 18.5: the punch write-path conformance gate. RLS does NOT prevent a client-direct insert into hr.punch; this is what does. Nine blocking checks.';

-- decision 6: the PostgREST projection the CI script calls.
create or replace function public.__hr_punch_write_path_conformance()
returns table (check_key text, ok boolean, severity text, detail jsonb)
language sql
stable
security definer
set search_path to 'public', 'hr'
as $$
  select * from hr.punch_write_path_conformance();
$$;

revoke all on function public.__hr_punch_write_path_conformance() from public, anon;
grant execute on function public.__hr_punch_write_path_conformance() to authenticated, service_role;

-- decision 5: the file refuses to install red.
do $$
declare v_fail text;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='hr' and p.proname='punch_write_path_conformance') then
    raise exception 'hr_l3_07: hr.punch_write_path_conformance did not land';
  end if;
  select string_agg(check_key, ', ') into v_fail
    from hr.punch_write_path_conformance() where not ok;
  if v_fail is not null then
    raise exception 'hr_l3_07: the conformance gate is RED at install time: %', v_fail;
  end if;
end $$;
