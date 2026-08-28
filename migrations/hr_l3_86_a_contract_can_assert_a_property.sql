-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 CHECK 31 PROTECTS BODIES, NOT PROPERTIES — AND THE CONVERSION IT IS ABOUT TO PROTECT IS A
--    PROPERTY CHANGE. Found while writing C4's INVOKER→DEFINER conversion note, and fixed BEFORE
--    that conversion rather than after, because the hole would otherwise open on day one.
--
-- `hr.function_contract` asserts substrings that must be present or absent in `prosrc`. `prosecdef`
-- is not text in `prosrc` — it is a column on `pg_proc`. So today a lane could convert a workflow
-- door to `SECURITY DEFINER`, and a later re-emit could flip it straight back to `SECURITY INVOKER`,
-- and check 31 would stay GREEN over it: every required substring would still be in the body. The
-- door would silently return to executing as the caller, which is precisely the state the
-- conversion exists to end, and the campaign's remaining 53 revokes would be built on it.
--
-- Authority: coordinator ruling (take the gap now, before C4's conversion; schema column over a
-- bolt-on clause); hr_l3_79's check 31; the conversion note at
-- /projects/hr-domain/readiness/WF-INVOKER-CONVERSION.md.
--
-- Applied live as `hr_l3_86_a_contract_can_assert_a_property`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. A COLUMN, NOT A CLAUSE, BECAUSE THE CONTRACT ROW IS WHERE THE NEXT READER LOOKS. A bolt-on
--    conformance clause would live in the gate's body and be invisible to anyone reading the row
--    that supposedly protects their function. `must_be_definer` sits beside `must_contain` and
--    reads as what it is: another thing that must remain true.
-- 2. NULLABLE, AND NULL MEANS NOT ASSERTED — the property is opt-in exactly like the contract
--    itself. A row that says nothing about volatility must keep saying nothing, or adding the
--    column would retroactively make an assertion nobody wrote about all 29 existing rows.
-- 3. `false` IS SUPPORTED AND MEANS "MUST BE INVOKER", not "don't care". A nullable boolean has
--    three states and pretending it has two is how the third becomes a silent default. It is not
--    used today — no contract needs a function to stay INVOKER — but the semantics are defined
--    here rather than invented by whoever first needs it.
-- 4. THE SEED IS DERIVED FROM `pg_proc`, NOT LISTED (D13). Every contract row whose function is a
--    definer TODAY gets `must_be_definer = true`; the rest stay null. That locks in the property as
--    it actually is, rather than as anyone remembers it — and it means the 28 rows currently on
--    definer functions are protected without anyone enumerating them.
-- 5. THE VIOLATION NAMES THE PROPERTY AND BOTH SIDES OF IT. `clause = 'must_be_definer'` with the
--    expected and actual security mode in the token, because "contract broken" on a property tells
--    a reader nothing about which way it broke.

begin;

alter table hr.function_contract
  add column if not exists must_be_definer boolean;

comment on column hr.function_contract.must_be_definer is
  'Asserts the function''s SECURITY mode, which is a pg_proc PROPERTY and therefore invisible to '
  'the must_contain / must_not_contain substring tests. true = must be SECURITY DEFINER; '
  'false = must be SECURITY INVOKER; NULL = not asserted (the default, so adding this column made '
  'no claim about any existing row). Added hr_l3_86 because a converted door could otherwise be '
  'flipped back to INVOKER by a re-emit with check 31 staying green.';

-- ── the evaluator learns the property ───────────────────────────────────────────────────────
create or replace function hr.function_contracts_broken()
returns table(qname text, home_migration text, clause text, missing_or_present text, reason text)
language sql
stable
security definer
set search_path = hr, public
as $fn$
  select c.schema_name || '.' || c.function_name, c.home_migration, 'must_contain', t.tok, c.reason
    from hr.function_contract c
    join lateral unnest(c.must_contain) t(tok) on true
   where c.is_active
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = c.schema_name and p.proname = c.function_name
                        and position(t.tok in p.prosrc) > 0)
  union all
  select c.schema_name || '.' || c.function_name, c.home_migration, 'must_not_contain', t.tok, c.reason
    from hr.function_contract c
    join lateral unnest(c.must_not_contain) t(tok) on true
   where c.is_active
     and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = c.schema_name and p.proname = c.function_name
                    and position(t.tok in p.prosrc) > 0)
  union all
  -- hr_l3_86: the SECURITY mode, which is a property and not text in prosrc (decisions 1-3, 5)
  select c.schema_name || '.' || c.function_name, c.home_migration, 'must_be_definer',
         'expected ' || case when c.must_be_definer then 'SECURITY DEFINER' else 'SECURITY INVOKER' end
                     || ', found ' || case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end,
         c.reason
    from hr.function_contract c
    join pg_proc p on p.proname = c.function_name
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = c.schema_name
   where c.is_active
     and c.must_be_definer is not null          -- decision 2: NULL asserts nothing
     and p.prosecdef is distinct from c.must_be_definer
  union all
  select c.schema_name || '.' || c.function_name, c.home_migration, 'function_missing', '', c.reason
    from hr.function_contract c
   where c.is_active
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = c.schema_name and p.proname = c.function_name)
   order by 1, 3, 4;
$fn$;

revoke all on function hr.function_contracts_broken() from public;
revoke all on function hr.function_contracts_broken() from anon;
revoke all on function hr.function_contracts_broken() from authenticated;

-- ── decision 4: seed the property as it actually is, derived ─────────────────────────────────
update hr.function_contract c
   set must_be_definer = true
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = c.schema_name
   and p.proname = c.function_name
   and p.prosecdef
   and c.is_active
   and c.must_be_definer is null;

-- ── the column's own meaning, declared where the next reader looks ───────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, must_be_definer, reason)
values
  ('hr','function_contracts_broken','hr_l3_86',
   array['must_be_definer','prosecdef'],
   '{}',
   true,
   'Check 31 must keep asserting the SECURITY mode, not only body substrings. prosecdef is a '
   || 'pg_proc PROPERTY invisible to must_contain, so without this arm a converted SECURITY DEFINER '
   || 'door could be flipped back to INVOKER by a re-emit while check 31 stayed green — which would '
   || 'hole C4''s INVOKER-to-DEFINER conversion on day one. NULL in must_be_definer asserts nothing; '
   || 'true requires DEFINER; false requires INVOKER.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain,
      must_be_definer = excluded.must_be_definer,
      reason = excluded.reason,
      is_active = true;

do $chk$
declare v_seeded integer; v_null integer; v_broken integer; v_31 boolean;
begin
  select count(*) into v_seeded from hr.function_contract where is_active and must_be_definer;
  select count(*) into v_null   from hr.function_contract where is_active and must_be_definer is null;
  select count(*) into v_broken from hr.function_contracts_broken();
  select ok into v_31 from hr.punch_write_path_conformance() where check_key = 'function_contracts_hold';

  if v_seeded = 0 then
    raise exception 'hr_l3_86: nothing was seeded — the derived update did not land';
  end if;
  if v_broken > 0 then
    raise exception 'hr_l3_86: % contracts broken immediately after seeding: %', v_broken,
      (select string_agg(qname || ' ' || clause, '; ') from hr.function_contracts_broken());
  end if;
  if v_31 is null or not v_31 then
    raise exception 'hr_l3_86: check 31 is failing';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_86: another conformance check is failing';
  end if;
  raise notice 'hr_l3_86: must_be_definer seeded on % contracts, % left unasserted', v_seeded, v_null;
end
$chk$;

commit;
