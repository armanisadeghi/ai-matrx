-- chair-step: the scope doors stop writing the old rows: the type, scope and context-field write, archive and restore doors write only the store (its own side effects run with that write) and answer from the Record (ADDS custom.scope_row_of and custom.context_item_row_of, no client grant); the trash restores (public.entity_undelete, public.org_trash_restore) call the store's restore doors; the 18 old write functions are dropped with their door rows (the 58 old-row triggers and their 7 functions go in the window file scopesfts1f_the_old_scope_rows_lose_their_triggers.sql) (0 callers: bodies, triggers, views, policies, cron, five repos; the web's last callers, scopesService's old methods, were removed in the same commit). Same answer, rolled back on live, admin in Cedar Ridge and test@test.com in its own organization: every door's answer and store effect equal before and after except the scope answer gains search_engine_indexed and the context-field answer is the shape the field lists already read. Guard scripts/campaign-tests/scopesfts1f_the_scope_doors_write_no_old_row_red_green.sql RED (3 old rows per seat) then GREEN; the FTS-1d/1e/1f scope guards green with the file.
-- lane: FINISH-THE-SWITCH (FTS-1f, old-row writes off, item 3)
-- based-on: custom.context_type_write(uuid, uuid, jsonb) fccdc383fbaa6e6502773f097e75c2d05d9b3d31e6396cc33dd44a3aa26f0ddc
-- based-on: custom.context_type_archive(uuid) 3952049f5449fc85d5795660215b4a68479565428862f9d8b2cf5efa319225f7
-- based-on: custom.context_type_restore(uuid) 8d1b9ba337823856160f8dfe28b64808e076ccff2ebbbd30cb2f6f3ad750af81
-- based-on: custom.context_scope_write(uuid, uuid, uuid, jsonb) 7d1846aaf54ba4b57d4a5792d5297761285ea1e744480de6be0e1c637829ec8a
-- based-on: custom.context_scope_archive(uuid) b7712bb2497f667562df0f6c7663bd5763b56de7364791be1146893cc54f9797
-- based-on: custom.context_scope_restore(uuid) 1fd1e3817194103a90f3a3e0286bee30d3eb800890e9edabab44f7c43ecc28d1
-- based-on: custom.context_item_write(uuid, uuid, jsonb) c339d0d3185d071b918b46d87be8f54695c61621dad43c251db6ed2fb133bc23
-- based-on: custom.context_item_archive(uuid) 5bb8d63c802eb650b5c6d9abe31904b90cd94ecab836677ec97943a7a44ab758
-- based-on: custom.context_item_restore(uuid) c63c09d0d56792a675b25df477a263d00edcc0e89312fad2649226ee63954bb8
-- based-on: custom._ctx_type_subtree_follows(uuid, uuid, timestamp with time zone, boolean) 212ec0e467352dba1bd32f1f86a1fefb9261c4c3286c628a87f1b3c20e9e2e4d
-- based-on: public.entity_undelete(text, uuid) 9c504b79cc56ccb4a506bb24a170e67ad12f95b46c4fca7fe54085b2a0bf5f34
-- based-on: public.org_trash_restore(uuid, text, uuid) 21f0ce4664ba8167c4d5259032c77ef631870c38dc689df73826477e863143fe
-- lock: custom,public,context
-- window-class: none — function bodies, DROP FUNCTION and door-row deletes only; no DDL on any table.
--
-- Inverse: migrations/inverse/scopesfts1f_the_scope_doors_write_no_old_row_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy adds a "Referral Source" type, a source and a "Fax Number" field;
-- each lands in the store alone, the one home the scope pages read.


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
  -- scope-type rows (its context fields, its sub-types, its scopes, the rag suggestions aimed at it),
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


CREATE OR REPLACE FUNCTION custom.scope_row_of(p_rec custom.record)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- ONE SCOPE, AS A DOOR ANSWERS IT (FTS-1f): the shape custom.scope_rows_of gives each live scope, for one Record in
  -- any state (the write, archive and restore doors answer from the store now that no old row is written).
  select (to_jsonb(p_rec) - array['table_id', 'data', 'data_class', 'metadata'])
         || jsonb_build_object(
              'scope_type_id', p_rec.table_id,
              'parent_scope_id', coalesce(to_jsonb(nullif(p_rec.data ->> 'parent_id', '')), 'null'::jsonb),
              'name', coalesce(p_rec.data -> 'name', 'null'::jsonb),
              'description', coalesce(p_rec.data ->> coalesce((select f.data ->> 'key' from custom.record f
                                                                 where f.organization_id = p_rec.organization_id
                                                                   and f.id = custom._ctx_id('scope-column-field', p_rec.table_id::text, 'description')),
                                                               'description'), ''),
              'settings', custom._ctx_scope_settings(p_rec.organization_id, p_rec.table_id, p_rec.data),
              'slug', coalesce(p_rec.data -> 'slug', 'null'::jsonb),
              'sort_order', coalesce(nullif(p_rec.data ->> 'sort_order', '')::int, 0),
              'metadata', '{}'::jsonb,
              'published_to_web', false,
              'published_to_web_at', null,
              'published_to_web_by', null)
$function$;
revoke all on function custom.scope_row_of(custom.record) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION custom.context_item_row_of(p_field custom.record)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- ONE CONTEXT FIELD, AS A DOOR ANSWERS IT (FTS-1f): custom.scope_item_row_of (what the field lists read) with the
  -- row facts the old row's answer also carried.
  select custom.scope_item_row_of(p_field) || jsonb_build_object(
           'scope_type_id', nullif(p_field.data ->> 'entity_definition_id', '')::uuid,
           'is_active', p_field.deleted_at is null and coalesce((p_field.metadata #>> '{moved_from,carried,is_active}')::boolean, true),
           'review_interval_days', p_field.data -> 'review_interval_days',
           'depends_on', coalesce(p_field.data -> 'depends_on', '[]'::jsonb),
           'status_note', p_field.data -> 'status_note',
           'created_by', p_field.created_by, 'created_at', p_field.created_at, 'updated_at', p_field.updated_at,
           'deleted_at', p_field.deleted_at, 'version', p_field.version)
$function$;
revoke all on function custom.context_item_row_of(custom.record) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION custom.context_type_write(p_organization_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s        jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org    uuid := p_organization_id;
  v_id     uuid;
  v_parent uuid;
  v_t      custom.record;
  v_cur    jsonb;
  v_spec   jsonb;
  v_keys   text[];
  v_img    custom.record;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_type_id is null then
    if v_org is null then
      raise exception 'A new scope type needs the organization it belongs to.' using errcode = '22004';
    end if;
    perform custom.assert_scope_door(v_org, 'custom.context_type_write');
    -- public.create_scope_type's own check and sentences.
    if not (public.is_platform_admin() or iam.has_org_access(v_org)) then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    v_parent := nullif(s ->> 'parent_type_id', '')::uuid;
    if v_parent is not null and not exists (
         select 1 from custom.record t
          where t.organization_id = v_org and t.id = v_parent
            and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context') then
      raise exception 'That parent is not a scope type of this organization; pick one from the list.' using errcode = '22023', detail = 'create_scope_type: parent scope type not found in this organization';
    end if;
    v_id := pg_catalog.gen_random_uuid();
    v_keys := coalesce(array(select jsonb_array_elements_text(s -> 'default_variable_keys')), '{}'::text[]);
    v_spec := jsonb_build_object(
      'id', v_id, 'organization_id', v_org, 'parent_type_id', v_parent,
      'label_singular', s -> 'label_singular', 'label_plural', s -> 'label_plural',
      'icon', coalesce(s ->> 'icon', 'folder'), 'description', coalesce(s ->> 'description', ''),
      'color', coalesce(s ->> 'color', ''), 'sort_order', coalesce((s ->> 'sort_order')::smallint, 0::smallint),
      'max_assignments_per_entity', (s ->> 'max_assignments')::smallint, 'default_variable_keys', to_jsonb(v_keys),
      'slug', custom._ctx_scope_slug(coalesce(nullif(btrim(s ->> 'slug'), ''), s ->> 'label_plural')),
      'created_by', auth.uid(), 'deleted_at', null);
  else
    -- THE TYPE, BY ITS ID, FROM THE STORE: a live context Table (update_scope_type's "active" type).
    select t.* into v_t from custom.record t
     where t.id = p_type_id and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
       and t.deleted_at is null;
    v_org := v_t.organization_id;
    if v_org is null then
      perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
    end if;
    if (auth.role() = 'service_role' or public.is_platform_admin() or iam.has_org_access(v_org)) is not true then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    v_cur := custom.scope_type_row_of(v_t);
    v_parent := nullif(v_cur ->> 'parent_type_id', '')::uuid;
    if s ? 'parent_type_id' or (s ? 'max_assignments' and jsonb_typeof(s -> 'max_assignments') = 'null') then
      -- A PARENT MOVED OR A LIMIT CLEARED (lane SCOPES-OLD-WRITERS), decided on the store.
      perform custom.assert_scope_door(v_org, 'custom.context_type_write');
      if s ? 'parent_type_id' then
        v_parent := nullif(s ->> 'parent_type_id', '')::uuid;
      end if;
      if s ? 'parent_type_id' and v_parent is not null and (
           v_parent = p_type_id
           or not exists (select 1 from custom.record st
                           where st.organization_id = v_org and st.id = v_parent and st.table_id = custom.table_kernel_id()
                             and st.data ->> 'kept_for' = 'context' and st.deleted_at is null)
           or exists (with recursive under as (
                        select st.id from custom.record st
                         where st.organization_id = v_org and st.table_id = custom.table_kernel_id()
                           and st.data ->> 'parent_type_id' = p_type_id::text
                        union
                        select st.id from custom.record st join under u on st.data ->> 'parent_type_id' = u.id::text
                         where st.organization_id = v_org and st.table_id = custom.table_kernel_id())
                      select 1 from under where under.id = v_parent)) then
        raise exception 'That parent is not a scope type of this organization this type can sit under.'
          using errcode = '22023',
                hint = 'A scope type''s parent is another live scope type of the same organization, and never the type itself or one of its own children.';
      end if;
    end if;
    v_keys := coalesce(array(select jsonb_array_elements_text(v_cur -> 'default_variable_keys')), '{}'::text[]);
    v_spec := jsonb_build_object(
      'id', p_type_id, 'organization_id', v_org, 'parent_type_id', v_parent,
      -- A word sent as JSON null keeps the word, as update_scope_type's COALESCE did (never a raw 23502).
      'label_singular', coalesce(nullif(s -> 'label_singular', 'null'::jsonb), v_cur -> 'label_singular'),
      'label_plural', coalesce(nullif(s -> 'label_plural', 'null'::jsonb), v_cur -> 'label_plural'),
      'icon', coalesce(nullif(s -> 'icon', 'null'::jsonb), v_cur -> 'icon'),
      'description', coalesce(nullif(s -> 'description', 'null'::jsonb), v_cur -> 'description'),
      'color', coalesce(nullif(s -> 'color', 'null'::jsonb), v_cur -> 'color'),
      'sort_order', coalesce((s ->> 'sort_order')::smallint, (v_cur ->> 'sort_order')::smallint),
      -- A limit named is the limit (a null one clears it — that call takes the parent/limit path above, as
      -- before); a limit not named stays.
      'max_assignments_per_entity', case when s ? 'max_assignments' then (s ->> 'max_assignments')::smallint
                                         else (v_cur ->> 'max_assignments_per_entity')::smallint end,
      'default_variable_keys', to_jsonb(v_keys),
      'slug', custom._ctx_scope_slug(coalesce(nullif(s ->> 'slug', ''), v_cur ->> 'slug')),
      'created_by', v_t.created_by, 'deleted_at', null);
  end if;

  -- 1. THE STORE, FIRST. Marked as a scope door, so the old table's follow trigger does not copy it again.
  v_was := custom._ctx_mark('door');
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  perform custom._ctx_store_type(v_org, coalesce(v_id, p_type_id), v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  -- (FTS-1f) THE STORE IS THE ONLY HOME: no old row is written; the store's own side effects ran with its write.
  select t.* into v_img from custom.record t where t.organization_id = v_org and t.id = coalesce(v_id, p_type_id);
  if v_img.id is null then
    perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
  end if;

  if p_type_id is not null and not (s ? 'parent_type_id' or (s ? 'max_assignments' and jsonb_typeof(s -> 'max_assignments') = 'null')) then
    perform custom.assert_scope_door(v_org, 'custom.context_type_write');
  end if;
  return custom._ctx_answer(v_org, v_img.id, custom.scope_type_row_of(v_img));
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
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  -- 0. WHAT THE TYPE TAKES WITH IT, IN THE STORE (FTS-1f): its context fields, sub-types, scopes and the advice
  -- aimed at them, on this exact time, while the Table is still live.
  perform custom._ctx_type_subtree_follows(v_org, p_type_id, v_now, false);

  -- THE TYPE ITSELF, last, in the store (FTS-1f: no old row is written).
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform custom._ctx_store_type(v_org, p_type_id, custom.scope_type_row_of(v_t) || jsonb_build_object('deleted_at', v_now));
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

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
  perform custom._ctx_store_type(v_org, p_type_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);
  -- WHAT THAT REMOVAL TOOK COMES BACK, IN THE STORE (FTS-1f), now the Table is live again.
  perform custom._ctx_type_subtree_follows(v_org, p_type_id, v_t.deleted_at, true);


  perform custom.assert_client_may_reach(v_org, 'custom.context_type_restore');
  return custom._ctx_answer(v_org, p_type_id,
           jsonb_build_object('restored_scopes', v_scopes, 'restored_context_items', v_items));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_scope_write(p_organization_id uuid, p_scope_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s        jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org    uuid;
  v_type   uuid;
  v_id     uuid;
  v_parent uuid;
  v_rec    custom.record;
  v_row    custom.record;
  v_desc   text;
  v_cur    jsonb;
  v_sort   smallint;
  v_spec   jsonb;
  v_was    text;
  v_actor  text;
  v_label  text;
  v_did    text;
  v_heal   boolean := false;
  v_slug   text;
  v_place  smallint;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_scope_id is null then
    perform custom.assert_scope_door(p_organization_id, 'custom.context_scope_write');
    v_org := p_organization_id;
    -- public.create_scope's own check and sentence (ADMIN LANE: a platform admin manages any organization's scopes).
    if not (public.is_platform_admin() or iam.has_org_access(v_org)) then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    -- THE TYPE BELONGS TO THE SAME TENANT (0850): a context Table of this organization in the store
    -- (archived ones too, as create_scope's check counted them). One sentence for foreign and invented ids.
    if p_type_id is null or not exists (
         select 1 from custom.record t
          where t.organization_id = v_org and t.id = p_type_id
            and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context') then
      raise exception 'That scope type is not one of this organization''s; pick one from the list.' using errcode = '22023', detail = 'create_scope: scope type not found in this organization';
    end if;
    v_type := p_type_id;
    v_parent := nullif(s ->> 'parent_scope_id', '')::uuid;
    if v_parent is not null and not exists (
         select 1 from custom.record p
           join custom.record pt on pt.organization_id = p.organization_id and pt.id = p.table_id
                                and pt.table_id = custom.table_kernel_id() and pt.data ->> 'kept_for' = 'context'
          where p.organization_id = v_org and p.id = v_parent and p.data_class = 'record' and p.deleted_at is null) then
      raise exception 'That parent is not a scope of this organization; pick one from the list.' using errcode = '22023', detail = 'create_scope: parent scope not found in this organization';
    end if;
    -- THE NEXT PLACE AMONG ITS SIBLINGS (same type, same parent, archived ones counted), as create_scope.
    v_sort := coalesce((s ->> 'sort_order')::smallint,
      (select coalesce(max(nullif(r.data ->> 'sort_order', '')::int), 0) + 1
         from custom.record r
        where r.organization_id = v_org and r.table_id = v_type and r.data_class = 'record'
          and ((v_parent is null and nullif(r.data ->> 'parent_id', '') is null)
               or r.data ->> 'parent_id' = v_parent::text))::smallint);
    v_id := pg_catalog.gen_random_uuid();
    v_spec := jsonb_build_object(
      'id', v_id, 'organization_id', v_org, 'scope_type_id', v_type, 'parent_scope_id', v_parent,
      'name', s -> 'name', 'description', coalesce(s ->> 'description', ''),
      'settings', coalesce(s -> 'settings', '{}'::jsonb),
      'slug', custom._ctx_scope_slug(coalesce(nullif(btrim(s ->> 'slug'), ''), s ->> 'name')),
      'sort_order', v_sort, 'created_by', auth.uid(), 'deleted_at', null);
  else
    -- THE SCOPE, BY ITS ID, FROM THE STORE: a Record of a context Table (archived ones too, as before).
    select r.* into v_rec
      from custom.record r
      join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                          and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
     where r.id = p_scope_id and r.data_class = 'record';
    v_org := v_rec.organization_id;
    v_type := v_rec.table_id;
    -- public.update_scope's own check and sentence.
    if v_org is null or not (public.is_platform_admin() or iam.has_org_access(v_org)) then
      raise exception 'not authorized to update scope' using errcode = '42501',
              detail = jsonb_build_object('scope_id', p_scope_id)::text;
    end if;
    v_parent := nullif(v_rec.data ->> 'parent_id', '')::uuid;
    if s ? 'parent_scope_id' then
      -- A SCOPE MOVED UNDER ANOTHER (lane SCOPES-OLD-WRITERS), decided on the store: a live scope of the same
      -- organization, never the scope itself or one of its own descendants.
      v_parent := nullif(s ->> 'parent_scope_id', '')::uuid;
      if v_parent is not null and (
           v_parent = p_scope_id
           or not exists (select 1 from custom.record p
                            join custom.record pt on pt.organization_id = p.organization_id and pt.id = p.table_id
                                                 and pt.table_id = custom.table_kernel_id() and pt.data ->> 'kept_for' = 'context'
                           where p.organization_id = v_org and p.id = v_parent and p.data_class = 'record'
                             and p.deleted_at is null)
           or exists (with recursive under as (
                        select c.id from custom.record c
                         where c.organization_id = v_org and c.data_class = 'record' and c.data ->> 'parent_id' = p_scope_id::text
                        union
                        select c.id from custom.record c join under u on c.data ->> 'parent_id' = u.id::text
                         where c.organization_id = v_org and c.data_class = 'record')
                      select 1 from under where under.id = v_parent)) then
        raise exception 'That parent is not a scope of this organization this scope can sit under.'
          using errcode = '22023',
                hint = 'A scope''s parent is another live scope of the same organization, and never the scope itself or one of its own children.';
      end if;
    end if;
    select f.data ->> 'key' into v_desc from custom.record f
     where f.organization_id = v_org and f.id = custom._ctx_id('scope-column-field', v_type::text, 'description');
    v_desc := coalesce(v_desc, 'description');
    v_cur := custom._ctx_scope_settings(v_org, v_type, v_rec.data);
    -- A RECORD COPIED BEFORE THE SCOPE'S SLUG AND SORT ORDER HAD A HOME IN THE STORE (lane SCOPES-STORE-HOMES)
    -- does not hold them yet; its old row still does. Such a scope is written old row first, once, and the
    -- store half takes those words from it (the write-through's order), so nothing it holds is rewritten.
    v_heal := not (v_rec.data ? 'slug' and v_rec.data ? 'sort_order');
    v_slug := custom._ctx_scope_slug(coalesce(nullif(s ->> 'slug', ''), v_rec.data ->> 'slug'));
    v_place := coalesce((s ->> 'sort_order')::smallint, nullif(v_rec.data ->> 'sort_order', '')::smallint);
    v_spec := jsonb_build_object(
      'id', p_scope_id, 'organization_id', v_org, 'scope_type_id', v_type, 'parent_scope_id', v_parent,
      -- A word sent as JSON null keeps the word, as update_scope's COALESCE did.
      'name', coalesce(nullif(s -> 'name', 'null'::jsonb), v_rec.data -> 'name'),
      'description', coalesce(s ->> 'description', v_rec.data ->> v_desc, ''),
      'settings', case when s ? 'settings' then coalesce(nullif(s -> 'settings', 'null'::jsonb), v_cur) else v_cur end,
      'slug', custom._ctx_scope_slug(coalesce(nullif(s ->> 'slug', ''), v_rec.data ->> 'slug')),
      'sort_order', coalesce((s ->> 'sort_order')::smallint, nullif(v_rec.data ->> 'sort_order', '')::smallint, 0::smallint),
      'created_by', v_rec.created_by, 'deleted_at', v_rec.deleted_at);
  end if;

  -- THE PARENT RULE, in the old trigger's own class (P0001) and words (lane manager ruling H6): the refusal
  -- contract stays what it was. The store half asks the same rule again below and finds it holds.
  begin
    perform custom._ctx_scope_parent_holds(v_org, v_type, v_parent);
  exception when check_violation then
    raise exception '%', sqlerrm using errcode = 'P0001';
  end;

  -- 1. THE STORE, the only home (FTS-1f): no old row is written; the store's own side effects run with its write.
  v_was := custom._ctx_mark('door');
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  perform custom._ctx_store_scope(v_org, v_type, coalesce(v_id, p_scope_id), v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);
  select r.* into v_row from custom.record r where r.organization_id = v_org and r.id = coalesce(v_id, p_scope_id);
  if v_row.id is null then
    raise exception 'not authorized to update scope' using errcode = '42501',
            detail = jsonb_build_object('scope_id', p_scope_id)::text;
  end if;

  if p_scope_id is not null then
    perform custom.assert_scope_door(v_org, 'custom.context_scope_write');
  end if;
  select t.data ->> 'label_singular' into v_label
    from custom.record t where t.organization_id = v_org and t.id = v_type;
  return custom._ctx_answer(v_org, v_row.id, custom.scope_row_of(v_row) || jsonb_build_object('type_label', v_label));
end;
$function$;

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

  -- 1. THE STORE, the only home (FTS-1f): no old row is written; the store's own side effects run with its write.
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform custom._ctx_store_scope(v_org, v_type, p_scope_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);
  -- THE SCOPES UNDER IT FOLLOW, IN THE STORE (FTS-1e), on the same time.
  perform custom._ctx_scope_subtree_follows(v_org, p_scope_id, v_now, false);

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

  -- 1. THE STORE, the only home (FTS-1f): no old row is written; the store's own side effects run with its write.
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform custom._ctx_store_scope(v_org, v_type, p_scope_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);
  -- THE SCOPES UNDER IT FOLLOW, IN THE STORE (FTS-1e), on the same time.
  perform custom._ctx_scope_subtree_follows(v_org, p_scope_id, v_rec.deleted_at, true);

  perform custom.assert_client_may_reach(v_org, 'custom.context_scope_restore');
  return custom._ctx_answer(v_org, p_scope_id, jsonb_build_object('restored_children', v_kids));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_write(p_item_id uuid, p_scope_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s        jsonb := coalesce(p_spec, '{}'::jsonb);
  v_row    jsonb;
  v_org    uuid;
  v_type   uuid;
  v_id     uuid;
  v_f      custom.record;
  v_t      custom.record;
  v_cur    jsonb;
  v_spec   jsonb;
  v_sort   smallint;
  v_img    custom.record;
  v_rowupdate boolean := false;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_item_id is null then
    -- public.create_context_item's own checks and sentences, on the store Table.
    select t.* into v_t from custom.record t
     where t.id = p_scope_type_id and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
       and t.deleted_at is null;
    v_org := v_t.organization_id;
    v_type := p_scope_type_id;
    if v_org is null then
      perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id));
    end if;
    if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
      raise exception 'organization admin required for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    perform context.validate_dataset_template_source(
      case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end, v_org);
    -- THE NEXT PLACE among the type's active context fields (the store keeps sort + 2).
    v_sort := coalesce((s ->> 'sort_order')::smallint,
      (select (coalesce(max(nullif(f.data ->> 'sort', '')::int - 2), 0) + 1)::smallint
         from custom.record f
        where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
          and f.data ->> 'entity_definition_id' = v_type::text and f.deleted_at is null
          and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items'
          and coalesce((f.metadata #>> '{moved_from,carried,is_active}')::boolean, true)));
    v_id := pg_catalog.gen_random_uuid();
    v_spec := jsonb_build_object(
      'id', v_id, 'scope_type_id', v_type, 'key', s -> 'key', 'display_name', s -> 'display_name',
      'description', coalesce(s ->> 'description', ''), 'category', s -> 'category',
      'value_type', coalesce(s ->> 'value_type', 'string'), 'fetch_hint', coalesce(s ->> 'fetch_hint', 'on_demand'),
      'sensitivity', coalesce(s ->> 'sensitivity', 'internal'), 'status', 'active', 'source_type', 'manual',
      'tags', coalesce(s -> 'tags', '[]'::jsonb), 'slug', custom._ctx_scope_slug(s ->> 'key'), 'sort_order', v_sort,
      'created_by', auth.uid(),
      'allowed_reference_types', case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then s -> 'allowed_reference_types' end,
      'max_items', coalesce((s ->> 'max_items')::int, 1),
      'allowed_scope_type_ids', case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then s -> 'allowed_scope_type_ids' end,
      'reference_source', case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end,
      'is_active', true, 'deleted_at', null, 'depends_on', '[]'::jsonb);
  else
    -- THE FIELD, BY ITS ID, FROM THE STORE (any state), and its Table.
    select f.* into v_f from custom.record f
      join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                          and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
     where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
    v_org := v_f.organization_id;
    v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
    v_rowupdate := exists (select 1 from jsonb_each(s) e where jsonb_typeof(e.value) = 'null')
                   or s ?| array['custom_component', 'review_interval_days', 'allowed_reference_types', 'max_items',
                                 'allowed_scope_type_ids', 'reference_source'];
    if v_rowupdate then
      -- THE ROW POLICY'S OWN QUESTION, BY NAME (lane SCOPES-OLD-WRITERS): a platform admin, or an admin of the
      -- field's organization; a field the caller may not change answers exactly as a missing one.
      if v_org is null or not (public.is_platform_admin() or coalesce(iam.has_org_admin(v_org), false)) then
        raise exception 'There is no such context field you may change.' using errcode = '42501',
            detail = jsonb_build_object('item_id', p_item_id)::text;
      end if;
    else
      -- public.update_context_item's own checks and sentences: an active field.
      if v_org is null or v_f.deleted_at is not null then
        perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
      end if;
      if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
        raise exception 'organization admin required for this organization' using errcode = '42501',
                detail = jsonb_build_object('org', v_org)::text;
      end if;
    end if;
    -- The field's words in the old shape, from the store, with what the caller changed applied as the old
    -- statement applies it (named keys on the row path; non-null words on the plain path).
    v_cur := custom.scope_item_row_of(v_f) || jsonb_build_object(
      'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', v_f.deleted_at,
      'is_active', coalesce((v_f.metadata #>> '{moved_from,carried,is_active}')::boolean, true),
      'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
      'status_note', v_f.data -> 'status_note', 'source_type', 'manual');
    if v_rowupdate then
      select v_cur || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_spec
        from jsonb_each(s) e
       where e.key in ('display_name', 'description', 'category', 'value_type', 'fetch_hint', 'sensitivity', 'tags',
                       'sort_order', 'status', 'status_note', 'custom_component', 'review_interval_days',
                       'allowed_reference_types', 'max_items', 'allowed_scope_type_ids', 'reference_source');
      if s ? 'max_items' then
        v_spec := v_spec || jsonb_build_object('max_items', coalesce((s ->> 'max_items')::int, 1));
      end if;
    else
      select v_cur || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_spec
        from jsonb_each(s) e
       where e.key in ('display_name', 'description', 'category', 'value_type', 'fetch_hint', 'sensitivity', 'tags',
                       'sort_order', 'status', 'status_note')
         and jsonb_typeof(e.value) <> 'null';
    end if;
  end if;

  -- 1. THE STORE, the only home (FTS-1f): no old row is written; its own side effects run with its write.
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform custom._ctx_store_item(v_org, v_type, coalesce(v_id, p_item_id), v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  select f.* into v_img from custom.record f where f.organization_id = v_org and f.id = coalesce(v_id, p_item_id);
  if v_img.id is null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;

  v_row := custom.context_item_row_of(v_img);
  perform custom.assert_client_may_reach(v_org, 'custom.context_item_write');
  return custom._ctx_answer(v_org, v_img.id, v_row);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_archive(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f      custom.record;
  v_org    uuid;
  v_type   uuid;
  v_spec   jsonb;
  v_img    custom.record;
  v_was    text;
  v_actor  text;
  v_did    text;
  v_now    timestamptz := now();
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  select f.* into v_f from custom.record f
    join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
  v_org := v_f.organization_id;
  v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
  -- public.delete_context_item's own checks and sentences.
  if v_org is null or v_f.deleted_at is not null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;
  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org', v_org)::text;
  end if;
  v_spec := custom.scope_item_row_of(v_f) || jsonb_build_object(
    'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', v_now, 'is_active', false,
    'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
    'status_note', v_f.data -> 'status_note', 'source_type', 'manual');

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform custom._ctx_store_item(v_org, v_type, p_item_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  select f.* into v_img from custom.record f where f.organization_id = v_org and f.id = p_item_id;

  perform custom.assert_client_may_reach(v_org, 'custom.context_item_archive');
  return custom._ctx_answer(v_org, p_item_id, jsonb_build_object('id', v_img.id, 'deleted_at', v_img.deleted_at));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_restore(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f      custom.record;
  v_org    uuid;
  v_type   uuid;
  v_spec   jsonb;
  v_img    custom.record;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  select f.* into v_f from custom.record f
    join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
  v_org := v_f.organization_id;
  v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
  -- public.restore_context_item's own checks and sentences.
  if v_org is null then
    perform platform.refuse_not_found(format('context item %s not found', p_item_id));
  end if;
  if v_f.deleted_at is null and coalesce((v_f.metadata #>> '{moved_from,carried,is_active}')::boolean, true) then
    perform custom.assert_client_may_reach(v_org, 'custom.context_item_restore');
    return custom._ctx_answer(v_org, p_item_id,
             jsonb_build_object('id', p_item_id, 'restored', false, 'detail', 'It is already in use.'));
  end if;
  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org', v_org)::text;
  end if;
  v_spec := custom.scope_item_row_of(v_f) || jsonb_build_object(
    'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', null, 'is_active', true,
    'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
    'status_note', v_f.data -> 'status_note', 'source_type', 'manual');

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform custom._ctx_store_item(v_org, v_type, p_item_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  select f.* into v_img from custom.record f where f.organization_id = v_org and f.id = p_item_id;

  perform custom.assert_client_may_reach(v_org, 'custom.context_item_restore');
  return custom._ctx_answer(v_org, p_item_id, jsonb_build_object('id', v_img.id, 'restored', true));
end;
$function$;

CREATE OR REPLACE FUNCTION public.entity_undelete(p_token text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- lane TRASH-TABLES: token `record` (custom.record — every Table and Record of the record store) is
-- restored by custom.record_restore(organization, id): the store's ladder decides (42501 when the
-- caller may not change it) and the archive event brings back exactly what it took. The organization
-- is read FROM THE ROW, never from the caller.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) brings the
-- parent back first, through this same door, so a child is never left live under a removed parent
-- (platform._guard_soft_delete_parent would refuse it anyway). Kinds with their own restore door go
-- through it and never a raw update: folder -> public.restore_folder (its subfolders and files),
-- scope type -> custom.context_type_restore, scope -> custom.context_scope_restore, scope type Field ->
-- custom.context_item_restore, library document -> rag.fn_restore_library_document (its chunks and
-- data-store memberships), HR employee -> public.hr_employee_restore (HR's gate and audit).
-- lane STORE-RESTORE-DOORS: a record-store row goes through its own class's door
-- (public._trash_store_restore: custom.field_restore, rule_restore, relation_restore, doc_template_restore,
-- dashboard_restore; a Table or Record custom.record_restore); a mandate through mandate.definition_restore.
-- lane DOORS-DECIDE-LAST: a Meeting through communication.meet_restore_meeting (Meet's host / co-host rule).
declare
  v_s text;
  v_t text;
  v_feature_owned_restore boolean;
  v_n int;
  v_org uuid;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_at timestamptz;
  v_found boolean;
  v_res jsonb;
  v_detail text;
  v_col text;
  v_val text;
  v_noun text;
begin
  -- A passage link (anchored_to association) is a filtered trash kind with its own door.
  if p_token = 'passage_link' then
    perform public.passage_link_restore(p_id);
    return true;
  end if;

  if p_token = 'record' then
    select r.organization_id into v_org
      from custom.record r
     where r.id = p_id and r.deleted_at is not null;
    if v_org is null then
      return false;
    end if;
    perform public._trash_store_restore(v_org, p_id);
    return true;
  end if;

  select schema_name, table_name, feature_owned_restore
    into v_s, v_t, v_feature_owned_restore
    from platform.entity_types
   where token = p_token;

  if v_s is null then
    raise exception 'unknown token %', p_token using errcode = '22023';
  end if;
  if coalesce(v_feature_owned_restore, false) then
    raise exception 'entity % requires feature-owned restoration', p_token using errcode = '42501';
  end if;
  execute format('select true, t.deleted_at from %I.%I t where t.id = $1', v_s, v_t)
    into v_found, v_at using p_id;
  if not coalesce(v_found, false) or v_at is null then
    return false;
  end if;

  -- The parent first: a child of an archived parent only comes back with it.
  for v_i in 1..8 loop
    v_pid := null;
    select ap.parent_token, ap.parent_id into v_ptok, v_pid
      from platform.archived_parent_of(p_token, p_id) ap limit 1;
    exit when v_pid is null;
    perform public.entity_undelete(v_ptok, v_pid);
  end loop;

  execute format('select t.deleted_at from %I.%I t where t.id = $1', v_s, v_t) into v_at using p_id;
  if v_at is null then
    -- It came back with its parent. A Field comes back in use.
    if p_token = 'context_item' then
      perform custom.context_item_restore(p_id);
    end if;
    return true;
  end if;

  case p_token
    when 'folder' then perform public.restore_folder(p_id); return true;
    when 'scope_type' then perform custom.context_type_restore(p_id); return true;
    when 'scope' then perform custom.context_scope_restore(p_id); return true;
    when 'context_item' then perform custom.context_item_restore(p_id); return true;
    when 'processed_document' then perform rag.fn_restore_library_document(p_id); return true;
    when 'mandate' then perform mandate.definition_restore(p_id); return true;
    when 'team' then perform public.team_restore(p_id); return true;
    -- lane DOORS-DECIDE-LAST: a Meeting comes back through Meet's own door (host or co-host; its
    -- invitations and occurrence exceptions return with it by the cascade edge).
    when 'meet_meeting' then perform communication.meet_restore_meeting(p_id, null); return true;
    -- A passage comment (and its suggestion / reply rows) comes back through its own door: author or record admin.
    when 'comment' then perform public.cmt_restore(p_id); return true;
    when 'hr_employee' then
      v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
      if not coalesce((v_res ->> 'ok')::boolean, false) then
        raise exception '%', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                      'HR did not allow this person to be restored.')
          using errcode = '42501';
      end if;
      return true;
    else null;
  end case;

  -- 1347: a client_read_only type is changed only through its own doors.
  if iam.is_client_lane() and exists (select 1 from platform.entity_types et
                                       where et.token = p_token and et.client_read_only) then
    raise exception 'a % is changed only through the screen that manages it', p_token using errcode = '42501';
  end if;

  if not iam.has_access(p_token, p_id, 'editor') then
    raise exception 'access denied' using errcode = '42501';
  end if;

  -- A removed row stops holding its name (db-rules §8, DD-121): while it sat in
  -- Trash a live row may have taken the same name/slug. Restoring it then hits
  -- the live-only unique index; say which name is taken and what to do, never
  -- a raw 23505 (the code stays 23505 so callers can still tell).
  begin
    execute format('UPDATE %I.%I SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL', v_s, v_t)
      using p_id;
  exception when unique_violation then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_col := substring(v_detail from 'Key \(([^)]*)\)=');
    v_val := substring(v_detail from '\)=\((.*)\) already exists');
    select lower(coalesce(nullif(btrim(et.label), ''), p_token)) into v_noun
      from platform.entity_types et where et.token = p_token;
    raise exception using
      errcode = '23505',
      message = format('This %s can''t be restored: another %s already uses the %s "%s".',
                       v_noun, v_noun, coalesce(v_col, 'same name'), coalesce(v_val, '')),
      detail  = v_detail,
      hint    = format('Rename the other %s (or give it a different %s), then restore this one.',
                       v_noun, coalesce(v_col, 'name'));
  end;
  get diagnostics v_n = row_count;
  if v_n > 0 and p_token = 'workflow' then
    perform workflow.restore_triggers_archived_with(p_id, v_at);
  end if;
  return v_n > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.org_trash_restore(p_organization_id uuid, p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. An owner or admin of the organization restores one member's archived item that sits
-- in THIS organization. One audit row (iam.org_admin_audit, action trash.restore) and, when the item
-- is somebody else's, an in-app notice to its owner. Never a purge.
-- lane TRASH-TABLES: a record-store Table or Record (token `record`) is restored by
-- custom.record_restore, which asks the store's own ladder for the caller and brings back exactly what
-- its archive took; a refusal is returned as restored=false with the store's sentence.
-- lane TRASH-COVERAGE-2: a row whose parent is archived brings the parent back first, through this
-- same door (audited and noticed as the parent). Kinds with their own restore door go through it:
-- folder (public.restore_folder), scope type (custom.context_type_restore), scope (custom.context_scope_restore),
-- scope type Field (custom.context_item_restore), library document (rag.fn_restore_library_document),
-- HR employee (public.hr_employee_restore); a door's
-- refusal is restored=false with a sentence, never a raw update around it.
-- lane STORE-RESTORE-DOORS: a Field, Rule, link, document template or dashboard (token `record`) goes
-- through its own store door (public._trash_store_restore) and a mandate through
-- mandate.definition_restore; the door's own refusal sentence is the answer.
-- lane DOORS-DECIDE-LAST: a Meeting through communication.meet_restore_meeting.
-- lane SCOPES-READS-REST (2026-09-29): a scope type, scope or context item is found, titled and
-- parented from the record store (its context Table, Record or Field), never from context.*; it is
-- still restored through its own door (custom.context_type_restore / context_scope_restore / context_item_restore).
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  e record;
  v_rel regclass;
  v_title_col text;
  v_owner uuid;
  v_title text;
  v_label text;
  v_me_name text;
  v_org_name text;
  v_subject text;
  v_body text;
  v_class text;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_ptitle text;
  v_via_parent boolean := false;
  v_res jsonb;
  v_at timestamptz;
  v_title_expr text;
  v_found boolean;
  v_n int;
  v_why text;
  v_ctx boolean;
begin
  if p_token = 'record' then
    select r.created_by, r.data_class,
           case when r.data_class = 'table'
                then coalesce(nullif(btrim(r.data ->> 'name'), ''), 'Untitled table')
                when r.data_class = 'record'
                then coalesce(nullif(btrim(custom.record_words(r.organization_id, r.id)), ''), 'Untitled record')
                else coalesce(public._trash_store_title(r.organization_id, r.id), 'Untitled') end
      into v_owner, v_class, v_title
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id
       and r.deleted_at is not null
       and r.data_class in ('table', 'record', 'field', 'rule', 'relation', 'doc_template', 'dashboard');
    if not found then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;
    begin
      perform public._trash_store_restore(p_organization_id, p_id);
    exception
      when insufficient_privilege then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      when check_violation or unique_violation or no_data_found or raise_exception then
        get stacked diagnostics v_why = message_text;
        return jsonb_build_object('restored', false, 'message', v_why);
    end;
    v_label := case v_class when 'table' then 'Table' when 'record' then 'Record' when 'field' then 'Field'
                            when 'rule' then 'Rule' when 'relation' then 'Link'
                            when 'doc_template' then 'Document template' else 'Dashboard' end;
    select 'record'::text as token, v_label as label into e;
  else
    select t.token, t.user_artifact_kind, t.label, t.schema_name, t.table_name,
           coalesce(t.retention_owner_column, 'created_by') as owner_col, t.title_column, t.feature_owned_restore
      into e
      from platform.entity_types t
     where t.token = p_token and t.is_active and t.user_artifact_kind is not null;
    if not found then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;
    if coalesce(e.feature_owned_restore, false) or e.token in ('credential_item', 'user_secret', 'credential_attachment') then
      raise exception 'Vault items are restored by their owner from their own Trash.' using errcode = '42501';
    end if;
    v_ctx := e.schema_name = 'context' and e.token in ('scope_type', 'scope', 'context_item');
    v_rel := case when v_ctx then null else to_regclass(format('%I.%I', e.schema_name, e.table_name)) end;
    if v_rel is null and not v_ctx then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;

    select a.attname into v_title_col from pg_attribute a
     where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
       and a.attname = any (array['label_plural', coalesce(e.title_column, '')])
     order by (a.attname <> 'label_plural') limit 1;
    if v_title_col is null then
      select a.attname into v_title_col from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
       order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
       limit 1;
    end if;

    v_title_expr := case when v_title_col is null then 'null::text' else format('left(t.%I::text, 200)', v_title_col) end;

    -- The parent first: a child of an archived parent only comes back with it.
    for v_i in 1..8 loop
      v_pid := null;
      if v_ctx then
        -- a scope's or a context item's parent is the context Table it sits in, when archived
        select 'scope_type'::text, k.id, left(k.data ->> 'label_plural', 200) into v_ptok, v_pid, v_ptitle
          from custom.record x
          join custom.record k
            on k.organization_id = x.organization_id and k.data_class = 'table'
           and k.data ->> 'kept_for' = 'context' and k.deleted_at is not null
           and k.id = case x.data_class when 'record' then x.table_id
                                        else nullif(x.data ->> 'entity_definition_id', '')::uuid end
         where e.token in ('scope', 'context_item') and x.id = p_id
           and x.data_class = case e.token when 'scope' then 'record' else 'field' end
         limit 1;
      else
      select ap.parent_token, ap.parent_id, ap.parent_title into v_ptok, v_pid, v_ptitle
        from platform.archived_parent_of(e.token, p_id) ap limit 1;
      end if;
      exit when v_pid is null;
      if not exists (select 1 from platform.entity_types t
                      where t.token = v_ptok and t.is_active and t.user_artifact_kind is not null) then
        return jsonb_build_object('restored', false,
          'message', format('It is inside %s, which is archived and is not in this organization''s Trash. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_ptitle), ''), 'something')));
      end if;
      v_res := public.org_trash_restore(p_organization_id, v_ptok, v_pid);
      if not coalesce((v_res ->> 'restored')::boolean, false) then
        return v_res;
      end if;
      v_via_parent := true;
    end loop;

    -- The row, in THIS organization (a scope type's Field reads its organization from its scope type).
    if v_ctx then
      select true, x.created_by,
             left(case e.token when 'scope_type' then x.data ->> 'label_plural'
                               when 'scope' then x.data ->> 'name'
                               else x.data ->> 'label' end, 200),
             x.deleted_at
        into v_found, v_owner, v_title, v_at
        from custom.record x
        join custom.record k
          on k.organization_id = x.organization_id and k.data_class = 'table'
         and k.data ->> 'kept_for' = 'context'
         and k.id = case e.token when 'scope_type' then x.id
                                 when 'scope' then x.table_id
                                 else nullif(x.data ->> 'entity_definition_id', '')::uuid end
       where x.id = p_id and x.organization_id = p_organization_id
         and x.data_class = case e.token when 'scope_type' then 'table'
                                         when 'scope' then 'record' else 'field' end;
    else
      execute format('select true, t.%I, %s, t.deleted_at from %I.%I t where t.id = $1 and t.organization_id = $2',
                     e.owner_col, v_title_expr, e.schema_name, e.table_name)
        into v_found, v_owner, v_title, v_at
        using p_id, p_organization_id;
    end if;
    if not coalesce(v_found, false) or (v_at is null and not v_via_parent) then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;

    if v_at is null then
      -- It came back with its parent (audited and noticed there). A Field comes back in use.
      if e.token = 'context_item' then
        perform custom.context_item_restore(p_id);
      end if;
      return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
        'message', format('%s came back with %s.', coalesce(nullif(btrim(v_title), ''), e.label),
                          coalesce(nullif(btrim(v_ptitle), ''), 'what it sits in')));
    end if;

    if e.token in ('folder', 'scope_type', 'scope', 'context_item', 'processed_document', 'hr_employee', 'mandate', 'meet_meeting') then
      begin
        case e.token
          when 'folder' then perform public.restore_folder(p_id);
          when 'scope_type' then perform custom.context_type_restore(p_id);
          when 'scope' then perform custom.context_scope_restore(p_id);
          when 'context_item' then perform custom.context_item_restore(p_id);
          when 'processed_document' then perform rag.fn_restore_library_document(p_id);
          when 'mandate' then perform mandate.definition_restore(p_id);
          -- lane DOORS-DECIDE-LAST: a Meeting through Meet's own door (host or co-host).
          when 'meet_meeting' then perform communication.meet_restore_meeting(p_id, null);
          when 'hr_employee' then
            v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
            if not coalesce((v_res ->> 'ok')::boolean, false) then
              return jsonb_build_object('restored', false,
                'message', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                    'Only someone HR allows to restore this person can bring them back.'));
            end if;
        end case;
      exception when insufficient_privilege or raise_exception or no_data_found then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      end;
    else
      execute format(
        'update %I.%I t set deleted_at = null
          where t.id = $1 and t.organization_id = $2 and t.deleted_at is not null
          returning t.%I, %s',
        e.schema_name, e.table_name, e.owner_col, v_title_expr)
        into v_owner, v_title
        using p_id, p_organization_id;
      get diagnostics v_n = row_count;

      -- (EXECUTE never sets FOUND; the row count is the answer.)
      if v_n = 0 then
        return jsonb_build_object('restored', false,
          'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
      end if;
      if e.token = 'workflow' then
        perform workflow.restore_triggers_archived_with(p_id, v_at);
      end if;
    end if;
    v_label := e.label;
  end if;

  perform iam._org_audit(p_organization_id, v_owner, 'trash.restore',
    jsonb_build_object('entity_token', e.token, 'id', p_id, 'label', v_label, 'title', v_title));

  if v_owner is not null and v_owner is distinct from v_me then
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(btrim(u.email), ''), 'An organization admin')
      into v_me_name from auth.users u where u.id = v_me;
    select coalesce(nullif(btrim(o.name), ''), 'your organization') into v_org_name
      from iam.organizations o where o.id = p_organization_id;
    v_subject := format('%s restored your %s', coalesce(v_me_name, 'An organization admin'), lower(v_label));
    v_body := format('%s restored "%s" from %s''s Trash. It is back where it was.',
                     coalesce(v_me_name, 'An organization admin'),
                     coalesce(nullif(btrim(v_title), ''), 'Untitled'), coalesce(v_org_name, 'your organization'));
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind,
       dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
    values
      (p_organization_id, 'trash.restored_by_org_admin', 'in_app', v_owner, 'user',
       format('trash.restore:%s:%s:%s', e.token, p_id, extract(epoch from clock_timestamp())::bigint),
       v_subject, left(v_body, 600),
       jsonb_build_object('entity_token', e.token, 'id', p_id, 'by', v_me, 'source', 'org_trash_restore',
                          'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
       e.token, p_id, null, 'personal'::platform.visibility)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
    'message', format('%s restored.', coalesce(nullif(btrim(v_title), ''), v_label)));
end;
$function$;


-- Their door rows go with them (platform.client_callable_door: no client lane to a function that is gone).
delete from platform.client_callable_door where id = '8b1b5d65-d5b9-4d95-8d6f-2f36e8477c9e';
delete from platform.client_callable_door where id = '7b832fc5-5c71-4b2e-b97c-1e2562bd2b38';
delete from platform.client_callable_door where id = 'caf639d0-97c7-40d0-873a-c7f31f9f4a82';
delete from platform.client_callable_door where id = '6e448141-237b-4547-8b9d-303946e44a27';
delete from platform.client_callable_door where id = '52c1f978-b93e-4b36-a9ea-d0c6a20d563b';
delete from platform.client_callable_door where id = '37c2e763-b7d0-40c5-8bd0-859ec169208e';
delete from platform.client_callable_door where id = 'ee68223d-7d26-4c45-a537-c311696af86e';
delete from platform.client_callable_door where id = '1ae3a5b9-8b68-4ad7-bb16-aa023e57ea29';
delete from platform.client_callable_door where id = '0913d994-5d69-42ea-9610-22c42aed26ee';
delete from platform.client_callable_door where id = 'a1e1bf02-40e6-4a8e-b22d-bbbc4e8b907a';
delete from platform.client_callable_door where id = '717f9d9e-a100-4ff4-84a4-813f3eb8fef0';
delete from platform.client_callable_door where id = '3216a73b-0038-4cf7-b5c5-36895b469292';
delete from platform.client_callable_door where id = '9d8e63ca-cddb-4bfd-8fb3-e6f8341f9a36';
delete from platform.client_callable_door where id = '80b318b6-de88-4005-ac2b-db32fb010954';
delete from platform.client_callable_door where id = '6432f3c3-dff8-4756-82a6-b805a9d5cdc5';

-- THE OLD WRITE FUNCTIONS: no caller left (bodies, triggers, views, policies, cron, repos).
DROP FUNCTION context.index_reference_value(uuid,uuid,uuid,text);
DROP FUNCTION context.provision_scope_dataset(uuid,uuid);
DROP FUNCTION context.validate_reference_value(uuid,text);
DROP FUNCTION context.write_context_value(uuid,uuid,text,numeric,boolean,jsonb,date,text,timestamp with time zone,time without time zone,text,text,uuid);
DROP FUNCTION create_context_item(uuid,text,text,context_value_type,text,text,context_fetch_hint,context_sensitivity,text[],text,smallint,text[],integer,uuid[],jsonb);
DROP FUNCTION create_scope_type(uuid,text,text,uuid,text,text,smallint,smallint,text[],text,text);
DROP FUNCTION create_scope(uuid,uuid,text,uuid,text,jsonb,text,smallint);
DROP FUNCTION delete_context_item(uuid);
DROP FUNCTION delete_scope_type(uuid);
DROP FUNCTION delete_scope(uuid);
DROP FUNCTION restore_context_item(uuid);
DROP FUNCTION restore_scope_type(uuid);
DROP FUNCTION restore_scope(uuid);
DROP FUNCTION set_context_value(jsonb);
DROP FUNCTION set_scope_context_value(uuid,uuid,text,numeric,boolean,jsonb,text,date,timestamp with time zone,time without time zone,text);
DROP FUNCTION update_context_item(uuid,text,text,text,context_value_type,context_fetch_hint,context_sensitivity,text[],smallint,context_item_status,text);
DROP FUNCTION update_scope_type(uuid,text,text,text,text,smallint,smallint,text,text);
DROP FUNCTION update_scope(uuid,text,text,jsonb,text,smallint);
