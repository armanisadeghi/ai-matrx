-- LANE ARGS-RULED — THE GREEN SUITE, from the seat `authenticated`, ending in ROLLBACK.
--
-- THE USE CASE. Rincon Plumbing Co, a family plumbing company in Ventura County, keeps its
-- Jobs, Customers and Invoices in the record store. Dana (test@test.com) is a member of Rincon
-- and was shared nothing outside it. Calder Approvals is a DIFFERENT tenant on this platform;
-- Dana has never been a member of it. A relation on a Rincon record may point at a row of any
-- of the 179 entity types the platform registers, and `platform.relation_label` is the one
-- function that turns that far end into words on her screen.
--
-- WHAT IT PROVES
--   0  the seat is real and `custom.record` is closed to it
--   1  the name of a tenant she is not a member of is WITHHELD, in words, never the title
--      and never the bare id  (before the fix it read "Calder Approvals")
--   2  the door did not simply start refusing everything: her OWN organization still labels
--   3  the platform's own CATALOGUE still labels — an `ai_model` row reads its name, because
--      the kernel says she may see it, and the door now asks the kernel instead of nobody
--   4  a record she may not open is withheld by the same sentence (REL-14, unchanged)
--   5  a record she MAY open still reads its title (the record arm is untouched)
--   6  the person ladder platform.knob_snapshot now asks says no for a stranger's settings
--   7  and yes for herself, so the arm refuses somebody rather than everybody
--   8  her own knob snapshot still resolves
--   9  the organization ladder context.provision_scope_dataset now asks says no for a
--      scope in a tenant she is not a member of
--
-- CLAUSES 6, 7 AND 9 ARE NOT MEASURED THROUGH THE DOOR, AND THEY SAY SO. Both of those new
-- arms are guarded by `not iam.is_trusted_backend()`, which answers TRUE for every direct
-- psql connection (`session_user <> 'authenticator'`) — as knob_snapshot's own organization
-- arm already was. They assert the ladder the door asks, with the caller's own identity.
--
-- Its twin is scripts/campaign-tests/argsruled_red.sql, which asserts clause 1 the other way
-- round and passes only while the defect is live.
--
-- RUN IT:  binlocal/p.sh -f scripts/campaign-tests/argsruled_green.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'argsruled_green.sql'
\set requires 'function:platform.relation_withheld_label'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- ── THE RECORD-STORE SWITCH, BORROWED (SUITES-TIDY 2026-09-22) ──────────────────────────────
-- `custom.system_enabled` defaults to FALSE and that is the DESIGN: the record store is opt-in
-- per organization (STORE-OFF / FIX-11A). This suite takes a seat in an organization that has
-- not opted in, so every write below was answered "This organization has not turned the record
-- store on yet, so custom.<door> is not taking writes." — correctly. The knob's DEFAULT is not
-- touched; the organization-scoped override is written inside THIS transaction and goes with
-- the ROLLBACK at the end of the file. See _borrow_store_switch.sql for why that is a stronger
-- borrow than scripts/lib/borrow-live-switch.sh, which a psql suite cannot source.
-- Rincon Plumbing Co
\set store_org '6069a466-1445-42df-a64e-cf37ecdc1b99'
\i scripts/campaign-tests/_borrow_store_switch.sql
-- Calder Approvals
\set store_org '235a6add-e8b5-43f9-883e-9dd0389c1759'
\i scripts/campaign-tests/_borrow_store_switch.sql


do $t$
declare
  c_dana constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_rincon constant uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';  -- Rincon Plumbing Co
  v_calder constant uuid := '235a6add-e8b5-43f9-883e-9dd0389c1759';  -- Calder Approvals
  v_model  constant uuid := '8c3c4436-d3b1-489d-b802-29456fb7f659';  -- ai.model_definition "allam-2-7b"
  v_jobs   constant uuid := 'af3bfff6-a255-41e5-9ac2-879d53816163';  -- Rincon's Jobs table
  v_withheld constant text := platform.relation_withheld_label();
  c_stranger constant uuid := '000eaa28-cf5d-402a-8f01-5e2c24191323';  -- an account that shares no organization with Dana
  v_foreign_scope constant uuid := '339751a3-1b2c-46bc-a2c3-5fb187bf59b3';  -- a context scope in a tenant she is not in
  v_out  text;
  v_job  uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/argsruled_green', true);
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

  -- ══ 1 — ANOTHER TENANT'S NAME IS WITHHELD, IN WORDS ════════════════════════════════
  v_out := platform.relation_label(v_rincon, 'organization', v_calder);
  if v_out is distinct from v_withheld then
    raise exception '1 FAILED: relation_label answered "%" for an organization she is not a member of; it must answer "%"',
      coalesce(v_out, '<null>'), v_withheld;
  end if;
  raise notice '1 — a tenant she is not in reads "%" and never its name. PASS', v_out;

  -- ══ 2 — HER OWN ORGANIZATION STILL LABELS ══════════════════════════════════════════
  v_out := platform.relation_label(v_rincon, 'organization', v_rincon);
  if v_out is distinct from 'Rincon Plumbing Co' then
    raise exception '2 FAILED: her own organization answered "%" — the door is refusing what it should allow',
      coalesce(v_out, '<null>');
  end if;
  raise notice '2 — her own organization still reads "%". PASS', v_out;

  -- ══ 3 — THE PLATFORM'S CATALOGUE STILL LABELS ══════════════════════════════════════
  v_out := platform.relation_label(v_rincon, 'ai_model', v_model);
  if v_out is distinct from 'allam-2-7b' then
    raise exception '3 FAILED: a catalogue row answered "%" — the fix must ask the kernel, and the kernel says yes here',
      coalesce(v_out, '<null>');
  end if;
  raise notice '3 — a catalogue row still reads "%". PASS', v_out;

  -- ══ 4 AND 5 — THE RECORD ARM IS UNTOUCHED ══════════════════════════════════════════
  select x.id into v_job
    from custom.read_records(v_rincon, v_jobs, false, 200, 0) x
   order by x.document ->> 'job_number'
   limit 1;
  if v_job is null then
    raise notice '4/5 — SKIPPED: Dana can see no job on the Rincon board to read a label from';
  else
    v_out := platform.relation_label(v_rincon, 'record', v_job);
    if v_out is null or v_out = v_withheld then
      raise exception '5 FAILED: a record she may open answered "%"', coalesce(v_out, '<null>');
    end if;
    raise notice '5 — a record she may open still reads "%". PASS', v_out;
  end if;


  -- ══ 6 — THE PERSON LADDER ANSWERS NO FOR A STRANGER ════════════════════════════════
  -- platform.knob_snapshot resolves the USER rung, so p_user_id names whose personal
  -- overrides come back. Keith Watanabe has an account here and shares no organization
  -- with Dana. The decision ARGS-RULED added is `iam.may_address_user_in_org`, and it is
  -- guarded by `not iam.is_trusted_backend()` — exactly as this door's own ORGANIZATION
  -- arm already is.
  --
  -- [NOT MEASURED THROUGH THE DOOR FROM THIS SEAT — AND IT SAYS SO RATHER THAN PASSING.]
  -- `iam.is_trusted_backend()` answers TRUE for any session whose `session_user` is not
  -- `authenticator`, which is every psql connection, including this one after `set role`.
  -- So neither the new person arm nor the door's existing organization arm can fire here.
  -- What IS measurable from this seat is the ladder the door now asks, and it is asked with
  -- the caller's own identity:
  if iam.may_address_user_in_org(c_stranger, v_rincon) then
    raise exception '6 FAILED: the person ladder says Dana may address an account that shares no organization with her';
  end if;
  raise notice '6 — iam.may_address_user_in_org says no for a stranger (the door''s new arm; not measurable from a direct connection). PASS';

  if not iam.may_address_user_in_org('4060701e-706a-4c76-b3ca-0bbc69fa5a14', v_rincon) then
    raise exception '7 FAILED: the person ladder refuses Dana herself';
  end if;
  raise notice '7 — and yes for herself, so the arm is not a refusal of everybody. PASS';

  -- ══ 8 — HER OWN SNAPSHOT STILL RESOLVES ════════════════════════════════════════════
  if platform.knob_snapshot(v_rincon, '4060701e-706a-4c76-b3ca-0bbc69fa5a14', null) is null then
    raise exception '8 FAILED: her own snapshot came back null — the door is refusing what it should allow';
  end if;
  raise notice '8 — her own snapshot still resolves. PASS';

  -- ══ 9 — NOTHING IS PROVISIONED INTO A TENANT SHE IS NOT IN ═════════════════════════
  -- context.provision_scope_dataset used to create a dataset, its fields, an instance row
  -- and a context value in whatever organization the scope it was handed belongs to, with
  -- no access decision at all. Its new arm carries the same `is_trusted_backend` escape a
  -- server lane needs, so from this seat the ladder is asserted directly:
  if iam.has_org_access((select s.organization_id from context.scopes s where s.id = v_foreign_scope)) then
    raise exception '9 FAILED: Dana is a member of the organization that scope belongs to, so it is the wrong fixture';
  end if;
  raise notice '9 — iam.has_org_access says no for the organization that foreign scope belongs to (the door''s new arm). PASS';

  raise notice 'GREEN SUITE PASSED.';
end $t$;

rollback;
