-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 THE CLASS L1 FOUND, MADE STRUCTURAL. A `SECURITY DEFINER` function created without an explicit
-- revoke carries the implicit PUBLIC execute grant, so it runs AS ITS OWNER for anyone who can
-- reach it. L1 found four of its own — `_wf_change_digest`, `_wf_pay_change_digest`,
-- `_wf_row_summary` and its repair door — each returning a home address, a salary or a leave
-- request with NO permission check of its own BY DESIGN, because `hr._wf_display` gates once for
-- all of them. That division of labour is correct while only that caller can reach them, and a hole
-- the moment anything else can. `hr` being absent from `pgrst.db_schemas` is a DEPLOYMENT FACT, not
-- a property of the function.
--
-- MEASURED ACROSS THE WHOLE SCHEMA, the four were the visible edge of a much larger class:
--
--   297  SECURITY DEFINER functions in `hr`
--   202  executable by `authenticated`
--   101  executable by `anon`
--    99  with a NULL ACL — never revoked at all, carrying the implicit PUBLIC grant
--    95  properly revoked
--
-- THE DOOR SET IS DERIVED, AND IT COMES OUT EMPTY — which is the finding, not an assumption.
-- A function in `hr` needs a client-role grant only if a client role can invoke it directly. Three
-- ways that could be true, all measured live and all zero:
--   * PostgREST exposure — check 1 (`pgrst_hr_not_exposed`) already asserts `hr` is not exposed;
--   * an RLS policy expression, which is evaluated as the QUERYING role — 796 policies on `hr`
--     tables, **zero** naming an `hr.` function;
--   * a column DEFAULT or CHECK constraint, likewise evaluated as the writing role — zero each.
-- So nothing in `hr` requires PUBLIC/anon/authenticated EXECUTE, and the check re-derives all three
-- on every run rather than trusting today's measurement (decision 2).
--
-- Authority: coordinator ruling (L1's self-audit, hr_l1_46/47); D13 (no hard-coded per-function
-- lists beyond what a registry derives); hr_l3_11's revoke-from-both precedent.
--
-- Applied live as `hr_l3_81_definer_helpers_are_not_public`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. 🚨 THE CHECK FLAGS, IT NEVER REVOKES, AND THAT IS THE RULING NOT A CONVENIENCE. Revoking 202
--    grants as a gate side effect would be an unproven mass privilege change fired by a read. L1's
--    property — that revoking breaks nothing because the public wrapper is itself SECURITY DEFINER
--    and runs as owner — is provable ONE DOOR AT A TIME, through the door, which is what hr_l1_46/47
--    did. This migration grants nothing and revokes nothing.
-- 2. THE EXEMPTIONS ARE RE-DERIVED EVERY RUN, NOT SNAPSHOTTED. If a lane later writes an RLS policy
--    or a column default that calls an `hr` function, that function legitimately NEEDS the grant and
--    must stop being flagged the moment the policy exists. Deriving live is what makes the check
--    survive a change nobody tells it about — the same lesson as check 31.
-- 3. THE 202 RIDE A DATED BASELINE, BECAUSE A GATE THAT IS RED ON ARRIVAL PROTECTS NOTHING. Marking
--    them blocking today would fail every release until an unrelated 202-function revoke campaign
--    finishes, and the first thing anyone would do is disable the check. The baseline is DATA in
--    `hr.definer_grant_baseline` (D13), so it shrinks by itself: a function that gets revoked simply
--    stops violating and its baseline row goes inert. The debt is printed on every run, so it
--    cannot quietly become permanent — the failure mode of check 26's allowlist, which this lane
--    watched get deleted rather than re-dated once the source was fixed.
-- 5. 🚨 THE EXEMPTION IS A CATALOG DEPENDENCY, AFTER TEXT MATCHING FAILED TWICE IN ONE SITTING.
--    First cut: `position(proname in blob) > 0` — three functions silently exempted, `leave_enroll`
--    twice because a policy names the TABLE `hr.leave_enrollment`, of which the function name is a
--    PREFIX. That is L1's own prefix bug, reappearing in my code. Second cut: identifier-boundary
--    matching on the qualified `hr.<name>` — which FAILED its falsification, because `pg_get_expr`
--    renders a policy expression UNQUALIFIED when the schema is in `search_path`, so the qualified
--    form is simply not in the text to find. Both cuts were wrong in the DANGEROUS direction, where
--    a genuinely public definer function escapes the check.
--    The right source was never text: Postgres records a pg_depend row from every policy, CHECK
--    constraint and column default to each function it calls — 13,522 such rows live. Exact,
--    search_path-independent, prefix-proof, and it needs no matcher at all. Measured through it,
--    ZERO `hr` functions are depended on by any policy, constraint or default, which is the same
--    conclusion the text scan reached by a method that would have broken the moment it mattered.
-- 4. `anon` AND `authenticated` AND `PUBLIC` ARE ALL TESTED, because they fail differently.
--    `has_function_privilege` answers TRUE for a role that inherits a PUBLIC grant, so the ACL-null
--    case (99 functions) is caught by the role test; the explicit-grant case is caught the same way.
--    Testing only `proacl is null` would have missed the 103 functions with a real grant written in.

begin;

create table if not exists hr.definer_grant_baseline (
  id             uuid primary key default gen_random_uuid(),
  function_name  text        not null,
  identity_args  text        not null,
  noted_on       date        not null default current_date,
  reason         text        not null,
  unique (function_name, identity_args)
);

alter table hr.definer_grant_baseline enable row level security;
revoke all on table hr.definer_grant_baseline from public;
revoke all on table hr.definer_grant_baseline from anon;
revoke all on table hr.definer_grant_baseline from authenticated;

comment on table hr.definer_grant_baseline is
  'SECURITY DEFINER functions in hr that already carried a client-role EXECUTE grant when check 33 '
  'shipped. Dated debt, not an exemption in principle: a function that is revoked stops violating '
  'and its row goes inert. The remaining count is printed by check 33 on every run (hr_l3_81).';

-- ── the diagnostic (decision 2: exemptions re-derived, never snapshotted) ────────────────────
create or replace function hr.definer_functions_client_reachable()
returns table(qname text, identity_args text, anon_can boolean, authenticated_can boolean,
              acl_is_null boolean, baselined boolean)
language sql
stable
security definer
set search_path = hr, public
as $fn$
  select n.nspname || '.' || p.proname,
         pg_get_function_identity_arguments(p.oid),
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         p.proacl is null,
         exists (select 1 from hr.definer_grant_baseline b
                  where b.function_name = p.proname
                    and b.identity_args = pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     -- DERIVED EXEMPTION, FROM THE CATALOG NOT FROM TEXT (decision 5). A client role evaluates a
     -- function itself only where an RLS policy, a CHECK constraint or a column DEFAULT calls it,
     -- and Postgres records every one of those as a pg_depend row. Exact, search_path-independent,
     -- and immune to the name-matching traps that text scanning kept walking into.
     and not exists (
       select 1 from pg_depend d
        where d.refclassid = 'pg_proc'::regclass
          and d.refobjid = p.oid
          and d.classid in ('pg_policy'::regclass, 'pg_constraint'::regclass, 'pg_attrdef'::regclass))
   order by 1, 2;
$fn$;

revoke all on function hr.definer_functions_client_reachable() from public;
revoke all on function hr.definer_functions_client_reachable() from anon;

-- ── decision 3: today's debt, dated ──────────────────────────────────────────────────────────
insert into hr.definer_grant_baseline (function_name, identity_args, reason)
select split_part(t.qname, '.', 2), t.identity_args,
       'Carried a client-role EXECUTE grant when check 33 shipped (hr_l3_81). Revoking is a '
       || 'migration with a proof through the public door, never a gate side effect.'
  from hr.definer_functions_client_reachable() t
on conflict (function_name, identity_args) do nothing;

-- ── check 33 ────────────────────────────────────────────────────────────────────────────────
do $mig$
declare
  v_def text := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  v_new text;
begin
  v_def := regexp_replace(v_def, E'\\n  -{10,} 33\\. .*(?=\\nend\\n)', '', '');

  v_new := E'\n'
  || E'  ---------------------------------------------------------------- 33. definer helpers are not public\n'
  || E'  check_key := ''definer_helpers_are_not_client_reachable'';\n'
  || E'  select coalesce(jsonb_agg(jsonb_build_object(\n'
  || E'           ''function'', t.qname, ''args'', t.identity_args,\n'
  || E'           ''anon'', t.anon_can, ''authenticated'', t.authenticated_can,\n'
  || E'           ''never_revoked'', t.acl_is_null) order by t.qname, t.identity_args), ''[]''::jsonb)\n'
  || E'    into v_bad\n'
  || E'    from hr.definer_functions_client_reachable() t\n'
  || E'   where not t.baselined;\n'
  || E'  ok       := (v_bad = ''[]''::jsonb);\n'
  || E'  severity := ''blocking'';\n'
  || E'  detail   := jsonb_build_object(\n'
  || E'    ''violations'', v_bad,\n'
  || E'    ''baselined_debt_remaining'', (select count(*) from hr.definer_functions_client_reachable() t\n'
  || E'                                    where t.baselined),\n'
  || E'    ''definer_functions_total'', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n'
  || E'                                   where n.nspname = ''hr'' and p.prosecdef),\n'
  || E'    ''why'', ''A SECURITY DEFINER function created without an explicit revoke carries the ''\n'
  || E'      || ''implicit PUBLIC execute grant, so it runs AS ITS OWNER for anyone who can reach it. ''\n'
  || E'      || ''L1 found four of its own returning a home address, a salary and a leave request with ''\n'
  || E'      || ''no permission check of their own BY DESIGN, because one caller gates for all of ''\n'
  || E'      || ''them -- correct while only that caller can reach them, a hole the moment anything ''\n'
  || E'      || ''else can. hr being absent from pgrst.db_schemas is a DEPLOYMENT FACT, not a ''\n'
  || E'      || ''property of the function. The door set is DERIVED and comes out empty: check 1 ''\n'
  || E'      || ''asserts hr is not exposed, and no RLS policy, column default or CHECK constraint on ''\n'
  || E'      || ''an hr table names an hr function -- those are the only places a client role would ''\n'
  || E'      || ''evaluate one itself, and all three are re-derived on every run so a future policy ''\n'
  || E'      || ''exempts its function automatically. This check FLAGS and never revokes: revoking is ''\n'
  || E'      || ''a migration with a proof through the public door, one door at a time.'');\n'
  || E'  return next;\n';

  v_def := regexp_replace(v_def, E'(?=\\nend\\n)', v_new, '');
  execute v_def;
end
$mig$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values
  ('hr','definer_functions_client_reachable','hr_l3_81',
   array['pg_policy','pg_attrdef','pg_constraint','has_function_privilege'],
   '{}',
   'Check 33''s exemptions must stay DERIVED. The three catalog sweeps are how a function used by a '
   || 'future RLS policy, column default or CHECK constraint stops being flagged automatically; '
   || 'replacing them with a snapshot or a name list re-creates the staleness the check exists to '
   || 'avoid, and dropping has_function_privilege would miss the 99 never-revoked ACL-null cases.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain, reason = excluded.reason, is_active = true;

do $chk$
declare v_n integer; v_33 boolean; v_debt integer;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  select ok into v_33 from hr.punch_write_path_conformance()
   where check_key = 'definer_helpers_are_not_client_reachable';
  select count(*) into v_debt from hr.definer_functions_client_reachable() t where t.baselined;

  if v_n <> 33 then
    raise exception 'hr_l3_81: expected 33 checks, found %', v_n;
  end if;
  if v_33 is null or not v_33 then
    raise exception 'hr_l3_81: check 33 missing or failing on arrival';
  end if;
  if v_debt = 0 then
    raise exception 'hr_l3_81: the baseline is empty — the seed did not land and the check is inert';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_81: another conformance check is failing';
  end if;
  raise notice 'hr_l3_81: % baselined definer grants remain', v_debt;
end
$chk$;

commit;
