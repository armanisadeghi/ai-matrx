-- LANE TAILS-5 (A) — THE RED TWIN of `scripts/campaign-tests/tails5a_archive_green.sql`.
--
-- The green suite is seven clauses that all pass, and a suite of passes proves nothing until
-- you can show them failing when the thing that makes them pass is taken away. This file takes
-- it away FOR REAL: it runs BOTH of this lane's own inverses — the files rule 27 requires —
-- inside a transaction that rolls back, and then drives the same dispatcher down the same path.
--
--   RED 0  asserts the inverses actually took, so a twin that silently failed to remove the
--          thing under test cannot report red for the wrong reason
--   RED 1  taking the photo off the job's chat DESTROYS the link — there is nothing to put back
--   RED 2  putting it back therefore makes a NEW link, with a new id and a new "first attached"
--   RED 3  the same is true through a second feature (a resource on an agent) — one class,
--          not one door
--   RED 4  the control: ADDING a link still works with the old bodies back, so the difference
--          between the two suites is these doors and not a broken database
--
-- ONE transaction, ROLLBACK at the end: the reverted bodies and the whole fixture go with it,
-- and the main database keeps the fix.
--
-- THE SEAT. Same as the green suite. The only things done as the connected role are the named
-- plants — the organization, the conversation, the two files, the agent, and the inverses
-- themselves, which are DDL no person is ever supposed to be able to run.
--
-- 🚨 THE MAIN DATABASE.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'tails5a_archive_red.sql'
\set requires 'function:platform.partitioned_row_attrs'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\pset pager off

begin;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- THE PLANT: this lane's own inverses, executed for real.
-- ══════════════════════════════════════════════════════════════════════════════════════
\ir ../../migrations/inverse/tails5a_a_removal_archives_the_edge_down.sql
\ir ../../migrations/inverse/tails5a_the_two_doors_the_copy_has_drifted_on_down.sql

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_boss    text := current_user;
  v_conv    uuid := gen_random_uuid();
  v_photo   uuid := gen_random_uuid();
  v_book    uuid := gen_random_uuid();
  v_agent   uuid := gen_random_uuid();
  v_link    uuid;
  v_link2   uuid;
  v_n       integer;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname || '.' || p.proname in (
               'public.assoc_remove', 'public.conversation_file_remove',
               'public.agent_resource_remove', 'public.edu_class_unassign',
               'public.dissociate_from_task', 'public.set_entity_scopes')
         and p.prosrc ~* 'delete\s+from\s+platform\.associations') <> 6 then
    raise exception 'RED 0: the inverses did not take — the six removal doors are not all back to DELETE, so nothing below is measuring the old shape';
  end if;
  raise notice 'RED 0 — the inverses are in: all six removal doors DESTROY the edge again.';

  perform set_config('app.actor_system', 'campaign.tails5a.red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Summerland Branch',
          'rincon-plumbing-summerland-ar-' || substr(v_org::text, 1, 8), 'RPS', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into chat.conversation (id, organization_id, created_by, title)
  values (v_conv, v_org, c_admin, 'RPS-3101 — upstairs re-pipe, supply lines');
  insert into files.files (id, organization_id, created_by, file_name, file_path, storage_uri)
  values (v_photo, v_org, c_admin, 'rps-3101-corroded-riser.jpg',
          'rincon/jobs/rps-3101/rps-3101-corroded-riser.jpg',
          'storage://rincon/jobs/rps-3101/rps-3101-corroded-riser.jpg'),
         (v_book, v_org, c_admin, 'summerland-price-book-2026.pdf',
          'rincon/office/summerland-price-book-2026.pdf',
          'storage://rincon/office/summerland-price-book-2026.pdf');
  insert into agent.definition (id, organization_id, name, created_by)
  values (v_agent, v_org, 'Summerland dispatch assistant', c_admin);

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  raise notice 'PART 0 OK — the seat is `authenticated`.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 1 — TAKING THE PHOTO OFF DESTROYS IT. Green clause 1, gone.
  -- ════════════════════════════════════════════════════════════════════════════
  v_link := public.conversation_file_add(v_conv, v_photo, 'Corroded riser, upstairs unit');
  if v_link is null then
    raise exception 'RED 1 setup: the photo never went on, so taking it off proves nothing';
  end if;
  perform public.conversation_file_remove(v_conv, v_photo);
  if exists (select 1 from platform.associations a where a.id = v_link) then
    raise exception 'RED 1 IS NOT RED: with the old door back the link was still ARCHIVED, so the fix was not what was making green clause 1 pass';
  end if;
  raise notice 'RED 1 — SEATED as `%`: taking the photo off the chat DESTROYED the link. There is nothing to put back.', current_user;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 2 — SO PUTTING IT BACK MAKES A STRANGER. Green clause 2, gone.
  -- ════════════════════════════════════════════════════════════════════════════
  v_link2 := public.conversation_file_add(v_conv, v_photo, 'Corroded riser, upstairs unit');
  if v_link2 is null then
    raise exception 'RED 2: re-attaching the photo handed back nothing at all';
  end if;
  if v_link2 = v_link then
    raise exception 'RED 2 IS NOT RED: the photo came back on the SAME edge with the old door in place';
  end if;
  raise notice 'RED 2 — SEATED as `%`: she got a DIFFERENT attachment back (% then %) — a new row that has never been anywhere.', current_user, v_link, v_link2;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 3 — AND IT WAS NEVER ONE DOOR. A resource on an agent, same shape, same loss.
  -- ════════════════════════════════════════════════════════════════════════════
  v_link := public.agent_resource_add(v_agent, 'file', v_book, 'Summerland price book 2026');
  perform public.agent_resource_remove(v_agent, 'file', v_book);
  if exists (select 1 from platform.associations a where a.id = v_link) then
    raise exception 'RED 3 IS NOT RED: the agent resource was archived, so this door was never carrying the defect';
  end if;
  raise notice 'RED 3 — SEATED as `%`: the price book came off the assistant and the link was destroyed too. One class, two features.', current_user;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 4 — THE CONTROL. Adding still works with the old bodies back, so the difference
  -- between the two suites is these doors and not a broken database.
  -- ════════════════════════════════════════════════════════════════════════════
  v_link := public.agent_resource_add(v_agent, 'file', v_book, 'Summerland price book 2026');
  select count(*) into v_n from platform.associations_live a
   where a.source_type = 'file' and a.source_id = v_book and a.target_type = 'agent' and a.target_id = v_agent;
  if v_n <> 1 then
    raise exception 'RED 4: with the old bodies back, ADDING a resource no longer works either (% live edge(s))', v_n;
  end if;
  raise notice 'RED 4 — adding is untouched by either shape, so RED 1-3 are about the removal and nothing else.';

  perform set_config('role', v_boss, true);
  raise notice '=== TAILS-5 (A) RED — both inverses were run for real, and with them a removal DESTROYS the link: the dispatcher cannot get her own attachment back, and neither can the office. Rolling back; the main database keeps the fix. ===';
end $red$;

rollback;
