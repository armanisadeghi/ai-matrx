-- LANE SC-4 P4 — EVERY OLD TAG HAS ITS COPY IN THE STORE, measured RED then GREEN on the dev clone.
--
-- THE USE CASE. Harborline Software (the clone's compare fixture organization, SC-3') keeps an
-- Apps scope, "Harborline Dispatch", copied into the record store under the same id (SC-2').
-- Priya Raman (admin@admin.com, a Harborline owner) writes an incident note, "Dispatch board goes
-- blank after the 6:00 shift change", and tags it to Harborline Dispatch in the note's Context
-- section (public.set_entity_scopes, the current screens' own door). The tag must reach the
-- store's copy: one edge `note -> record`, role context_tag, and nothing else on any old screen.
--
-- The notes are written inside this transaction and rolled back. Nothing of the owner's is read
-- or written; the scope and its copy are the clone-only fixture.
--
-- WHAT MAKES IT FAIL:
--   before sc4_every_context_tag_has_one_copy_in_the_store.sql
--     T1  tagging the note leaves exactly one pending follow row for that edge
--         (dedupe 'context.follow:associations:<edge id>') under Harborline
--     T2  custom.context_tag_copy(Harborline) makes the copy: note -> record Harborline Dispatch,
--         role context_tag, the old edge's organization, creator, moment, moved_from naming it
--     T3  a second copy changes nothing
--   before sc4_old_attached_lists_leave_out_the_tag_copies.sql
--     T4  the note's generic attached-to lists (assoc_for_entity, assoc_for_sources, assoc_list,
--         as Priya) show the scope once and never the copy; the Record's own incoming list shows
--         the note; the agent's resolver (custom.resolve_context) gets ONE candidate, not two
--   the fence and the follow of later edits
--     T5  a person making a copied tag through a door (public.assoc_add) is refused by name
--     T6  untagging in the current screens re-arms the follow, and the copy archives the twin
--         (never deletes it); retagging revives the same twin row
--     T7  an edge the store already holds between the same ends (note -> record, another role) IS
--         the tag: the copy adds no second edge and the resolver still sees one candidate
--     T8  the old side's own sweep (public.assoc_remove_for_entity, a person removing a war-room
--         thread's attachments) is never refused because a copy is among the edges

\set ON_ERROR_STOP on
\timing off
\set suite 'sc4_every_tag_has_its_copy_red_green.sql'
\set requires 'relation:custom.io_outbox|function:custom.resolve_context|function:public.set_entity_scopes'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

create temp table sf (k text primary key, v uuid) on commit drop;

do $fixture$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com (Priya Raman on the fixture)
  v_org   uuid;
  v_scope uuid;
  v_note  uuid; v_note2 uuid; v_note3 uuid; v_thread uuid;
begin
  select s.organization_id, s.id into v_org, v_scope
    from context.scopes s join iam.organizations o on o.id = s.organization_id
   where o.name = 'Harborline Software' and s.name = 'Harborline Dispatch' and s.deleted_at is null
   limit 1;
  if v_scope is null or not exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_scope) then
    raise exception 'FIXTURE MISSING: Harborline Software''s "Harborline Dispatch" scope and its copy Record (SC-3'' fixture, SC-2'' copy) are not on this database';
  end if;
  perform set_config('app.actor_system', 'campaign-test/sc4-tags', true);

  insert into workbench.notes (organization_id, label, content, folder_name, created_by)
  values (v_org, 'Dispatch board goes blank after the 6:00 shift change',
          'Three dispatchers saw an empty board for about forty seconds after the shift handover; a reload brought the jobs back.',
          'Incidents', c_admin) returning id into v_note;
  insert into workbench.notes (organization_id, label, content, folder_name, created_by)
  values (v_org, 'Route optimizer ignores the Eastside depot', 'Jobs east of the river are routed from the main yard.',
          'Incidents', c_admin) returning id into v_note2;
  insert into workbench.notes (organization_id, label, content, folder_name, created_by)
  values (v_org, 'Dispatch SLA review, October', 'Median time to assign is 4 minutes; the target is 3.',
          'Reviews', c_admin) returning id into v_note3;
  insert into sf values ('org', v_org), ('scope', v_scope), ('note', v_note), ('note2', v_note2), ('note3', v_note3);
end
$fixture$;

do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid; v_scope uuid; v_note uuid; v_note2 uuid; v_note3 uuid;
  v_edge platform.associations%rowtype;
  v_twin platform.associations%rowtype;
  v_rep jsonb; v_n int; v_m int; v_state text; v_msg text; v_ctx jsonb;
begin
  select v into v_org from sf where k = 'org';     select v into v_scope from sf where k = 'scope';
  select v into v_note from sf where k = 'note';   select v into v_note2 from sf where k = 'note2';
  select v into v_note3 from sf where k = 'note3';

  -- Priya tags the note in the current screens (as herself, through the old door).
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.set_entity_scopes('note', v_note, array[v_scope]);
  perform set_config('role', 'none', true);

  select * into v_edge from platform.associations
   where source_type = 'note' and source_id = v_note and target_type = 'scope' and target_id = v_scope and deleted_at is null;
  if v_edge.id is null then
    raise exception 'FIXTURE: set_entity_scopes did not tag the note';
  end if;

  -- ══ T1: the old tag tells the copy ══
  select count(*) into v_n from custom.io_outbox
   where organization_id = v_org and event_key = 'context.follow'
     and dedupe_key = 'context.follow:associations:' || v_edge.id::text and consumed_at is null;
  if v_n <> 1 then
    raise exception 'T1 RED: tagging the incident note to Harborline Dispatch left % follow row(s) for the tag, not 1 — the copy is never told', v_n;
  end if;

  -- ══ T2: the copy makes the twin ══
  if to_regprocedure('custom.context_tag_copy(uuid)') is null then
    raise exception 'T2 RED: custom.context_tag_copy does not exist — nothing copies a tag into the store';
  end if;
  v_rep := custom.context_tag_copy(v_org);
  select * into v_twin from platform.associations
   where source_type = 'note' and source_id = v_note and target_type = 'record' and target_id = v_scope and role = 'context_tag';
  if v_twin.id is null or v_twin.deleted_at is not null then
    raise exception 'T2 RED: after the copy the note has no live note -> record copy of its tag (report %)', v_rep;
  end if;
  if v_twin.organization_id is distinct from v_edge.organization_id or v_twin.created_by is distinct from v_edge.created_by
     or v_twin.created_at is distinct from v_edge.created_at
     or v_twin.metadata -> 'moved_from' ->> 'id' is distinct from v_edge.id::text then
    raise exception 'T2: the copy does not carry the old tag''s organization/creator/moment/origin: %', to_jsonb(v_twin);
  end if;

  -- ══ T3: idempotent ══
  v_rep := custom.context_tag_copy(v_org);
  if (v_rep ->> 'made')::int <> 0 or (v_rep ->> 'updated')::int <> 0 or (v_rep ->> 'revived')::int <> 0 or (v_rep ->> 'archived')::int <> 0 then
    raise exception 'T3: a second copy with nothing changed still wrote: %', v_rep;
  end if;

  -- ══ T4: old attached-to lists show the tag once; the Record's list shows the note; one candidate ══
  perform set_config('role', 'authenticated', true);
  select count(*), count(*) filter (where e.role = 'context_tag') into v_n, v_m
    from public.assoc_for_entity('note', v_note) e where e.direction = 'outgoing';
  if v_m <> 0 or v_n <> 1 then
    perform set_config('role', 'none', true);
    raise exception 'T4 RED: the note''s attached-to list (assoc_for_entity) shows % outgoing edge(s), % of them the copy — Harborline Dispatch would be listed twice', v_n, v_m;
  end if;
  select count(*) into v_n from public.assoc_for_sources('note', array[v_note]) e;
  if v_n <> 1 then
    perform set_config('role', 'none', true);
    raise exception 'T4 RED: assoc_for_sources lists % edge(s) for the note, not 1', v_n;
  end if;
  select count(*) into v_n from public.assoc_list('note', v_note, 'out') e;
  if v_n <> 1 then
    perform set_config('role', 'none', true);
    raise exception 'T4 RED: assoc_list lists % outgoing edge(s) for the note, not 1', v_n;
  end if;
  select count(*) into v_n from public.assoc_for_entity('record', v_scope) e
   where e.direction = 'incoming' and e.other_type = 'note' and e.other_id = v_note;
  perform set_config('role', 'none', true);
  if v_n <> 1 then
    raise exception 'T4: the Record''s own tagged-to-this list (incoming) shows the note % time(s), not once', v_n;
  end if;
  perform set_config('role', 'authenticated', true);
  v_ctx := custom.resolve_context('note', v_note, null, null);
  perform set_config('role', 'none', true);
  select count(*) into v_n from jsonb_array_elements(coalesce(v_ctx -> 'candidates', v_ctx -> 'checks', '[]'::jsonb)) c
   where c ->> 'record_id' = v_scope::text;
  if v_n > 1 then
    raise exception 'T4 RED: the agent''s resolver sees Harborline Dispatch % times for one tagged note', v_n;
  end if;
  if not (v_ctx::text like '%' || v_scope::text || '%') then
    raise exception 'T4: the agent''s resolver does not see the note''s tag at all: %', left(v_ctx::text, 600);
  end if;

  -- ══ T5: the fence ══
  perform set_config('role', 'authenticated', true);
  begin
    perform public.assoc_add('note', v_note2, 'record', v_scope, v_org, null, '{}'::jsonb, 'context_tag');
    v_state := 'passed';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  perform set_config('role', 'none', true);
  if v_state is distinct from '42501' or v_msg not like '%copy of a context tag%' then
    raise exception 'T5: a person making a copied tag through assoc_add was not refused by the fence (sqlstate %, %)', v_state, v_msg;
  end if;

  -- ══ T6: untag and retag in the current screens ══
  perform custom.io_outbox_drain(v_org, 'context-follow', 1000, 'context.follow');
  perform set_config('role', 'authenticated', true);
  perform public.set_entity_scopes('note', v_note, array[]::uuid[]);
  perform set_config('role', 'none', true);
  select count(*) into v_n from custom.io_outbox
   where organization_id = v_org and dedupe_key = 'context.follow:associations:' || v_edge.id::text and consumed_at is null;
  if v_n <> 1 then
    raise exception 'T6: untagging the note did not re-arm its follow row (% pending)', v_n;
  end if;
  v_rep := custom.context_tag_copy(v_org);
  select * into v_twin from platform.associations where id = v_twin.id;
  if v_twin.id is null or v_twin.deleted_at is null then
    raise exception 'T6: after untagging, the copy of the tag is % (report %)', coalesce(to_jsonb(v_twin)::text, 'gone — deleted, not archived'), v_rep;
  end if;
  perform set_config('role', 'authenticated', true);
  perform public.set_entity_scopes('note', v_note, array[v_scope]);
  perform set_config('role', 'none', true);
  v_rep := custom.context_tag_copy(v_org);
  select count(*) into v_n from platform.associations
   where source_type = 'note' and source_id = v_note and target_type = 'record' and target_id = v_scope and role = 'context_tag';
  select * into v_twin from platform.associations where id = v_twin.id;
  if v_n <> 1 or v_twin.deleted_at is not null then
    raise exception 'T6: retagging left % copy row(s), the original %', v_n, coalesce(to_jsonb(v_twin)::text, 'missing');
  end if;

  -- ══ T7: the same edge under either store token ══
  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
  values ('note', v_note3, 'record', v_scope, v_org, c_admin);
  perform set_config('role', 'authenticated', true);
  perform public.set_entity_scopes('note', v_note3, array[v_scope]);
  perform set_config('role', 'none', true);
  v_rep := custom.context_tag_copy(v_org);
  select count(*) into v_n from platform.associations
   where source_type = 'note' and source_id = v_note3 and target_type in ('record', 'custom_record') and target_id = v_scope and deleted_at is null;
  if v_n <> 1 or coalesce((v_rep ->> 'same_edge_already_there')::int, 0) < 1 then
    raise exception 'T7: a note already tied to the Record in the store now has % live store edge(s) to it (report %)', v_n, v_rep;
  end if;

  -- ══ T8: the old side's own sweep passes over a copy ══
  perform set_config('role', 'authenticated', true);
  begin
    perform public.assoc_remove_for_entity('note', v_note);
    v_state := 'passed';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  perform set_config('role', 'none', true);
  if v_state <> 'passed' then
    raise exception 'T8: removing the note''s attachments in the current screens failed because of the copy (%: %)', v_state, v_msg;
  end if;

  raise notice 'GREEN T1 T2 T3 T4 T5 T6 T7 T8 — every old tag has one copy in the store, old lists never show it, only the follow writes it';
end
$t$;

rollback;
