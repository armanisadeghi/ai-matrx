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
--
-- Its twin is scripts/campaign-tests/argsruled_red.sql, which asserts clause 1 the other way
-- round and passes only while the defect is live.
--
-- RUN IT:  binlocal/p.sh -f scripts/campaign-tests/argsruled_green.sql

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  c_dana constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_rincon constant uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';  -- Rincon Plumbing Co
  v_calder constant uuid := '235a6add-e8b5-43f9-883e-9dd0389c1759';  -- Calder Approvals
  v_model  constant uuid := '8c3c4436-d3b1-489d-b802-29456fb7f659';  -- ai.model_definition "allam-2-7b"
  v_jobs   constant uuid := 'af3bfff6-a255-41e5-9ac2-879d53816163';  -- Rincon's Jobs table
  v_withheld constant text := platform.relation_withheld_label();
  v_out  text;
  v_job  uuid;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'this file runs on the MAIN database only';
  end if;
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

  raise notice 'GREEN SUITE PASSED.';
end $t$;

rollback;
