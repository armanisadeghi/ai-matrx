-- chair-step: a scope type's archive and restore doors carry its context fields, sub-types, scopes and the advice aimed at them themselves, in the store, instead of leaving it to the old rows' cascade. ADDS custom._ctx_type_subtree_follows (archive: everything live under the type takes its exact time while the Table is live; restore: exactly what that removal took, sub-types first; the rag edges of platform.soft_delete_edge for the types and their scopes follow on the same time; no client grant). REPLACES custom.context_type_archive (one call before the image) and custom.context_type_restore (one call after the store's own Table write). Same effect, rolled back on live as admin in Cedar Ridge: a door-made type with a sub-type, a scope in each and a field archived and restored — answers, store states and old-row states equal before and after. Guard scripts/campaign-tests/scopesfts1f_a_scope_type_takes_its_fields_sub_types_and_scopes_in_the_store_red_green.sql RED (store-only sub-type and its room stayed live; the field came back with the wrong time) then GREEN, admin and test@test.com.
-- lane: FINISH-THE-SWITCH (FTS-1f, old-row writes off, item 1)
-- based-on: custom.context_type_archive(uuid) 5cad9df015f2ad3e050ee4c1691e581035bc37e71a134d542e0fafa283002eea
-- based-on: custom.context_type_restore(uuid) f666c820a4992641738cf754568aa2ce88c9d4d74302d781e4bede3c07d9ed34
-- lock: custom
--
-- Inverse: migrations/inverse/scopesfts1f_a_scope_type_takes_its_fields_sub_types_and_scopes_in_the_store_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy retires its "Clinic Site" type; its "Treatment Room" sub-type, every
-- site and room, and the "Parking Notes" field go with it, and come back with it.

CREATE OR REPLACE FUNCTION custom._ctx_type_subtree_follows(p_org uuid, p_root uuid, p_when timestamptz, p_restore boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c        record;
  cr       custom.record;
  e        record;
  v_n      integer := 0;
  v_types  uuid[];
  v_scopes uuid[];
  v_desc   text;
  v_was    text;
  v_actor  text := coalesce(current_setting('app.actor_system', true), '');
begin
  -- WHAT A SCOPE TYPE TAKES WITH IT, IN THE STORE (FTS-1f): what platform._cascade_soft_delete did through the old
  -- rows (context.scope_types → its context fields, its sub-types, its scopes, the rag suggestions aimed at it),
  -- asked of the Records. Archive: everything live under p_root takes p_root's exact time. Restore: exactly what
  -- that removal took (archived at that same time), reached through the sub-types brought back. Called by the
  -- archive door BEFORE the root Table is archived (the store halves never write a row of a removed Table) and by
  -- the restore door AFTER the root Table is live again.
  with recursive under as (
    select p_root as id
    union
    select t.id from custom.record t join under u on t.data ->> 'parent_type_id' = u.id::text
     where t.organization_id = p_org and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
       and case when p_restore then t.deleted_at = p_when else t.deleted_at is null end)
  select array_agg(id) into v_types from under;

  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;

  -- Restore brings the sub-types back first, so their rows can be written.
  if p_restore then
    for cr in select t.* from custom.record t where t.organization_id = p_org and t.id = any (v_types) and t.id <> p_root loop
      v_was := custom._ctx_mark('door');
      perform custom._ctx_store_type(p_org, cr.id, custom.scope_type_row_of(cr) || jsonb_build_object('deleted_at', null));
      perform custom._ctx_mark(v_was);
      v_n := v_n + 1;
    end loop;
  end if;

  -- The scopes of every type in the tree.
  select coalesce(array_agg(s.id), '{}'::uuid[]) into v_scopes from custom.record s
   where s.organization_id = p_org and s.table_id = any (v_types) and s.data_class = 'record'
     and case when p_restore then s.deleted_at = p_when else s.deleted_at is null end;
  for c in select s.* from custom.record s where s.organization_id = p_org and s.id = any (v_scopes) loop
    select f.data ->> 'key' into v_desc from custom.record f
     where f.organization_id = p_org and f.id = custom._ctx_id('scope-column-field', c.table_id::text, 'description');
    v_was := custom._ctx_mark('door');
    perform custom._ctx_store_scope(p_org, c.table_id, c.id, jsonb_build_object(
      'id', c.id, 'organization_id', p_org, 'scope_type_id', c.table_id,
      'parent_scope_id', nullif(c.data ->> 'parent_id', ''), 'name', c.data -> 'name',
      'description', coalesce(c.data ->> coalesce(v_desc, 'description'), ''),
      'settings', custom._ctx_scope_settings(p_org, c.table_id, c.data),
      'slug', c.data ->> 'slug', 'sort_order', nullif(c.data ->> 'sort_order', '')::smallint,
      'created_by', c.created_by, 'deleted_at', case when p_restore then null else p_when end));
    perform custom._ctx_mark(v_was);
    v_n := v_n + 1;
  end loop;

  -- The context fields of every type in the tree (a Table's column and settings Fields were never context fields).
  for cr in select f.* from custom.record f
            where f.organization_id = p_org and f.table_id = custom.field_kernel_id() and f.data_class = 'field'
              and f.data ->> 'entity_definition_id' = any (v_types::text[])
              and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items'
              and case when p_restore then f.deleted_at = p_when else f.deleted_at is null end loop
    v_was := custom._ctx_mark('door');
    perform custom._ctx_store_item(p_org, (cr.data ->> 'entity_definition_id')::uuid, cr.id,
      custom.scope_item_row_of(cr) || jsonb_build_object(
        'scope_type_id', (cr.data ->> 'entity_definition_id')::uuid, 'created_by', cr.created_by,
        'deleted_at', case when p_restore then null else p_when end,
        'is_active', coalesce((cr.metadata #>> '{moved_from,carried,is_active}')::boolean, true),
        'review_interval_days', cr.data -> 'review_interval_days', 'depends_on', coalesce(cr.data -> 'depends_on', '[]'::jsonb),
        'status_note', cr.data -> 'status_note', 'source_type', 'manual'));
    perform custom._ctx_mark(v_was);
    v_n := v_n + 1;
  end loop;

  -- Archive takes the sub-types last (their rows first, while each Table is live), deepest first.
  if not p_restore then
    for cr in select t.* from custom.record t where t.organization_id = p_org and t.id = any (v_types) and t.id <> p_root
              order by array_position(v_types, t.id) desc loop
      v_was := custom._ctx_mark('door');
      perform custom._ctx_store_type(p_org, cr.id, custom.scope_type_row_of(cr) || jsonb_build_object('deleted_at', p_when));
      perform custom._ctx_mark(v_was);
      v_n := v_n + 1;
    end loop;
  end if;
  perform set_config('app.actor_system', v_actor, true);

  -- THE ADVICE AND ALERTS aimed at those types and scopes follow on the same time, restored exactly
  -- (the non-context edges of platform.soft_delete_edge; 'keep' edges stay).
  for e in select x.parent_table, x.child_schema, x.child_table, x.child_column from platform.soft_delete_edge x
            where x.parent_schema = 'context' and x.parent_table in ('scope_types', 'scopes') and x.parent_column = 'id'
              and x.action = 'cascade' and x.child_schema <> 'context' loop
    if p_restore then
      execute format('update %I.%I set deleted_at = null where %I = any ($1) and deleted_at = $2',
                     e.child_schema, e.child_table, e.child_column)
        using case when e.parent_table = 'scopes' then v_scopes else v_types end, p_when;
    else
      execute format('update %I.%I set deleted_at = $2 where %I = any ($1) and deleted_at is null',
                     e.child_schema, e.child_table, e.child_column)
        using case when e.parent_table = 'scopes' then v_scopes else v_types end, p_when;
    end if;
  end loop;
  return v_n;
end;
$function$;
revoke all on function custom._ctx_type_subtree_follows(uuid, uuid, timestamptz, boolean) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION custom.context_type_archive(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_t      custom.record;
  v_org    uuid;
  v_scopes integer;
  v_tags   integer;
  v_img    context.scope_types;
  v_was    text;
  v_actor  text;
  v_did    text;
  v_now    timestamptz := now();
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROWS ARE ITS IMAGE.
  select t.* into v_t from custom.record t
   where t.id = p_type_id and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context';
  v_org := v_t.organization_id;
  -- public.delete_scope_type's own checks and sentences.
  if v_org is null or v_t.deleted_at is not null then
    perform platform.refuse_not_found('scope type not found');
  end if;
  if auth.role() <> 'service_role'
     and not public.is_platform_admin()
     and not exists (
       select 1 from iam.memberships as membership
        where membership.container_type = 'organization' and membership.container_id = v_org
          and membership.organization_id = v_org and membership.user_id = (select auth.uid())
          and membership.role in ('owner', 'admin') and membership.status = 'active' and membership.deleted_at is null) then
    raise exception 'organization owner or admin required' using errcode = '42501';
  end if;
  select count(*) into v_tags from platform.associations_live a
    join custom.record s on s.organization_id = v_org and s.id = a.target_id
   where a.target_type = 'scope' and s.table_id = p_type_id and s.data_class = 'record' and s.deleted_at is null;
  select count(*) into v_scopes from custom.record s
   where s.organization_id = v_org and s.table_id = p_type_id and s.data_class = 'record' and s.deleted_at is null;
  -- A TYPE'S REMOVAL IS THE ONE WRITE WHOSE STORE HALF CANNOT GO FIRST: the store halves never write a row of a
  -- removed Table (custom._ctx_table_live), so a Table archived first would leave every one of its scopes and
  -- context fields live in the store while the old cascade removed them (proven on the clone: the suite's T1).
  -- Everything is still decided from the store above; the image goes first, unmarked, the old cascade takes the
  -- type's scopes and fields and the follow carries each into the store while the Table is live, and step 3
  -- archives the Table itself from the image, in the same statement.
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  -- 0. WHAT THE TYPE TAKES WITH IT, IN THE STORE (FTS-1f): its context fields, sub-types, scopes and the advice
  -- aimed at them, on this exact time, while the Table is still live.
  perform custom._ctx_type_subtree_follows(v_org, p_type_id, v_now, false);
  perform set_config('custom.context_door_row', p_type_id::text, true);

  -- THE IMAGE, UNMARKED: the old cascade takes the type's scopes and context fields with this timestamp, and
  -- the follow carries each into the store.
  update context.scope_types
     set deleted_at = v_now, updated_by = (select auth.uid()), updated_at = v_now
   where id = p_type_id and deleted_at is null;
  select st.* into v_img from context.scope_types st where st.id = p_type_id;
  perform set_config('custom.context_door_row', '', true);
  if v_img.id is null then
    perform platform.refuse_not_found('scope type not found');
  end if;

  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_type(v_org, p_type_id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_type_id, custom.table_kernel_id(), 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_type_archive');
  return custom._ctx_answer(v_org, p_type_id,
           jsonb_build_object('deleted_scopes', v_scopes, 'deleted_assignments', v_tags));
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.context_type_restore(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_t      custom.record;
  v_org    uuid;
  v_spec   jsonb;
  v_scopes integer;
  v_items  integer;
  v_img    context.scope_types;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROWS ARE ITS IMAGE.
  select t.* into v_t from custom.record t
   where t.id = p_type_id and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context';
  v_org := v_t.organization_id;
  -- public.restore_scope_type's own checks and sentences (it never admitted a platform admin by itself).
  if v_org is null or v_t.deleted_at is null then
    perform platform.refuse_not_found('scope type not found, or it was never removed');
  end if;
  if auth.role() <> 'service_role'
     and not exists (
       select 1 from iam.memberships as membership
        where membership.container_type = 'organization' and membership.container_id = v_org
          and membership.organization_id = v_org and membership.user_id = (select auth.uid())
          and membership.role in ('owner', 'admin') and membership.status = 'active' and membership.deleted_at is null) then
    raise exception 'organization owner or admin required' using errcode = '42501';
  end if;
  select count(*) into v_scopes from custom.record s
   where s.organization_id = v_org and s.table_id = p_type_id and s.data_class = 'record' and s.deleted_at = v_t.deleted_at;
  -- the context fields this removal took (the Table's column and settings Fields were never context items)
  select count(*) into v_items from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = p_type_id::text and f.deleted_at = v_t.deleted_at
     and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
  v_spec := custom.scope_type_row_of(v_t) || jsonb_build_object('deleted_at', null);

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform set_config('custom.context_door_row', p_type_id::text, true);
  perform custom._ctx_store_type(v_org, p_type_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);
  -- WHAT THAT REMOVAL TOOK COMES BACK, IN THE STORE (FTS-1f), now the Table is live again.
  perform custom._ctx_type_subtree_follows(v_org, p_type_id, v_t.deleted_at, true);
  perform set_config('custom.context_door_row', p_type_id::text, true);

  update context.scope_types
     set deleted_at = null, updated_by = (select auth.uid()), updated_at = now()
   where id = p_type_id
  returning * into v_img;
  perform set_config('custom.context_door_row', '', true);
  if v_img.id is null then
    perform platform.refuse_not_found('scope type not found, or it was never removed');
  end if;

  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_type(v_org, p_type_id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_type_id, custom.table_kernel_id(), 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_type_restore');
  return custom._ctx_answer(v_org, p_type_id,
           jsonb_build_object('restored_scopes', v_scopes, 'restored_context_items', v_items));
end;
$function$
;
