-- DOORS-ONLY-5 — THE platform.rulebook DOORS, FROM A REAL MEMBER'S SEAT.
--
-- `pnpm check:door-names-resolve` already proves every name these five doors use resolves under
-- the `search_path` they pin — it caught all five naming an unqualified `is_platform_admin()`
-- the moment they applied. That is a statement about NAMES and nothing at all about BEHAVIOUR.
-- A door whose ladder is wrong, whose metadata whitelist lets the server's key through, or whose
-- CAS is not a CAS resolves every name it uses perfectly. So this calls each one.
--
-- Run it twice, and the second run is the closure's proof:
--
--   psql -v closed=0 -f scripts/campaign-tests/doorsonly5_rulebook_doors_work_from_a_seat.sql
--   …apply doorsonly5_platform_rulebook_is_never_client_written.sql…
--   psql -v closed=1 -f scripts/campaign-tests/doorsonly5_rulebook_doors_work_from_a_seat.sql
--
-- `closed=1` adds the refusal clause. Everything else is identical in both runs, so a door that
-- stopped working when the table closed is visible as a diff and not as a silence.
--
-- 🚨 A CLOSED WRITE HAS TWO HONEST SHAPES and this suite asserts the thing true in both, the way
-- the saved_view suite had to learn: with the grant still held, a restrictive policy with
-- `using (false)` makes the row INVISIBLE to an UPDATE, so Postgres matches zero rows and
-- returns SUCCESS — only an INSERT, which is a WITH CHECK, raises 42501. Once the canonical
-- route has withdrawn the write grant the same statement is refused 42501 before RLS is reached.
-- The assertion is that THE WRITE LANDS NOWHERE, and the notice says which shape it saw.
--
-- THE USE CASE THE FIXTURE DATA COMES FROM: Vela Sports Physical Therapy, a four-therapist
-- clinic in Bend, Oregon. Its owner is distilling the return-to-sport clearance protocol she has
-- used on ACL reconstructions for eleven years — the one thing in the practice that lives only
-- in her head, and the reason a new therapist cannot take those patients. The rules, sections
-- and the Coherence question below are the shape that work really takes: two rules that are both
-- right under different conditions, which is exactly what `rulebook_tension_settle` records.
--
-- It writes nothing: the outermost transaction rolls back.

\set ON_ERROR_STOP on
\if :{?closed}
\else
  \set closed 0
\endif
begin;

select set_config('doorsonly5.closed', :'closed', true);

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd'; -- admin@admin.com
  v_org     uuid;
  v_book    jsonb;
  v_id      uuid;
  v_slug    text := 'vela-return-to-sport-' || substr(md5(random()::text), 1, 8);
  v_version integer;
  v_reads_before integer;
  v_reads_after  integer;
  v_state   text;
  v_rows    int;
  v_passes  int := 0;
  v_expected int;
  v_closed  boolean := current_setting('doorsonly5.closed', true) = '1';
begin
  select iam.default_organization_id(c_admin) into v_org;
  if v_org is null then
    raise exception 'setup: admin@admin.com has no default organization, so this suite has no real tenant to write in';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() <> c_admin then
    raise exception 'setup: this suite did not take admin@admin.com''s seat (user %, uid %)',
      current_user, auth.uid();
  end if;

  select count(*) into v_reads_before from platform.rulebook;

  -- ═══ 1. rulebook_create ═════════════════════════════════════════════════════
  v_book := public.rulebook_create(
    p_organization_id => v_org,
    p_name => 'Return-to-sport clearance after ACL reconstruction',
    p_slug => v_slug,
    p_description => 'How Vela decides an athlete is ready to be cleared, and what it takes to overrule each test.',
    p_source => jsonb_build_object('kind', 'interview', 'expert', 'Clinic owner, 11 years of ACL caseload'),
    p_sections => jsonb_build_object('S', jsonb_build_object('label', 'Strength gates'),
                                     'H', jsonb_build_object('label', 'Hop tests'),
                                     'P', jsonb_build_object('label', 'Psychological readiness')),
    p_visibility => 'internal',
    p_metadata => jsonb_build_object('intake', jsonb_build_object(
      'who_runs_it', 'My whole clinic', 'approach', 'interview')));
  if v_book is null then
    raise exception '1: rulebook_create returned NULL';
  end if;
  v_id := (v_book->>'id')::uuid;
  v_version := (v_book->>'version')::integer;
  if v_book->>'created_by' <> c_admin::text then
    raise exception '1: the door did not stamp created_by from auth.uid() (got %)', v_book->>'created_by';
  end if;
  if v_book->>'status' <> 'draft' then
    raise exception '1: a Rulebook must be born draft, not %', v_book->>'status';
  end if;
  if jsonb_array_length(v_book->'rules') <> 0 then
    raise exception '1: a Rulebook must be born with no rules';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 1  rulebook_create starts a draft with no rules, stamps created_by from auth.uid(), and returns the row (id %)', v_id;

  -- ═══ 2. THE METADATA WHITELIST IS A WALL ════════════════════════════════════
  -- `coherence` is the server lane's reading of the Expert's work, and the one key
  -- platform._touch_rulebook treats as background. A client cannot author it.
  begin
    perform public.rulebook_create(
      p_organization_id => v_org,
      p_name => 'smuggled', p_slug => v_slug || '-x',
      p_metadata => jsonb_build_object('coherence', jsonb_build_object('tensions', '[]'::jsonb)));
    raise exception '2: rulebook_create ACCEPTED a client-authored `coherence` key';
  exception when insufficient_privilege then
    v_passes := v_passes + 1;
    raise notice '  PASS 2  a metadata key outside the declared client set is refused BY NAME, not silently dropped';
  end;

  -- ═══ 3. rulebook_save — the CAS, and the MERGE ══════════════════════════════
  v_book := public.rulebook_save(
    p_rulebook_id => v_id,
    p_expected_version => v_version,
    p_rules => jsonb_build_array(
      jsonb_build_object('id', 'r1', 'section', 'S', 'draft', false,
        'name', 'Quad strength index at or above 90 percent',
        'text', 'Clear only when isokinetic quad LSI is >= 90% at 60 deg/sec on the involved limb.'),
      jsonb_build_object('id', 'r2', 'section', 'H', 'draft', false,
        'name', 'All four hop tests within 10 percent',
        'text', 'Single, triple, crossover and timed hop must each be within 10% of the uninvolved limb.')),
    p_metadata_patch => jsonb_build_object('capture_plan',
      jsonb_build_object('schema', 1, 'next', 'Psychological readiness — the ACL-RSI score she actually uses')));
  if v_book is null then
    raise exception '3: rulebook_save returned NULL on a correct-version save';
  end if;
  if (v_book->>'version')::integer <> v_version + 1 then
    raise exception '3: the trigger did not advance the version (was %, now %)', v_version, v_book->>'version';
  end if;
  if v_book->'metadata'->'intake'->>'who_runs_it' is distinct from 'My whole clinic' then
    raise exception '3: the metadata PATCH replaced the column instead of merging it — `intake` is gone';
  end if;
  if public.rulebook_save(p_rulebook_id => v_id, p_expected_version => v_version,
                          p_rules => '[]'::jsonb) is not null then
    raise exception '3: a STALE version was accepted — the CAS is not a CAS';
  end if;
  if jsonb_array_length((select rules from platform.rulebook where id = v_id)) <> 2 then
    raise exception '3: the refused stale save wrote anyway';
  end if;
  v_version := (v_book->>'version')::integer;
  v_passes := v_passes + 1;
  raise notice '  PASS 3  rulebook_save writes rules, MERGES the metadata patch (intake survives a capture_plan write), advances the version once, and a stale version returns NULL having written nothing';

  -- ═══ 4. rulebook_meta_set ═══════════════════════════════════════════════════
  v_book := public.rulebook_meta_set(
    p_rulebook_id => v_id,
    p_name => 'Return-to-sport clearance — ACL reconstruction',
    p_status => 'active');
  if v_book is null then
    raise exception '4: rulebook_meta_set returned NULL';
  end if;
  if v_book->>'status' <> 'active' or v_book->>'name' <> 'Return-to-sport clearance — ACL reconstruction' then
    raise exception '4: the facts did not land';
  end if;
  if jsonb_array_length(v_book->'rules') <> 2 then
    raise exception '4: rulebook_meta_set touched the rules, which are not its to write';
  end if;
  begin
    perform public.rulebook_meta_set(p_rulebook_id => v_id, p_status => 'retired');
    raise exception '4: an invented status was accepted';
  exception when invalid_parameter_value or others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '22023' then
      raise exception '4: an invented status failed % rather than 22023', v_state;
    end if;
  end;
  v_version := (select version from platform.rulebook where id = v_id);
  v_passes := v_passes + 1;
  raise notice '  PASS 4  rulebook_meta_set writes the facts and nothing else, and refuses a status outside the vocabulary by name';

  -- ═══ 5. rulebook_tension_settle ═════════════════════════════════════════════
  -- The Coherence Partner's block, written as the server writes it, with a key beside the
  -- tensions that the client must not be able to lose.
  reset role;
  update platform.rulebook
     set metadata = metadata || jsonb_build_object('coherence', jsonb_build_object(
           'generated_at', '2026-09-21T18:00:00Z',
           'model_note', 'written by the Coherence Partner, not by the clinic',
           'tensions', jsonb_build_array(
             jsonb_build_object('id', 't1', 'state', 'open',
               'question', 'Quad LSI says hold, hop tests say clear. Which wins for a 16-year-old in season?',
               'rule_ids', jsonb_build_array('r1', 'r2')))))
   where id = v_id;
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_version := (select version from platform.rulebook where id = v_id);

  v_book := public.rulebook_tension_settle(
    p_rulebook_id => v_id,
    p_expected_version => v_version,
    p_tension_id => 't1',
    p_outcome => 'both_right',
    p_answer => 'In season and under 18, hop symmetry clears them for practice; the quad gate still holds for contact.');
  if v_book is null then
    raise exception '5: rulebook_tension_settle returned NULL on a live question';
  end if;
  if v_book->'metadata'->'coherence'->'tensions'->0->>'state' <> 'both_right' then
    raise exception '5: the ruling did not land on the tension';
  end if;
  if v_book->'metadata'->'coherence'->>'model_note' is null then
    raise exception '5: settling one tension LOST a sibling key of the coherence block — the surgical write is not surgical';
  end if;
  if v_book->'metadata'->'intake'->>'who_runs_it' is null then
    raise exception '5: settling one tension lost another metadata key entirely';
  end if;
  begin
    perform public.rulebook_tension_settle(
      p_rulebook_id => v_id, p_expected_version => (v_book->>'version')::integer,
      p_tension_id => 't1', p_outcome => 'moot');
    raise exception '5: the machine-only outcome `moot` was accepted from a client';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '22023' then
      raise exception '5: `moot` failed % rather than 22023', v_state;
    end if;
  end;
  if public.rulebook_tension_settle(
       p_rulebook_id => v_id, p_expected_version => (v_book->>'version')::integer,
       p_tension_id => 'no-such-question', p_outcome => 'resolved') is not null then
    raise exception '5: a question that does not exist was reported as settled';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 5  rulebook_tension_settle rules on ONE question in place, keeps every sibling key of the coherence block, refuses the machine-only `moot`, and reads a missing question as absent rather than as a silent success';

  -- ═══ 6. rulebook_archive ════════════════════════════════════════════════════
  v_book := public.rulebook_archive(p_rulebook_id => v_id);
  if v_book is null or v_book->>'deleted_at' is null then
    raise exception '6: rulebook_archive did not archive the Rulebook';
  end if;
  if public.rulebook_archive(p_rulebook_id => v_id) is not null then
    raise exception '6: archiving an already-archived Rulebook was accepted';
  end if;
  if public.rulebook_save(p_rulebook_id => v_id, p_expected_version => 99,
                          p_rules => '[]'::jsonb) is not null then
    raise exception '6: an archived Rulebook is still writable through the save door';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 6  rulebook_archive soft-deletes, and an archived Rulebook reads as absent to every door';

  -- ═══ 7. READS DO NOT MOVE ═══════════════════════════════════════════════════
  select count(*) into v_reads_after from platform.rulebook;
  if v_reads_after <> v_reads_before + 1 then
    raise exception '7: this seat reads % rows, not the % it read before plus the one it created',
      v_reads_after, v_reads_before;
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 7  the member''s own SELECT is untouched — % rows before, % after the one create', v_reads_before, v_reads_after;

  -- ═══ 8. the direct write, once the table is closed ══════════════════════════
  if v_closed then
    begin
      insert into platform.rulebook (name, slug, organization_id, created_by)
      values ('smuggled', v_slug || '-direct', v_org, c_admin);
      raise exception '8: platform.rulebook ACCEPTED a direct client INSERT. The table is open.';
    exception when insufficient_privilege then
      v_passes := v_passes + 1;
      raise notice '  PASS 8a platform.rulebook refuses a direct client INSERT with 42501 — the policy or the withdrawn grant, not a constraint';
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception '8: the direct INSERT failed % rather than 42501, so the refusal is not proven', v_state;
    end;
    begin
      update platform.rulebook set name = 'smuggled' where id = v_id;
      get diagnostics v_rows = row_count;
      if v_rows <> 0 then
        raise exception '8: a direct client UPDATE changed % row(s). The table is open.', v_rows;
      end if;
      delete from platform.rulebook where id = v_id;
      get diagnostics v_rows = row_count;
      if v_rows <> 0 then
        raise exception '8: a direct client DELETE removed % row(s). The table is open.', v_rows;
      end if;
      v_passes := v_passes + 2;
      raise notice '  PASS 8b a direct client UPDATE and DELETE each reach ZERO rows — the grant is still declared and the restrictive policy makes the row invisible to them';
    exception when insufficient_privilege then
      v_passes := v_passes + 2;
      raise notice '  PASS 8b a direct client UPDATE is refused 42501 outright — the write GRANT is withdrawn, so the refusal is one lock deeper than the policy';
    end;
  else
    raise notice '  SKIP 8  the refusal clause runs on the second pass (-v closed=1), after the table is closed';
  end if;

  reset role;
  v_expected := (case when v_closed then 10 else 7 end);
  raise notice '';
  raise notice '  %/% assertions green (closed=%)', v_passes, v_expected, v_closed;
  if v_passes <> v_expected then
    raise exception 'suite: % assertions passed, not %', v_passes, v_expected;
  end if;
end;
$suite$;

rollback;
