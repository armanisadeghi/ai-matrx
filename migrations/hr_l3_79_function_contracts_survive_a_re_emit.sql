-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 THE INVARIANT: an edit applied to a shared function must not be silently discardable by a
--    later re-emit. Lived twice now — hr_l3_69's retirement of the existence-disclosure switch was
--    applied, ledgered, committed to `origin/main`, and then ERASED IN THE DATABASE when another
--    lane re-created `hr.leave_calendar` from its own source. The ledger row still said "applied".
--    The file still described the end state. Nothing anywhere said the fix was gone.
--
-- MECHANISM (a) — derive the expected body from the last migration that defines it — WAS MEASURED
-- AND IS INFEASIBLE HERE, which is worth recording so nobody re-proposes it. Of 100 `hr_l3_*`
-- migrations, **69 rewrite functions with `pg_get_functiondef` + surgical `replace()`** rather than
-- emitting a literal body. For those there IS no expected body in the corpus to compare against:
-- the migration describes a TRANSFORM, and the result depends on whatever the body was at the time.
-- A corpus-derived comparison would be exact for the 31 and blind for the 69, which is the wrong
-- half. (The conformance function also runs inside Postgres and cannot read the migration files at
-- all — mechanism (a) could only ever live in the TypeScript gate, splitting the invariant across
-- two runners.)
--
-- SO: A CONTRACT REGISTRY, WHICH IS MECHANISM (b) TURNED INSIDE OUT. Rather than recording WHO
-- owns a body and hoping the marker survives the re-emit that erases the body, each protected
-- function declares WHAT MUST REMAIN TRUE of it — substrings that must be present and substrings
-- that must be absent — as ROWS in `hr.function_contract`. A re-emit that discards a fix breaks the
-- contract by construction, because the fix IS the thing the contract names. A home-migration
-- marker in a comment would have been erased by the very same re-emit it was meant to detect.
--
-- Registry-derived per D13: adding protection is an INSERT, not a code change, and check 31 has no
-- per-function list in it. Any lane can protect its own edit without touching this lane's gate.
--
-- Authority: coordinator ruling (check 31, mechanism is the builder's design call); D13
-- (no hard-coded per-function lists beyond what a registry derives); hr_l3_69/77's lived history.
--
-- Applied live as `hr_l3_79_function_contracts_survive_a_re_emit`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE CONTRACT NAMES THE FIX, NOT THE AUTHOR. "This body must still contain `v_case_stmt` and
--    must no longer contain the struck knob's key" survives a re-emit as a DETECTOR precisely
--    because a re-emit destroys it as a FACT. A `-- @home: hr_l3_69` marker would have been wiped
--    by the same overwrite, leaving the gate green over the loss — the failure mode this replaces.
-- 2. 🚨 WHAT THIS CANNOT COVER, STATED IN THE CHECK'S OWN OUTPUT RATHER THAN DISCOVERED LATER:
--    (i) a function with no contract row is invisible to it — protection is opt-in, so the check
--    reports its own coverage (`functions_under_contract` / `hr_functions_total`) on every run;
--    (ii) "shared by more than one lane" CANNOT be derived inside the database — there is no lane
--    attribution on `pg_proc`, and the migration corpus that would show it is unreadable from SQL.
--    So the contract set is a judgement, seeded here with the cross-lane functions this lane has
--    edited, and it will under-cover until other lanes declare theirs;
--    (iii) substring presence cannot see a semantic change that preserves the strings.
--    None of these is an argument against the check: it converts "a fix can vanish silently" into
--    "a DECLARED fix cannot vanish silently", which is the whole of what was asked.
-- 3. THE CONTRACT STRINGS LIVE IN A TABLE, WHICH KILLS THE SELF-MATCH TRAP OUTRIGHT. Checks 27 and
--    30 must concatenate their own tokens (`'case_existence_visible' || '_to_manager'`) or the
--    conformance function matches its own body. Contract rows are DATA, never part of any
--    function's `prosrc`, so they are stored plainly and cannot self-match. This lane has hit that
--    trap five times; the registry removes the whole class for anything expressed as a contract.
-- 4. OVERLAP WITH CHECK 30 IS DELIBERATE AND BOUNDED. Check 30 asserts prosrc facts AND non-prosrc
--    facts (the struck knob row is gone; the survivor's entry is seeded). Only the prosrc half is
--    expressible as a contract, so 30 keeps the other half and stays. New protections go in the
--    registry; 30 is not re-implemented here.

begin;

create table if not exists hr.function_contract (
  id               uuid primary key default gen_random_uuid(),
  schema_name      text        not null,
  function_name    text        not null,
  home_migration   text        not null,
  must_contain     text[]      not null default '{}',
  must_not_contain text[]      not null default '{}',
  reason           text        not null,
  declared_at      timestamptz not null default now(),
  is_active        boolean     not null default true,
  unique (schema_name, function_name, home_migration)
);

-- machinery, not tenant data: no organization_id (nothing here belongs to an employer), read only
-- through SECURITY DEFINER gate functions, and no direct client reach.
alter table hr.function_contract enable row level security;
revoke all on table hr.function_contract from public;
revoke all on table hr.function_contract from anon;
revoke all on table hr.function_contract from authenticated;

comment on table hr.function_contract is
  'What must remain true of a shared function''s body after any lane re-emits it. Read by '
  'hr.punch_write_path_conformance check 31. Protection is an INSERT here, never a code change '
  '(D13). A contract names the FIX, not the author, so a re-emit that discards the fix breaks the '
  'contract by construction (hr_l3_79).';

-- ── the seed: this lane's cross-lane edits, each naming what its fix left behind ─────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values
  ('hr','leave_calendar','hr_l3_69',
   array['v_case_stmt'],
   array['case_existence_visible' || '_to_manager', 'This person has an approved leave'],
   'SPEC-LEAVE 9.6: one switch. The calendar must resolve the existence statement through '
   || 'hr.employees.disclosure_existence_statements, must not read the struck knob, and must not '
   || 'carry the sentence as a literal. THIS CONTRACT EXISTS BECAUSE THE RE-EMIT ACTUALLY HAPPENED.'),
  ('hr','employee_by_party','hr_l3_66',
   array['_employee_display_name'],
   array['mgr.' || 'display_name'],
   'hr_l3_66: the manager name goes through the one suppression rule. A raw projection here leaked '
   || 'an opted-out manager''s full name to any peer through the CRM party lookup.'),
  ('hr','_subject_display_name','hr_l3_66',
   array['_employee_display_name'],
   array['directory_opt' || '_out', '_punch' || '_capability'],
   'hr_l3_66: this is a pure delegate. Arm logic here means the rule has two bodies again, which '
   || 'is how the display-name leak was written in the first place.'),
  ('public','hr_directory_list','hr_l3_64',
   array['_employee_display_name'],
   array['mgr.' || 'display_name'],
   'hr_l3_64: the directory''s manager column must reach the name through the one rule.'),
  ('hr','clock_state','hr_l3_74',
   array['hr_employment', 'raise;'],
   array['resolve_rules(''employment'''],
   'hr_l3_74: the registered token is hr_employment, and the swallow must re-raise anything that '
   || 'is not honest degradation. Both together are what made SPEC-TIME 3.2 attestation live again '
   || 'after being dead in every organization.'),
  ('hr','_subject_jurisdiction_key','hr_l3_74',
   array['hr_leave_enrollment', 'hr_employment'],
   '{}',
   'hr_l3_71/74: the COMP-of-employment derivation set. Losing an entry silently returns a subject '
   || 'to subject_carries_no_jurisdiction, which callers swallow.'),
  ('hr','validate_org_config','hr_l3_73',
   array['hr.location l join hr.jurisdiction'],
   '{}',
   'hr_l3_73: operating jurisdictions come from where people work. Reading only hr.establishment '
   || 'made this validator return "no violations" for every configuration in every org.'),
  ('hr','recompute_apply','hr_l3_76',
   array['period_pending'],
   '{}',
   'hr_l3_76: a week no payroll file can include must say so. Without this the envelope returns '
   || 'ok:true over unpayable hours.'),
  ('hr','_recompute_workweek_start','hr_l3_76',
   array['DECLARED CONVENTION'],
   '{}',
   'hr_l3_76: one week-start rule, and the Sunday fallback is a declared convention rather than an '
   || 'accident of coalesce. Removing the declaration restores two derivations of one boundary.'),
  ('hr','stable_doors_that_write','hr_l3_78',
   array['_strip_sql_comments'],
   '{}',
   'hr_l3_78: comments cannot call anything. Without the strip, a comment naming a writer invents '
   || 'graph edges and F1 goes red on a door that calls nothing.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain,
      must_not_contain = excluded.must_not_contain,
      reason = excluded.reason,
      is_active = true;

-- ── the evaluator ───────────────────────────────────────────────────────────────────────────
create or replace function hr.function_contracts_broken()
returns table(qname text, home_migration text, clause text, missing_or_present text, reason text)
language sql
stable
security definer
set search_path = hr, public
as $fn$
  select c.schema_name || '.' || c.function_name,
         c.home_migration,
         'must_contain',
         t.tok,
         c.reason
    from hr.function_contract c
    join lateral unnest(c.must_contain) t(tok) on true
   where c.is_active
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = c.schema_name and p.proname = c.function_name
                        and position(t.tok in p.prosrc) > 0)
  union all
  select c.schema_name || '.' || c.function_name,
         c.home_migration,
         'must_not_contain',
         t.tok,
         c.reason
    from hr.function_contract c
    join lateral unnest(c.must_not_contain) t(tok) on true
   where c.is_active
     and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = c.schema_name and p.proname = c.function_name
                    and position(t.tok in p.prosrc) > 0)
  union all
  -- a contract on a function that no longer exists is also a broken contract
  select c.schema_name || '.' || c.function_name, c.home_migration, 'function_missing', '', c.reason
    from hr.function_contract c
   where c.is_active
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = c.schema_name and p.proname = c.function_name)
   order by 1, 3, 4;
$fn$;

revoke all on function hr.function_contracts_broken() from public;
revoke all on function hr.function_contracts_broken() from anon;

-- ── check 31 ────────────────────────────────────────────────────────────────────────────────
do $mig$
declare
  v_def text := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  v_new text;
begin
  v_def := regexp_replace(v_def, E'\\n  -{10,} 31\\. .*(?=\\nend\\n)', '', '');

  v_new := E'\n'
  || E'  ---------------------------------------------------------------- 31. a declared fix cannot vanish silently\n'
  || E'  check_key := ''function_contracts_hold'';\n'
  || E'  select coalesce(jsonb_agg(jsonb_build_object(\n'
  || E'           ''function'', t.qname, ''home_migration'', t.home_migration,\n'
  || E'           ''clause'', t.clause, ''token'', t.missing_or_present, ''reason'', t.reason)\n'
  || E'           order by t.qname, t.clause, t.missing_or_present), ''[]''::jsonb)\n'
  || E'    into v_bad from hr.function_contracts_broken() t;\n'
  || E'  ok       := (v_bad = ''[]''::jsonb);\n'
  || E'  severity := ''blocking'';\n'
  || E'  detail   := jsonb_build_object(\n'
  || E'    ''violations'', v_bad,\n'
  || E'    ''functions_under_contract'', (select count(distinct schema_name || ''.'' || function_name)\n'
  || E'                                     from hr.function_contract where is_active),\n'
  || E'    ''hr_functions_total'', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n'
  || E'                              where n.nspname = ''hr'' and p.prokind = ''f''),\n'
  || E'    ''coverage_note'', ''Protection is OPT-IN and this check reports its own coverage on every ''\n'
  || E'      || ''run. Three things it cannot do: a function with no contract row is invisible to it; ''\n'
  || E'      || ''"shared by more than one lane" cannot be derived inside the database (pg_proc ''\n'
  || E'      || ''carries no lane attribution and the migration corpus is unreadable from SQL), so ''\n'
  || E'      || ''the set is a judgement that under-covers until other lanes declare theirs; and ''\n'
  || E'      || ''substring presence cannot see a semantic change that preserves the strings.'',\n'
  || E'    ''why'', ''An edit applied to a shared function must not be silently discardable by a ''\n'
  || E'      || ''later re-emit. hr_l3_69 was applied, ledgered and committed, then ERASED in the ''\n'
  || E'      || ''database when another lane re-created hr.leave_calendar from its own source -- the ''\n'
  || E'      || ''ledger row still said applied and nothing said the fix was gone. Each contract ''\n'
  || E'      || ''names WHAT MUST REMAIN TRUE rather than who owns the body, because a home-migration ''\n'
  || E'      || ''marker would be wiped by the very re-emit it exists to detect, leaving the gate ''\n'
  || E'      || ''green over the loss. Adding protection is an INSERT into hr.function_contract, ''\n'
  || E'      || ''never a change to this check (D13).'');\n'
  || E'  return next;\n';

  v_def := regexp_replace(v_def, E'(?=\\nend\\n)', v_new, '');
  execute v_def;
end
$mig$;

do $chk$
declare v_n integer; v_31 boolean; v_cov integer;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  select ok into v_31 from hr.punch_write_path_conformance() where check_key = 'function_contracts_hold';
  select count(distinct schema_name || '.' || function_name) into v_cov
    from hr.function_contract where is_active;

  if v_n <> 31 then
    raise exception 'hr_l3_79: expected 31 checks, found %', v_n;
  end if;
  if v_31 is null then
    raise exception 'hr_l3_79: check 31 did not install';
  end if;
  if not v_31 then
    raise exception 'hr_l3_79: check 31 is failing — a seeded contract is already broken: %',
      (select string_agg(qname || ' ' || clause || ' ' || missing_or_present, '; ')
         from hr.function_contracts_broken());
  end if;
  if v_cov < 10 then
    raise exception 'hr_l3_79: only % functions under contract — the seed did not land', v_cov;
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_79: another conformance check is failing';
  end if;
  raise notice 'hr_l3_79: % functions under contract', v_cov;
end
$chk$;

commit;
