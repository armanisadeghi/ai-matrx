-- chair-step: INVERSE of migrations/campaign/scopesfts1e_scope_archive_and_restore_carry_the_scopes_under_it.sql (lane FINISH-THE-SWITCH, FTS-1e): restores custom.context_scope_archive and custom.context_scope_restore as production held them on 2026-10-05 and drops custom._ctx_scope_subtree_follows.
-- lane: FINISH-THE-SWITCH (FTS-1e)
-- lock: custom

CREATE OR REPLACE FUNCTION custom.context_scope_archive(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rec    custom.record;
  v_org    uuid;
  v_type   uuid;
  v_desc   text;
  v_spec   jsonb;
  v_heal   boolean;
  v_ids    uuid[];
  v_kids   integer;
  v_tags   integer;
  v_row    context.scopes;
  v_was    text;
  v_actor  text;
  v_did    text;
  v_now    timestamptz := now();
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROWS ARE ITS IMAGE.
  -- The scope, by its id, from the store: a Record of a context Table, in any state (the answer's organization).
  select r.* into v_rec
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where r.id = p_scope_id and r.data_class = 'record';
  v_org := v_rec.organization_id;
  v_type := v_rec.table_id;
  -- public.delete_scope's own checks and sentences.
  if v_org is null or v_rec.deleted_at is not null then
    perform platform.refuse_not_found('scope not found');
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
  -- The scope and every live scope under it, from the store's containment (data.parent_id).
  with recursive under as (
    select p_scope_id as id
    union
    select c.id from custom.record c join under u on c.data ->> 'parent_id' = u.id::text
     where c.organization_id = v_org and c.data_class = 'record' and c.deleted_at is null)
  select array_agg(id) into v_ids from under;
  v_kids := coalesce(array_length(v_ids, 1), 1) - 1;
  select count(*) into v_tags from platform.associations_live a
   where a.target_type = 'scope' and a.target_id = any (v_ids);

  select f.data ->> 'key' into v_desc from custom.record f
   where f.organization_id = v_org and f.id = custom._ctx_id('scope-column-field', v_type::text, 'description');
  v_heal := not (v_rec.data ? 'slug' and v_rec.data ? 'sort_order');
  v_spec := jsonb_build_object(
    'id', p_scope_id, 'organization_id', v_org, 'scope_type_id', v_type,
    'parent_scope_id', nullif(v_rec.data ->> 'parent_id', ''), 'name', v_rec.data -> 'name',
    'description', coalesce(v_rec.data ->> coalesce(v_desc, 'description'), ''),
    'settings', custom._ctx_scope_settings(v_org, v_type, v_rec.data),
    'slug', v_rec.data ->> 'slug', 'sort_order', nullif(v_rec.data ->> 'sort_order', '')::smallint,
    'created_by', v_rec.created_by, 'deleted_at', v_now);

  -- 1. THE STORE, FIRST, for the door's own row (held back from the follow and the twin).
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  if not v_heal then
    v_was := custom._ctx_mark('door');
    if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
    perform set_config('custom.context_door_row', p_scope_id::text, true);
    perform custom._ctx_store_scope(v_org, v_type, p_scope_id, v_spec);
    perform set_config('app.actor_system', v_actor, true);
    perform custom._ctx_mark(v_was);
  end if;
  perform set_config('custom.context_door_row', p_scope_id::text, true);

  -- 2. THE IMAGE, UNMARKED: the old rows, so the old cascade and the follow carry every child as before.
  update context.scopes
     set deleted_at = v_now, updated_by = (select auth.uid()), updated_at = v_now
   where id = any (v_ids) and deleted_at is null;
  select sc.* into v_row from context.scopes sc where sc.id = p_scope_id;
  perform set_config('custom.context_door_row', '', true);
  if v_row.id is null then
    perform platform.refuse_not_found('scope not found');
  end if;

  -- 3. THE IMAGE'S OWN WORDS BACK, and 4. the twin after the old triggers when step 3 changed nothing.
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_scope(v_org, v_type, p_scope_id, to_jsonb(v_row)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_scope_id, v_type, 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_scope_archive');
  return custom._ctx_answer(v_org, p_scope_id,
           jsonb_build_object('deleted_children', v_kids, 'deleted_assignments', v_tags));
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.context_scope_restore(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rec    custom.record;
  v_org    uuid;
  v_type   uuid;
  v_desc   text;
  v_spec   jsonb;
  v_heal   boolean;
  v_kids   integer;
  v_row    context.scopes;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROWS ARE ITS IMAGE.
  select r.* into v_rec
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where r.id = p_scope_id and r.data_class = 'record';
  v_org := v_rec.organization_id;
  v_type := v_rec.table_id;
  -- public.restore_scope's own checks and sentences.
  if v_org is null or v_rec.deleted_at is null then
    perform platform.refuse_not_found('scope not found, or it was never removed');
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
  -- The children THIS removal took: archived with the scope's own timestamp.
  select count(*) into v_kids from custom.record c
   where c.organization_id = v_org and c.data_class = 'record'
     and c.data ->> 'parent_id' = p_scope_id::text and c.deleted_at = v_rec.deleted_at;

  select f.data ->> 'key' into v_desc from custom.record f
   where f.organization_id = v_org and f.id = custom._ctx_id('scope-column-field', v_type::text, 'description');
  v_heal := not (v_rec.data ? 'slug' and v_rec.data ? 'sort_order');
  v_spec := jsonb_build_object(
    'id', p_scope_id, 'organization_id', v_org, 'scope_type_id', v_type,
    'parent_scope_id', nullif(v_rec.data ->> 'parent_id', ''), 'name', v_rec.data -> 'name',
    'description', coalesce(v_rec.data ->> coalesce(v_desc, 'description'), ''),
    'settings', custom._ctx_scope_settings(v_org, v_type, v_rec.data),
    'slug', v_rec.data ->> 'slug', 'sort_order', nullif(v_rec.data ->> 'sort_order', '')::smallint,
    'created_by', v_rec.created_by, 'deleted_at', null);

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  if not v_heal then
    v_was := custom._ctx_mark('door');
    if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
    perform set_config('custom.context_door_row', p_scope_id::text, true);
    perform custom._ctx_store_scope(v_org, v_type, p_scope_id, v_spec);
    perform set_config('app.actor_system', v_actor, true);
    perform custom._ctx_mark(v_was);
  end if;
  perform set_config('custom.context_door_row', p_scope_id::text, true);

  -- THE IMAGE, UNMARKED: clearing the old row's deleted_at brings back, through the old cascade, every child
  -- stamped with this removal's timestamp, and the follow carries each into the store.
  update context.scopes
     set deleted_at = null, updated_by = (select auth.uid()), updated_at = now()
   where id = p_scope_id
  returning * into v_row;
  perform set_config('custom.context_door_row', '', true);
  if v_row.id is null then
    perform platform.refuse_not_found('scope not found, or it was never removed');
  end if;

  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_scope(v_org, v_type, p_scope_id, to_jsonb(v_row)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_scope_id, v_type, 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_scope_restore');
  return custom._ctx_answer(v_org, p_scope_id, jsonb_build_object('restored_children', v_kids));
end;
$function$
;

DROP FUNCTION IF EXISTS custom._ctx_scope_subtree_follows(uuid, uuid, timestamptz, boolean);
