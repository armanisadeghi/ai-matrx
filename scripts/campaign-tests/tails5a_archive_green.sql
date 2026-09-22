-- LANE TAILS-5 (A) — THE GREEN SUITE: taking a link off ARCHIVES it, so putting it back puts
-- back the same link.
--
-- THE USE CASE. Rincon Plumbing Co — Summerland Branch. The office keeps a chat per job. The
-- dispatcher removes the photo of the corroded riser from the RPS-3101 thread because she
-- thinks it belongs on the other unit, then puts it back when she realises it was right. Later
-- the same day she takes the branch's price-book file off the office agent and puts that back
-- too. In both cases she should get HER attachment back — the one with the label she typed and
-- the day it was first attached — not a new one that has never been anywhere.
--
-- Before `migrations/campaign/tails5a_a_removal_archives_the_edge.sql` she could not: six
-- removal doors ran `DELETE FROM platform.associations`, so there was nothing to come back.
-- The red twin, `scripts/campaign-tests/tails5a_archive_red.sql`, runs this lane's own inverses
-- and shows every clause below failing again.
--
-- THE SEAT. PART 0 takes `authenticated` and proves it. Every clause that ASSERTS anything is
-- asked from that seat, through the doors a signed-in person reaches. The only things done as
-- the connected role are named PLANTS — the organization, the conversation, the two files and
-- the agent, none of which has a client door in this store.
--
-- ONE transaction, ROLLBACK at the end.
--
-- 🚨 THE MAIN DATABASE. The guard below names main's own system identifier.

\set ON_ERROR_STOP on
\timing off
\pset pager off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'tails5a_archive_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $green$
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
  v_first   timestamptz;
  v_label   text;
  v_n       integer;
  v_offend  text;
begin
  perform set_config('app.actor_system', 'campaign.tails5a.green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── THE BUSINESS AND ITS THINGS (plants: none of these has a client door here) ────────
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Summerland Branch',
          'rincon-plumbing-summerland-a-' || substr(v_org::text, 1, 8), 'RPS', c_admin);
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

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'platform.associations'::regclass),
                 'member') then
    raise exception '0: this seat owns platform.associations, so every wall below would open on its first line';
  end if;
  -- `platform` is a DOORS-ONLY schema: a person may READ an edge she is allowed to see and may
  -- not write one at all. That is the wall this suite stands on — every removal below has to
  -- go through a door, because there is no other way.
  begin
    delete from platform.associations where id = gen_random_uuid();
    raise exception '0: this seat can DELETE from platform.associations directly, so no door decides anything';
  exception when insufficient_privilege then null;
  end;
  begin
    update platform.associations set deleted_at = now() where id = gen_random_uuid();
    raise exception '0: this seat can UPDATE platform.associations directly, so no door decides anything';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 OK — the seat is `authenticated`, it does not own platform.associations, and it can neither delete nor update an edge except through a door.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 1 — the photo goes on the job's chat, and she takes it off.
  -- ════════════════════════════════════════════════════════════════════════════
  v_link := public.conversation_file_add(v_conv, v_photo, 'Corroded riser, upstairs unit');
  if v_link is null then
    raise exception '1: attaching the photo handed back no edge at all';
  end if;
  select a.created_at, a.label into v_first, v_label
    from platform.associations a where a.id = v_link;

  perform public.conversation_file_remove(v_conv, v_photo);
  if exists (select 1 from platform.associations_live a where a.id = v_link) then
    raise exception '1: the photo is still on the conversation after she took it off';
  end if;
  -- 🚨 THE WHOLE POINT: it is a TOMBSTONE, not a hole.
  if not exists (select 1 from platform.associations a where a.id = v_link and a.deleted_at is not null) then
    raise exception '1: taking the photo off DESTROYED the edge — there is nothing to put back';
  end if;
  raise notice 'CLAUSE 1 OK: the photo is off the chat, and the link is archived rather than gone.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 2 — she puts it back, and gets HER attachment back.
  -- ════════════════════════════════════════════════════════════════════════════
  v_link2 := public.conversation_file_add(v_conv, v_photo, 'Corroded riser, upstairs unit');
  if v_link2 is distinct from v_link then
    raise exception '2: the photo came back as a DIFFERENT edge (% then %)', v_link, v_link2;
  end if;
  if (select a.created_at from platform.associations a where a.id = v_link) is distinct from v_first then
    raise exception '2: the link came back with a new "first attached" date';
  end if;
  select count(*) into v_n from platform.associations a
   where a.source_type = 'file' and a.source_id = v_photo
     and a.target_type = 'conversation' and a.target_id = v_conv;
  if v_n <> 1 then
    raise exception '2: % row(s) for one photo on one conversation', v_n;
  end if;
  raise notice 'CLAUSE 2 OK: the same link came back, with the day it was first attached (%) intact.', v_first;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 3 — THE WITHDRAWAL SAYS WHAT TOOK IT. `deleted_via_type`/`deleted_via_id` are on
  -- the table for a reason and every removal door now stamps them, so the archive can answer
  -- "what took this off" and not only "it is off".
  -- ════════════════════════════════════════════════════════════════════════════
  perform public.conversation_file_remove(v_conv, v_photo);
  if not exists (select 1 from platform.associations a
                  where a.id = v_link and a.deleted_via_type = 'conversation' and a.deleted_via_id = v_conv) then
    raise exception '3: the withdrawal does not say what took the photo off';
  end if;
  raise notice 'CLAUSE 3 OK: the archived link names the conversation that took it off.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 4 — THE SAME IS TRUE OF A SECOND DOOR IN A DIFFERENT FEATURE. The price book
  -- comes off the dispatch assistant and goes back on; one edge, one history.
  -- ════════════════════════════════════════════════════════════════════════════
  v_link := public.agent_resource_add(v_agent, 'file', v_book, 'Summerland price book 2026');
  if v_link is null then
    raise exception '4: the price book did not go onto the agent';
  end if;
  perform public.agent_resource_remove(v_agent, 'file', v_book);
  if not exists (select 1 from platform.associations a where a.id = v_link and a.deleted_at is not null) then
    raise exception '4: taking the price book off the agent DESTROYED the edge';
  end if;
  v_link2 := public.agent_resource_add(v_agent, 'file', v_book, 'Summerland price book 2026');
  if v_link2 is distinct from v_link then
    raise exception '4: the price book came back as a DIFFERENT edge (% then %)', v_link, v_link2;
  end if;
  raise notice 'CLAUSE 4 OK: the price book came off the assistant and back on as the same link.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 5 — THE GENERIC DOOR TOO. `public.assoc_remove` is what most of the app calls,
  -- and for a file on a conversation it delegates to the door clause 1 used — so this asks it
  -- the way the app does and proves the delegation still archives.
  -- ════════════════════════════════════════════════════════════════════════════
  v_link := public.conversation_file_add(v_conv, v_photo, 'Corroded riser, upstairs unit');
  perform public.assoc_remove('file', v_photo, 'conversation', v_conv, null);
  if exists (select 1 from platform.associations_live a where a.id = v_link) then
    raise exception '5: assoc_remove did not take the photo off';
  end if;
  if not exists (select 1 from platform.associations a where a.id = v_link and a.deleted_at is not null) then
    raise exception '5: assoc_remove DESTROYED the edge';
  end if;
  raise notice 'CLAUSE 5 OK: the generic door archives too.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 6 — THE CENSUS, WHICH IS THE FORCING FUNCTION. Every client-callable removal door
  -- this lane converted is read back out of `pg_proc` and must no longer carry a
  -- `delete from platform.associations`. Written as a POPULATION rather than six names so a
  -- door that quietly goes back to deleting fails here, and so the doors this lane
  -- DELIBERATELY left destroying — the mirrors, the collectors and the seo set-doors — are
  -- named in one place with their reason instead of being silently in or out.
  -- ════════════════════════════════════════════════════════════════════════════
  select string_agg(fn, ', ' order by fn) into v_offend
    from (select n.nspname || '.' || p.proname as fn
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where p.prosrc ~* 'delete\s+from\s+platform\.associations'
             and n.nspname || '.' || p.proname in (
                   'public.assoc_remove', 'public.conversation_file_remove',
                   'public.agent_resource_remove', 'public.edu_class_unassign',
                   'public.dissociate_from_task', 'public.set_entity_scopes')) q;
  if v_offend is not null then
    raise exception '6: these removal doors still DESTROY the edge: %', v_offend;
  end if;
  raise notice 'CLAUSE 6 OK: none of the six removal doors carries a DELETE any more. Still destroying, on purpose and named in the migration: the mirrors (crm/plan/seo/rag/docproc sync), the collectors (platform._gc_*, sweep_orphaned_associations, crm_party_purge) and the seo set-doors, which are the remainder of this class.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 7 — THE PRIMITIVE IS NOT A CLIENT DOOR. `platform.assoc_unset` judges no caller,
  -- by design, so it must not be reachable by one.
  -- ════════════════════════════════════════════════════════════════════════════
  if has_function_privilege('authenticated',
       'platform.assoc_unset(text,uuid,text,uuid,text,text,uuid)'::regprocedure, 'execute') then
    raise exception '7: platform.assoc_unset is EXECUTABLE by a signed-in person, and it asks nothing about the caller';
  end if;
  -- The GRANT is asked from the seat, because that is the question a person's session answers.
  -- The REGISTRY is asked as the connected role, because `platform.client_callable_door` is
  -- itself a doors-only table a person may not read — and that is not a hole in this clause,
  -- it is the same wall PART 0 proved. Out of the seat for one read, asserting a fact about
  -- the platform rather than about a person.
  perform set_config('role', v_boss, true);
  if not exists (select 1 from platform.client_callable_door d
                  where d.schema_name = 'platform' and d.function_name = 'assoc_unset'
                    and d.non_client_lane is not null) then
    raise exception '7: platform.assoc_unset is undeclared — a lane nobody wrote down is a lane nobody can audit';
  end if;
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '7: the seat was not retaken after the registry read — current_user is %', current_user;
  end if;
  raise notice 'CLAUSE 7 OK: the primitive holds no client grant and its non-client lane is declared.';

  perform set_config('role', v_boss, true);
  raise notice '=== TAILS-5 (A) GREEN — a removal archives the edge. The dispatcher takes the photo off the job''s chat and puts it back and gets HER attachment, with the day she first attached it; the same is true of a resource on an agent and of the generic door; the withdrawal says what took it; none of the six removal doors carries a DELETE; and the primitive under them is not reachable by a client. Rolling back. ===';
end $green$;

rollback;
