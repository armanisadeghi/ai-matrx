-- FIX-7B — A LIST OF PEOPLE NAMES ONLY PEOPLE IN YOUR OWN ORGANIZATIONS.
--
-- Run:  <psql> -f scripts/campaign-tests/fix7b_people_green.sql     (the MAIN database)
--
-- Every asserted clause runs FROM THE SEAT — `role authenticated`, carrying a real person's
-- JWT claims — because running as the connected superuser proves nothing: BYPASSRLS makes
-- every policy in this file invisible. SEAT-RECIPE.md, PART 0, verbatim.
--
-- The two people are the campaign's own test identities:
--   admin@admin.com  87a6e699-3622-4869-8843-d0867456c0dd  (a super admin)
--   test@test.com    4060701e-706a-4c76-b3ca-0bbc69fa5a14  (an ordinary member)
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'fix7b_people_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';

do $$
declare
  c_test  text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated","email":"test@test.com"}';
  c_admin text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","email":"admin@admin.com"}';
  k_system uuid := '39c38960-d30c-4840-b0c1-c9960de95582';   -- the platform's own tenant
  v_boss text := current_user;
  n int;
  n_sys int;
  n_stranger int;
  v_bad text;
begin
  perform set_config('app.actor_system', 'campaign-test/fix7b_people_green', true);

  -- ── PART 0 — take the seat and PROVE it ────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_test, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'crm.party'::regclass),
                 'member') then
    raise exception '0: this seat owns crm.party, so every wall would open on its first line';
  end if;
  raise notice 'PART 0 PASSED — seated as % carrying test@test.com', current_user;

  -- ── PART 1 — she reads no person from an organization she is not in ────────────────────
  select count(*) into n_stranger
    from crm.party p
   where not exists (select 1 from iam.organization_member om
                      where om.organization_id = p.organization_id
                        and om.user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14')
     and p.created_by is distinct from '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  if n_stranger > 0 then
    raise exception '1a: she reads % person row(s) from organizations she is in none of and did not create', n_stranger;
  end if;

  select count(*) into n_sys from crm.party where organization_id = k_system;
  if n_sys > 0 then
    raise exception '1b: she reads % person row(s) belonging to the platform''s own tenant', n_sys;
  end if;

  select count(*) into n_sys from crm.contact_medium cm
   where exists (select 1 from crm.party_contact_point pcp
                  where pcp.medium_id = cm.id and pcp.organization_id = k_system);
  if n_sys > 0 then
    raise exception '1c: she reads % email address(es) or phone number(s) belonging to the platform''s own tenant', n_sys;
  end if;
  raise notice 'PART 1 PASSED — no person, email or phone from an organization she is not in';

  -- ── PART 2 — and she is not simply refused everything: her own organization still reads ─
  -- The control clause. A wall that closes the product is not a wall, it is an outage.
  select count(*) into n
    from crm.party p
   where exists (select 1 from iam.organization_member om
                  where om.organization_id = p.organization_id
                    and om.user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14');
  if n = 0 then
    raise exception '2: she reads NOTHING at all — the wall closed the product instead of the leak';
  end if;
  raise notice 'PART 2 PASSED — she still reads % person row(s) in organizations she belongs to', n;

  -- ── PART 3 — the same from the other seat, for the same organization ───────────────────
  perform set_config('request.jwt.claims', c_admin, true);
  select count(*) into n from crm.party
   where organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  if n = 0 then
    raise exception '3: admin reads none of his own Workspace''s people';
  end if;
  raise notice 'PART 3 PASSED — admin reads % person row(s) in his own Workspace', n;

  -- ── PART 4 — the censuses, read as the boss (no client may call them) ──────────────────
  perform set_config('role', v_boss, true);
  select count(*) into n from iam.people_lists_a_non_member_can_read();
  if n > 0 then
    select string_agg(relation || ' (' || policy_name || ')', ', ')
      into v_bad from iam.people_lists_a_non_member_can_read();
    raise exception '4a: % people list(s) a non-member can read: %', n, v_bad;
  end if;
  select count(*) into n from iam.people_shaped_relations_with_no_verdict();
  if n > 0 then
    select string_agg(relation, ', ') into v_bad from iam.people_shaped_relations_with_no_verdict();
    raise exception '4b: % people-shaped relation(s) nobody has ruled on: %', n, v_bad;
  end if;

  -- and the predicate must still FIND the arm somewhere, or it is measuring nothing
  select count(*) into n
    from pg_policy p
   where p.polcmd in ('r','*')
     and iam.policy_carries_a_plain_system_org_arm(pg_get_expr(p.polqual, p.polrelid));
  if n = 0 then
    raise exception '4c: the predicate finds the §6e arm on NO policy at all, so it reads nothing';
  end if;
  raise notice 'PART 4 PASSED — both censuses zero, and the predicate still finds the arm on % policies', n;

  raise notice 'ALL PARTS PASSED (0, 1a-1c, 2, 3, 4a-4c)';
end $$;

rollback;
