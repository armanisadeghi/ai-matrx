-- chair-step: INVERSE of migrations/campaign/scopesfts1f_a_scope_type_takes_its_fields_sub_types_and_scopes_in_the_store.sql (lane FINISH-THE-SWITCH, FTS-1f): restores custom.context_type_archive and custom.context_type_restore as production held them on 2026-10-05 and drops custom._ctx_type_subtree_follows.
-- lane: FINISH-THE-SWITCH (FTS-1f)
-- lock: custom

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

DROP FUNCTION custom._ctx_type_subtree_follows(uuid, uuid, timestamptz, boolean);
