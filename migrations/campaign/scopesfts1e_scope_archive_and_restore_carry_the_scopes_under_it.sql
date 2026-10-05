-- chair-step: the scope archive and restore doors carry the scopes under a scope themselves, in the store, instead of leaving it to the old rows' cascade. ADDS custom._ctx_scope_subtree_follows (archive: every live scope under it takes its exact time; restore: exactly the ones that removal took, through the ones brought back; the suggestion and alert edges of platform.soft_delete_edge for a scope follow on the same time; no client grant). REPLACES custom.context_scope_archive and custom.context_scope_restore (one call each, after the door's own store write, before the old row). Same effect, rolled back on live, as admin in Cedar Ridge: a 4-scope tree (site, wing, pool, a hand-archived office) archived and restored through the doors — answers, store state, old-row state and versions equal before and after (no live nested scope exists in any organization today). Guard scripts/campaign-tests/scopesfts1e_scopes_under_a_scope_follow_it_in_the_store_red_green.sql RED (store-only children stayed live) then GREEN, admin and test@test.com.
-- lane: FINISH-THE-SWITCH (FTS-1e, scopes finish, item 2)
-- based-on: custom.context_scope_archive(uuid) 47eb54051cc0639204eb1c2c0f22e179b618d5b5c9400ec9701883f1c16f4f2b
-- based-on: custom.context_scope_restore(uuid) 1a498d1d57cf2a59bf942cc45a7ba19fa2b2ac497a1ee58bda48ce8e4285b595
-- lock: custom
--
-- Inverse: migrations/inverse/scopesfts1e_scope_archive_and_restore_carry_the_scopes_under_it_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy closes its "Downtown" site; the wing and the pool under it close with it,
-- and reopen with it.

CREATE OR REPLACE FUNCTION custom._ctx_scope_subtree_follows(p_org uuid, p_root uuid, p_when timestamptz, p_restore boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c        record;
  e        record;
  v_n      integer := 0;
  v_ids    uuid[];
  v_desc   text;
  v_was    text;
  v_actor  text := coalesce(current_setting('app.actor_system', true), '');
begin
  -- THE SCOPES UNDER A SCOPE FOLLOW IT, IN THE STORE (FTS-1e): what platform._cascade_soft_delete did through the old
  -- rows' parent_scope_id, asked of the Records' data.parent_id. Archive: every live scope under p_root takes
  -- p_root's exact archive time. Restore: exactly the ones that removal took (archived at that same time),
  -- reached through the ones brought back — a scope someone archived by hand keeps its own time and stays.
  with recursive under as (
    select r.id from custom.record r
     where r.organization_id = p_org and r.data_class = 'record' and r.data ->> 'parent_id' = p_root::text
       and case when p_restore then r.deleted_at = p_when else r.deleted_at is null end
    union
    select r.id from custom.record r join under u on r.data ->> 'parent_id' = u.id::text
     where r.organization_id = p_org and r.data_class = 'record'
       and case when p_restore then r.deleted_at = p_when else r.deleted_at is null end)
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from under;

  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  for c in select r.* from custom.record r where r.organization_id = p_org and r.id = any (v_ids) loop
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
  perform set_config('app.actor_system', v_actor, true);

  -- THE ADVICE AND ALERTS ABOUT THOSE SCOPES follow too (the scope edges of platform.soft_delete_edge other than
  -- the scope tree itself: suggestions and alerts aimed at a scope), on the same time, restored exactly.
  v_ids := v_ids || p_root;
  for e in select x.child_schema, x.child_table, x.child_column from platform.soft_delete_edge x
            where x.parent_schema = 'context' and x.parent_table = 'scopes' and x.parent_column = 'id'
              and x.action = 'cascade' and x.child_schema <> 'context' loop
    if p_restore then
      execute format('update %I.%I set deleted_at = null where %I = any ($1) and deleted_at = $2',
                     e.child_schema, e.child_table, e.child_column) using v_ids, p_when;
    else
      execute format('update %I.%I set deleted_at = $2 where %I = any ($1) and deleted_at is null',
                     e.child_schema, e.child_table, e.child_column) using v_ids, p_when;
    end if;
  end loop;
  return v_n;
end;
$function$;
revoke all on function custom._ctx_scope_subtree_follows(uuid, uuid, timestamptz, boolean) from public, anon, authenticated;

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
  -- 1b. THE SCOPES UNDER IT FOLLOW, IN THE STORE (FTS-1e), on the same time.
  perform custom._ctx_scope_subtree_follows(v_org, p_scope_id, v_now, false);
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
  -- THE SCOPES THIS REMOVAL TOOK COME BACK, IN THE STORE (FTS-1e).
  perform custom._ctx_scope_subtree_follows(v_org, p_scope_id, v_rec.deleted_at, true);
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
