-- draft: claude-w2w round 3 in clone proof
-- chair-step: it REPLACES the bodies of four lane-9 scope doors — custom.context_scope_archive, custom.context_scope_restore, custom.context_type_archive, custom.context_type_restore (signatures, SECURITY DEFINER, search_path and grants unchanged). None of them calls public.delete_scope / restore_scope / delete_scope_type / restore_scope_type any more or reads the old scope tables to decide: the organization, whether the row is live or removed, the removal's timestamp, the children and the counts the answer reports come from the record store; the access rules are the old functions' own, word for word (an organization owner or admin, a platform admin where the old function admitted one, or the server; no move to the store ladder, chair item CA1). The door's own row is archived or restored in the store FIRST (a type's removal excepted: the store halves never write a removed Table's rows, so there the image goes first and the Table is archived from it in the same statement), through the lane-9 store halves, named in custom.context_door_row so the follow and the store's side-effect twin leave it to the door; the old rows are then written as the IMAGE, UNMARKED, so the old tables' cascade (platform._cascade_soft_delete) takes each child scope and context field with this removal's timestamp and the follow carries every one of them into the store exactly as before; the store half is handed the image row once more, and the twin runs for the row after the old triggers. A scope or type copied before its words had a home in the store is written old row first, once. No new door, no grant, no change to the chair's record doors or the access ladder.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_scope_archive(uuid) 3fede8104d91c5daf1c45eeb88b90c0106c2bd3a84206a2d5703c689d84b4cf0
-- based-on: custom.context_scope_restore(uuid) 0354c43465def4edd8ea0b3dd6c32e3d7d63d5e0472c04bcd28bc8e0de4e2530
-- based-on: custom.context_type_archive(uuid) 5800525728f943e7df2e83541005d60c310b993d188746c3609bd9f4a89b6658
-- based-on: custom.context_type_restore(uuid) 3450e18aa8bd40bf6ca29bc206ccdd546251ae7107c4a348aa30ee9bba1563ed
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw2w_the_archive_and_restore_doors_write_the_store_first_down.sql.
-- Order: after scopesw2w_the_scope_type_door_writes_the_store_first.sql (custom.context_door_row in the follow and
-- the twin) and scopesw2w_the_scope_door_writes_the_store_first.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy archives the Sports rehab practice area with its sub-areas, restores
-- it the next week, retires the Insurance Payer scope type with all its payers and context fields, and brings it
-- back. Every decision is read from the record store and the store is written first; the old tables follow as
-- the image until wave 3 removes them, cascading to children exactly as they did.
-- Guards: scripts/campaign-tests/scopesw2w_the_archive_and_restore_doors_write_the_store_first_same_answer.sql
-- (same answer and effect for both seats and a non-member, side effects included) and the platform writers' suite.

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
$function$;

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
$function$;

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
$function$;

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
$function$;
