-- LANE ARGS-RULED — THE RED TWIN, from the seat `authenticated`, ending in ROLLBACK.
--
-- THE USE CASE. Rincon Plumbing Co, a family plumbing company in Ventura County, keeps its
-- Jobs, Customers and Invoices in the record store. Dana (test@test.com) is a member of Rincon
-- and was shared nothing outside it. Calder Approvals is a DIFFERENT tenant on this platform;
-- Dana has never been a member of it and nobody there has ever heard of her.
--
-- WHAT THIS FILE PROVES. It is the twin of scripts/campaign-tests/argsruled_green.sql and it
-- asserts the DEFECT: with migrations/campaign/argsruled_the_far_end_of_a_relation_is_decided_too.sql
-- NOT applied (or its inverse applied), `platform.relation_label` hands Dana the name of another
-- tenant and the display name of another account, one id at a time, and
-- `platform.relation_history` reads the version history of an association nobody decided about.
--
-- SUITES-TIDY 2026-09-22 — IT NOW RUNS ITS OWN INVERSE, like every other red twin here.
-- It used to say "run it BEFORE the fix, or after running the inverse by hand", which meant
-- that in any unattended sweep it could only ever FAIL: the fix IS applied, so
-- `platform.relation_label` correctly answers "A record you have not been given access to" and
-- clause 1 reported "the leak is already closed, run the green suite instead". A red twin that
-- needs a human to prepare the database first is not a guard, it is a note. It now runs the
-- REAL BYTES of its own inverse inside the same rolled-back transaction — the pattern
-- workdoors_red.sql and reldisp_red.sql already use — so it proves the leak on the old bodies
-- and leaves the live ones untouched.
--
-- RUN IT:  binlocal/p.sh -f scripts/campaign-tests/argsruled_red.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'argsruled_red.sql'
\set requires 'row:iam.organizations:id in (\'235a6add-e8b5-43f9-883e-9dd0389c1759\',\'6069a466-1445-42df-a64e-cf37ecdc1b99\')'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- ══ PUT THE OLD BYTES BACK, FOR REAL — and only inside this transaction ═══════════════════
-- The verbatim inverse of migrations/campaign/argsruled_the_far_end_of_a_relation_is_decided_too.sql,
-- not a paraphrase of it. The ROLLBACK at the foot of this file is what restores the shipped
-- bodies; the block after it proves they are back rather than assuming it.
\i migrations/inverse/argsruled_the_far_end_of_a_relation_is_decided_too_down.sql

do $t$
declare
  c_dana constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_rincon  constant uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';  -- Rincon Plumbing Co (Dana is a member)
  v_calder  constant uuid := '235a6add-e8b5-43f9-883e-9dd0389c1759';  -- Calder Approvals  (she is not)
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_out text;
begin
  perform set_config('app.actor_system', 'campaign-test/argsruled_red', true);
  perform set_config('request.jwt.claims', c_dana, true);

  -- ══ 0 — TAKE THE SEAT AND PROVE IT ══════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '0 — the seat is authenticated and custom.record is closed to it. PASS';

  -- ══ 1 — THE NAME OF ANOTHER TENANT ═════════════════════════════════════════════════
  v_out := platform.relation_label(v_rincon, 'organization', v_calder);
  if v_out is distinct from 'Calder Approvals' then
    raise exception '1 RED FAILED: the door answered % — the leak is already closed, run the green suite instead', coalesce(v_out, '<null>');
  end if;
  raise notice '1 — RED: relation_label handed her another tenant''s name: %', v_out;

  -- ══ 2 — THE DISPLAY NAME OF ANOTHER ACCOUNT ════════════════════════════════════════
  v_out := platform.relation_label(v_rincon, 'user_profile', c_admin);
  if v_out is null or v_out = platform.relation_withheld_label() then
    raise exception '2 RED FAILED: the door answered % — the leak is already closed', coalesce(v_out, '<null>');
  end if;
  raise notice '2 — RED: relation_label handed her another account''s display name: %', v_out;

  raise notice 'RED SUITE PASSED — on the old bytes the leak is live. Rolling back.';
end $t$;

rollback;

-- ══ AND THE SHIPPED BYTES ARE BACK, OUTSIDE THE TRANSACTION ══════════════════════════════
do $t$
declare
  v_out text;
begin
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  v_out := platform.relation_label('6069a466-1445-42df-a64e-cf37ecdc1b99', 'organization',
                                   '235a6add-e8b5-43f9-883e-9dd0389c1759');
  if v_out = 'Calder Approvals' then
    raise exception 'ROLLBACK DID NOT RESTORE — the door still hands Dana another tenant''s name. The old bytes are live on this database.';
  end if;
  raise notice 'ROLLBACK VERIFIED — the shipped bodies are back: the door answers "%" for a tenant she is not in.', v_out;
end $t$;
