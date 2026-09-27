-- LANE PROOF-DEFECTS (D3) — A NEW SCOPE TAG TYPE NEVER STOPS AN ORGANIZATION'S CONTEXT FOLLOW,
-- measured RED then GREEN on the dev clone. Plain SQL, one transaction, rolled back: nothing stays.
--
-- THE USE CASE. In admin's Workspace a Source ("processed_document") is marked as being about a
-- department scope (label "about", registered 2026-09-25, after SC-4 P4 made the store twins
-- once). The record store's copy of that scope must carry the tag, and the rest of the
-- organization's copy must land. On production before
-- proofdefects_every_scope_tag_type_keeps_its_store_twin.sql the copy raised
-- "association direction is wrong: canonical registered direction is record -> processed_document"
-- and 46 edits waited from 2026-09-25 05:46 UTC.
--
--   T1  the tag copy (custom.context_tag_copy_batch) registers the missing `processed_document -> record` twin
--   T2  the tag is copied: processed_document -> record, role context_tag, live
--   T3  a tag the store still refuses (its twin switched off) is counted in `refused` and named,
--       and the call returns instead of failing the organization's whole copy
--
-- Run: node <clone runner> this-file (the clone is proven by its quarantine facts first).
begin;
-- THE TEST'S OWN LOOP OVER THE BATCH DOOR (lane FOLLOW-BATCH-2). custom.context_tag_copy(uuid), the
-- one-transaction whole-organization door, refuses: it held the sign-in table to COMMIT. The follow
-- commits after every custom.context_tag_copy_batch call; this suite is one rolled-back transaction by
-- design, so it walks the same batches inside it and sums them the way the follow's report does.
create function pg_temp.tag_copy_all(p_org uuid) returns jsonb language plpgsql as $tc$
declare
  v_cursor jsonb := null; b jsonb; k text;
  v_out jsonb := jsonb_build_object('organization_id', p_org, 'made', 0, 'revived', 0, 'archived', 0,
                   'updated', 0, 'current', 0, 'same_edge_already_there', 0, 'waiting_for_the_record', 0,
                   'refused', 0, 'refused_tags', '[]'::jsonb);
begin
  loop
    b := custom.context_tag_copy_batch(p_org, v_cursor, null);
    foreach k in array array['made','revived','archived','updated','current','same_edge_already_there','refused'] loop
      v_out := jsonb_set(v_out, array[k], to_jsonb((v_out->>k)::int + coalesce((b->>k)::int, 0)));
    end loop;
    if b ? 'waiting_for_the_record' and b->'waiting_for_the_record' <> 'null'::jsonb then
      v_out := jsonb_set(v_out, '{waiting_for_the_record}', b->'waiting_for_the_record');
    end if;
    v_out := jsonb_set(v_out, '{refused_tags}', (v_out->'refused_tags') || coalesce(b->'refused_tags', '[]'::jsonb));
    v_cursor := b->'next';
    exit when v_cursor is null or v_cursor = 'null'::jsonb;
  end loop;
  loop
    exit when platform.reachability_flush(500) = 0;
  end loop;
  return v_out;
end $tc$;
do $$
declare
  v_org   uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin@admin.com's Workspace (test account)
  v_scope uuid;
  v_scope2 uuid;
  v_pd    uuid;
  v_pd2   uuid;
  r       jsonb;
begin
  select s.id into v_scope from context.scopes s
    join custom.record c on c.id = s.id and c.data_class = 'record'
   where s.organization_id = v_org and s.deleted_at is null order by s.created_at, s.id limit 1;
  select s.id into v_scope2 from context.scopes s
    join custom.record c on c.id = s.id and c.data_class = 'record'
   where s.organization_id = v_org and s.deleted_at is null and s.id <> v_scope order by s.created_at, s.id limit 1;
  select id into v_pd from docproc.processed_documents where organization_id = v_org and deleted_at is null order by created_at, id limit 1;
  select id into v_pd2 from docproc.processed_documents where organization_id = v_org and deleted_at is null and id <> v_pd order by created_at, id limit 1;
  if v_scope is null or v_scope2 is null or v_pd is null or v_pd2 is null then
    raise exception 'FIXTURE: admin''s Workspace needs two copied scopes and two Sources on this clone';
  end if;

  -- The production state before the fix: a scope tag type with no store twin.
  delete from platform.association_types where source_type = 'processed_document' and target_type = 'record';
  perform set_config('app.actor_system', 'campaign-test/proofdefects', true);
  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, label)
  values ('processed_document', v_pd, 'scope', v_scope, v_org, 'about');

  r := pg_temp.tag_copy_all(v_org);   -- RED before the fix: raises the direction error here
  if not exists (select 1 from platform.association_types
                  where source_type = 'processed_document' and target_type = 'record' and is_active) then
    raise exception 'T1 RED: the copy did not register the processed_document -> record twin (%)', r;
  end if;
  if not exists (select 1 from platform.associations
                  where source_type = 'processed_document' and source_id = v_pd and target_type = 'record'
                    and target_id = v_scope and role = 'context_tag' and deleted_at is null) then
    raise exception 'T2 RED: the tag has no copy in the store (%)', r;
  end if;

  -- T3: the twin switched off, a second tag: refused by name, never fatal.
  update platform.association_types set is_active = false
   where source_type = 'processed_document' and target_type = 'record';
  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, label)
  values ('processed_document', v_pd2, 'scope', v_scope2, v_org, 'about');
  r := pg_temp.tag_copy_all(v_org);
  if coalesce((r ->> 'refused')::int, 0) < 1 or jsonb_array_length(coalesce(r -> 'refused_tags', '[]')) < 1 then
    raise exception 'T3 RED: a refused tag was not counted and named (%)', r;
  end if;
  raise notice 'GREEN T1 T2 T3: %', r;
end $$;
rollback;
select 'GREEN' as result;
