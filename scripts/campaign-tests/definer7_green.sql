-- DEFINER-7 — the seven client-callable SECURITY DEFINER doors that decided nothing either
-- DECIDE now, or are no longer doors. One suite, from a member's seat.
--
-- THE USE CASE THIS SUITE NAMES (no fake test data): Harbor Point Maritime Training, a
-- USCG-approved training school in Tacoma, Washington — two classroom instructors, one
-- simulator lead, about ninety mariners a year. Their Rules of the Road instructor keeps a
-- flashcard set for Merchant Mariner Credential renewal (COLREGS lights, shapes and sound
-- signals) and shares it by link with the current cohort. A mariner who opens that link copies
-- the set into HER OWN workspace so her study progress is hers, and the school's master set is
-- never touched. Salish Sound Ferry Company is a customer whose deckhands train on their own
-- account — the school's instructor is not a member of it, which is what makes it the
-- stranger organization every refusing clause below names.
--
-- WHAT IS BEING PROVEN. Measured on the MAIN database 2026-09-22,
-- `platform.definer_body_lint_findings()` named SEVEN functions that are SECURITY DEFINER,
-- hold EXECUTE for a client role, take a uuid, and reach no access decision at all — the exact
-- state `seo.keyword_value_map` was in when it returned 114,686 rows of another organization's
-- keyword map to a non-member. Production's own door guard
-- (`platform.door_body_must_decide`) would refuse every one of them on re-insert. After
-- `migrations/campaign/definer7_seven_client_doors_decide_or_stop_being_doors.sql` the census
-- is ONE, and that one is the anonymous guest counter, which is declared.
--
-- IT TAKES THE SEAT (SEAT-RECIPE): every product clause runs as `authenticated` carrying
-- admin@admin.com's claims, because every door here reads auth.uid(). It ends in ROLLBACK and
-- leaves nothing behind.
--
-- RED TWIN: scripts/campaign-tests/definer7_red.sql puts the pre-migration bodies and the
-- pre-migration grant back inside its own rolled-back transaction and requires the census to
-- climb to seven again.

\set suite 'definer7_green.sql'
\set requires 'function:public.fork_shared_flashcard_set|function:public.dict_resolve|function:public.hr_wf_for_target|function:web.assert_crawl_artifact_file_reused|function:platform.definer_body_lint_findings|relation:education.fc_set|relation:dictionary.dict_entries|relation:iam.organizations'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_boss text := current_user;
  v_harbor uuid;
  v_salish uuid;
  v_set uuid;
  v_res jsonb;
  v_copy uuid;
  v_copy_org uuid;
  v_dict jsonb;
  v_terms text[];
  v_sqlstate text;
  v_census text[];
  v_excused_db text[];
  v_n int;
begin
  perform set_config('app.actor_system', 'campaign.definer7_suite', true);

  -- ── THE FIXTURE, AS THE SERVER. Both organizations live for this transaction only. ──
  insert into iam.organizations (name, slug, abbreviation)
  values ('Harbor Point Maritime Training', 'harbor-point-maritime-definer7', 'HPM')
  returning id into v_harbor;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_harbor, 'organization', v_harbor, c_admin, 'owner', 'active');

  -- The stranger. NOBODY is enrolled in it — that is the whole point of it existing.
  insert into iam.organizations (name, slug, abbreviation)
  values ('Salish Sound Ferry Company', 'salish-sound-ferry-definer7', 'SSF')
  returning id into v_salish;

  -- The school's master set, shared by link with the current cohort.
  insert into education.fc_set (organization_id, created_by, updated_by, name, description, topic, visibility)
  values (v_harbor, c_admin, c_admin,
          'COLREGS — Lights, Shapes and Sound Signals (MMC renewal)',
          'Rules of the Road refresher for the autumn Merchant Mariner Credential renewal cohort.',
          'Rules of the Road', 'public')
  returning id into v_set;

  -- The school's own dictionary, so the transcription of a bridge-simulator debrief spells
  -- the trade's words the way a mariner writes them.
  insert into dictionary.dict_entries (organization_id, term, pronunciation, definition, created_by)
  values (v_harbor, 'COLREGS', 'coal-regs',
          'International Regulations for Preventing Collisions at Sea, 1972.', c_admin);

  -- ── 0 — TAKE THE SEAT AND PROVE IT. ──
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if auth.uid() <> c_admin then
    raise exception '0: the seat is not admin@admin.com — auth.uid() is %', auth.uid();
  end if;
  if iam.has_org_access(v_salish) then
    raise exception '0: the seat is a member of Salish Sound Ferry Company, so no refusing clause below could tell a stranger organization from an entitled one';
  end if;

  -- ══ 1 · THE THREE `fork_shared_*` TWO-ARGUMENT OVERLOADS BORROW NO RIGHTS ══════════════
  -- They return a sentence and touch nothing, so they have no business running as the definer.
  select array_agg(p.oid::regprocedure::text order by p.proname)
    into v_census
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.oid in ('public.fork_shared_quiz(uuid,text)'::regprocedure,
                   'public.fork_shared_flashcard_set(uuid,text)'::regprocedure,
                   'public.fork_shared_conversation(uuid,text)'::regprocedure);
  if v_census is not null then
    raise exception '1: these refusal stubs still run with borrowed rights they never use: %', v_census;
  end if;
  -- and they still say the one useful thing they exist to say.
  v_res := public.fork_shared_flashcard_set(v_set);
  if (v_res ->> 'code') is distinct from 'organization_required' then
    raise exception '1: the two-argument fork stub stopped asking where the copy lands: %', v_res;
  end if;

  -- ══ 2 · THE FORK DOOR ANSWERS FOR AN ENTITLED SEAT ════════════════════════════════════
  v_res := public.fork_shared_flashcard_set(v_set, v_harbor);
  if (v_res ->> 'success')::boolean is not true then
    raise exception '2: an enrolled mariner could not copy the school''s shared COLREGS set: %', v_res;
  end if;
  v_copy := (v_res ->> 'set_id')::uuid;
  select organization_id into v_copy_org from education.fc_set where id = v_copy;
  if v_copy_org is distinct from v_harbor then
    raise exception '2: the mariner''s copy landed in organization % — she asked for Harbor Point (%)',
      v_copy_org, v_harbor;
  end if;

  -- ══ 3 · AND REFUSES A STRANGER ════════════════════════════════════════════════════════
  v_res := public.fork_shared_flashcard_set(v_set, v_salish);
  if (v_res ->> 'success')::boolean is not false
     or v_res ->> 'error' not like '%not a member%' then
    raise exception '3: the fork door let the copy land in an organization the caller does not belong to: %', v_res;
  end if;

  -- ══ 4 · THE DICTIONARY DOOR DECIDES BY NAME, AND ANSWERS A STRANGER ORGANIZATION ══════
  --        EXACTLY AS IT ANSWERS AN INVENTED ONE — no existence oracle.
  select array_agg(e ->> 'term')
    into v_terms
    from jsonb_array_elements(
           coalesce(public.dict_resolve(false, false, array[v_harbor],
                    '{}'::uuid[], '{}'::uuid[]) -> 'entries', '[]'::jsonb)) e;
  if v_terms is null or not ('COLREGS' = any(v_terms)) then
    raise exception '4: the school''s own dictionary did not reach its own instructor: %', v_terms;
  end if;

  v_dict := public.dict_resolve(false, false, array[v_salish], '{}'::uuid[], '{}'::uuid[]);
  v_terms := array(select e ->> 'term' from jsonb_array_elements(coalesce(v_dict -> 'entries', '[]'::jsonb)) e);
  if 'COLREGS' = any(v_terms) then
    raise exception '4: the dictionary door handed an organization the caller does not belong to';
  end if;
  if public.dict_resolve(false, false, array[gen_random_uuid()], '{}'::uuid[], '{}'::uuid[])
       is distinct from v_dict then
    raise exception '4: a stranger organization id and an INVENTED one answer differently — the door is an existence oracle';
  end if;

  -- ══ 5 · THE HR DOOR'S GATE IS NAMED IN THE ONE LIST ═══════════════════════════════════
  --        hr.wf_for_target has gated on hr._wf_instance_visible since D283; the platform's
  --        own list of what an access decision IS never learned the name.
  --        The census read itself is not a client door, so it steps out and says so; the
  --        product clause below stays in the seat.
  perform set_config('role', v_boss, true);
  if not platform.definer_body_decides_access('public.hr_wf_for_target(text,uuid)'::regprocedure::oid) then
    raise exception '5: the platform still cannot see the gate hr.wf_for_target asks on every row';
  end if;
  if not platform.definer_body_decides_access('public.dict_resolve(boolean,boolean,uuid[],uuid[],uuid[])'::regprocedure::oid) then
    raise exception '5: the dictionary door still reaches no access decision the platform can read';
  end if;
  perform set_config('role', 'authenticated', true);
  -- and an unentitled seat still gets the absence shape, not a named refusal.
  v_res := public.hr_wf_for_target('hr_position_assignment', gen_random_uuid());
  if (v_res ->> 'granted')::boolean is not true
     or jsonb_array_length(v_res -> 'open') <> 0
     or jsonb_array_length(v_res -> 'history') <> 0 then
    raise exception '5: hr_wf_for_target stopped answering an id that was never real with the absence shape: %', v_res;
  end if;

  -- ══ 6 · THE CRAWL ARTIFACT ASSERTION IS NO LONGER REACHABLE FROM A SEAT ═══════════════
  begin
    perform web.assert_crawl_artifact_file_reused(gen_random_uuid(), v_salish, gen_random_uuid(), '');
    raise exception '6: a signed-in seat can still call the crawl artifact assertion directly, so it can still be asked whether a file id belongs to an organization''s site';
  exception when insufficient_privilege then null;
  end;

  -- ══ 7 · THE CENSUS IS ONE, AND THAT ONE IS DECLARED ══════════════════════════════════
  perform set_config('role', v_boss, true);   -- no client door reads the platform's own census
  select array_agg(object_ref order by object_ref), count(*)
    into v_census, v_n
    from platform.definer_body_lint_findings();
  if v_n <> 1 or v_census[1] not like 'public.record_guest_execution(%' then
    raise exception '7: % client-callable definer door(s) still decide nothing: %', v_n, v_census;
  end if;
  if not (select grandfathered from platform.definer_body_lint_findings()) then
    raise exception '7: the one that remains is not declared on platform.provision_spec_grandfather';
  end if;

  -- ══ 8 · THE TWO LISTS THAT EXCUSE A DOOR ARE ONE LIST ════════════════════════════════
  --        The database's INSERT guard reads platform.provision_spec_grandfather; the release
  --        gate reads aidream/db/definer_access_ratchet.json. On 2026-09-22 they held 2 names
  --        and 4, so the gate excused two doors the database would have refused.
  select array_agg(object_ref order by object_ref) into v_excused_db
    from platform.provision_spec_grandfather
   where lane = 'definer_no_access_decision';
  if array_length(v_excused_db, 1) <> 1
     or v_excused_db[1] not like 'public.record_guest_execution(%' then
    raise exception '8: the database excuses % door(s): % — the committed ratchet excuses exactly one',
      coalesce(array_length(v_excused_db, 1), 0), v_excused_db;
  end if;

  raise notice 'definer7_green: 8 clauses passed — the census is 1 and both excusing lists name it alone';
end $$;

rollback;
