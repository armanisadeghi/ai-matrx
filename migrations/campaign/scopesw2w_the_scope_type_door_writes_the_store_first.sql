-- draft: claude-w2w H1-H6 fixes in clone proof
-- chair-step: it REPLACES the body of one lane-9 scope door, custom.context_type_write (signature, SECURITY DEFINER, search_path and grants unchanged). The door no longer calls public.create_scope_type / public.update_scope_type and no longer reads context.scope_types to decide anything: the organization, the parent type, the descendants and the current words come from the store Table (custom.scope_type_row_of); the access predicates are the old functions' own, word for word (no move to the store ladder, chair item CA1). The store Table is written FIRST through the lane-9 store half custom._ctx_store_type (marked as a scope door, and named in custom.context_door_row so the store's side-effect twin holds this row back); the old context.scope_types row is then written as the IMAGE with the store's words, so its own triggers queue the suggestion sweep, sync the search index and provision exactly as before; the store half is handed the image row once more (in steady state it changes nothing); and the twin then runs for the row, after the old triggers, as it did when the old row was the writer — one sweep, one notification. A word sent as JSON null keeps the word; a type only the store holds answers "active scope type … not found" as before. It also REPLACES custom._context_side_effects (the lane-9 twin of the old tables' side effects) so it skips the one row a store-first door names; the scope door (scopesw2w_the_scope_door_writes_the_store_first.sql) relies on it, so this file goes first. No new door, no grant, no change to the chair's record doors or the access ladder.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_type_write(uuid, uuid, jsonb) d1e11f9ced7a5ac3d98eee5f73e2f01e03ec703a1afc9c56f2cb56006dc9e08c
-- based-on: custom._context_side_effects(jsonb) b4d564356117d6de7d985cef7a8c1d1db6178d8c9826ccd4c4ad49b14a701652
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw2w_the_scope_type_door_writes_the_store_first_down.sql.
-- Order: after scopesw2w_a_scope_type_under_a_type_keeps_its_parent_in_the_store.sql (this door reads the type
-- parent through custom.scope_type_row_of); before scopesw2w_the_scope_door_writes_the_store_first.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy adds an Insurance Payer scope type, files Plan Tier under it,
-- renames it, caps it at one per patient and clears the cap again — every decision and the first write in
-- the record store, the old table receiving the same row as an image until wave 3 removes it.
-- Guard (same answer, same effect, both seats and a non-member, against the old body):
-- scripts/campaign-tests/scopesw2w_the_scope_type_door_writes_the_store_first_same_answer.sql.

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
  v_img    context.scope_types;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_type_id is null then
    if v_org is null then
      raise exception 'A new scope type needs the organization it belongs to.' using errcode = '22004';
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
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
      raise exception 'create_scope_type: parent scope type not found in this organization' using errcode = '22023';
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
      perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
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
  perform set_config('custom.context_door_row', coalesce(v_id, p_type_id)::text, true);
  perform custom._ctx_store_type(v_org, coalesce(v_id, p_type_id), v_spec);
  perform set_config('custom.context_door_row', '', true);
  perform set_config('app.actor_system', v_actor, true);

  -- 2. THE IMAGE: the old row with the store's words.
  if p_type_id is null then
    insert into context.scope_types (id, organization_id, parent_type_id, label_singular, label_plural, icon, description,
                                     sort_order, max_assignments_per_entity, default_variable_keys, color, slug)
    values (v_id, v_org, v_parent, v_spec ->> 'label_singular', v_spec ->> 'label_plural', v_spec ->> 'icon',
            v_spec ->> 'description', (v_spec ->> 'sort_order')::smallint,
            (v_spec ->> 'max_assignments_per_entity')::smallint, v_keys, v_spec ->> 'color', v_spec ->> 'slug')
    returning * into v_img;
  else
    update context.scope_types t
       set parent_type_id = v_parent,
           label_singular = v_spec ->> 'label_singular',
           label_plural = v_spec ->> 'label_plural',
           icon = v_spec ->> 'icon',
           description = v_spec ->> 'description',
           sort_order = (v_spec ->> 'sort_order')::smallint,
           max_assignments_per_entity = (v_spec ->> 'max_assignments_per_entity')::smallint,
           color = v_spec ->> 'color',
           slug = v_spec ->> 'slug',
           updated_at = now()
     where t.id = p_type_id
    returning * into v_img;
    if v_img.id is null then
      -- A type only the store holds answers as update_scope_type always answered it (the store write above
      -- goes back with this refusal).
      perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
    end if;
  end if;

  -- 3. THE IMAGE'S OWN WORDS BACK (the old triggers fill a few columns). In steady state this changes nothing.
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  v_did := custom._ctx_store_type(v_org, v_img.id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  -- 4. THE STORE'S OWN SIDE EFFECTS, AFTER THE OLD ROW'S (the order of the days the old row was the writer):
  -- the twin was held back for this row in step 1; when step 3 changed nothing it has not run, so it runs now.
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(
      v_org, v_img.id, custom.table_kernel_id(), case when p_type_id is null then 'created' else 'updated' end)));
  end if;

  if p_type_id is not null and not (s ? 'parent_type_id' or (s ? 'max_assignments' and jsonb_typeof(s -> 'max_assignments') = 'null')) then
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
  end if;
  return custom._ctx_answer(v_org, v_img.id, to_jsonb(v_img));
end;
$function$;

CREATE OR REPLACE FUNCTION custom._context_side_effects(p_events jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_tk constant uuid := '11111111-0000-4000-8000-000000000001';   -- custom.table_kernel_id()
  c_fk constant uuid := '11111111-0000-4000-8000-000000000002';   -- custom.field_kernel_id()
  e      record;
  r      custom.record;
  x      record;
  v_type uuid;
  v_key  text;
  v_rs   jsonb;
  v_held uuid;
begin
  -- WHICH EVENTS ARE ABOUT THE CONTEXT SYSTEM: a Record in a Table kept for context (a scope), a Table
  -- kept for context (a scope type), a Field of one (a context field). A Table record that is gone
  -- (purged) is carried too, so its search row can go; everything else is left alone at the cost of
  -- one primary-key read per event.
  -- LANE 9 W2-W: A STORE-FIRST SCOPE DOOR HOLDS ITS OWN ROW BACK. The door writes the store first and the old
  -- row second; the old row's own triggers (the sweep wake, the search sync, the dataset provisioning) must run
  -- first, as they did when the old row was the writer, so the door names its row here for its first store
  -- write and runs this twin for it itself once the old row is written (custom.context_scope_write,
  -- custom.context_type_write). Every other event, and every other row in the same statement, is unchanged.
  v_held := nullif(current_setting('custom.context_door_row', true), '')::uuid;
  for e in
    select ev.org, ev.id, ev.table_id, bool_or(ev.operation = 'created') as created
      from (select (je ->> 0)::uuid as org, (je ->> 1)::uuid as id, (je ->> 2)::uuid as table_id, je ->> 3 as operation
              from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) je) ev
     where case
             when ev.table_id = c_tk then
               not exists (select 1 from custom.record t where t.organization_id = ev.org and t.id = ev.id)
               or exists (select 1 from custom.record t where t.organization_id = ev.org and t.id = ev.id
                            and t.data ->> 'kept_for' = 'context')
             when ev.table_id = c_fk then
               exists (select 1 from custom.record f
                         join custom.record t on t.organization_id = f.organization_id
                                             and t.id::text = f.data ->> 'entity_definition_id'
                                             and t.table_id = c_tk and t.data ->> 'kept_for' = 'context'
                        where f.organization_id = ev.org and f.id = ev.id)
             else
               exists (select 1 from custom.record t where t.organization_id = ev.org and t.id = ev.table_id
                         and t.table_id = c_tk and t.data ->> 'kept_for' = 'context')
           end
       and ev.id is distinct from v_held
     group by 1, 2, 3
  loop
    select * into r from custom.record where organization_id = e.org and id = e.id;

    if e.table_id = c_tk then
      -- ── A SCOPE TYPE (twin of platform._search_item_sync_scope_type, public._notify_suggestion_sweep_scope_type)
      if r.id is null or r.deleted_at is not null then
        perform platform._search_item_drop('scope_type', e.id);
        continue;
      end if;
      -- The old title is the type's slug in the old grammar (hyphens); the store keeps it with
      -- underscores (measured 2026-09-28: 83 of 83 equal once read back).
      perform platform._search_item_put('scope_type', r.id, r.organization_id, r.created_by, null::platform.visibility,
        coalesce(nullif(btrim(replace(r.data ->> 'slug', '_', '-')), ''), 'Untitled scope type' || coalesce(' ' || to_char(r.created_at, 'YYYY-MM-DD'), '')),
        left(coalesce(nullif(r.data ->> 'description', ''), r.metadata #>> '{moved_from,carried,description}'), 140),
        '{}'::text[], r.updated_at, null::text, null::text);
      if e.created then
        insert into rag.kg_sweep_queue (change_type, entity_id, scope_type_id, organization_id, created_by)
        select 'scope_type', r.id, r.id, r.organization_id, null
         where not exists (select 1 from rag.kg_sweep_queue q where q.change_type = 'scope_type' and q.entity_id = r.id);
        if found then
          perform pg_notify('suggestion_sweep', json_build_object('change_type', 'scope_type', 'entity_id', r.id::text,
            'scope_type_id', r.id::text, 'organization_id', r.organization_id::text, 'created_by', null)::text);
        end if;
      end if;

    elsif e.table_id = c_fk then
      -- ── A CONTEXT FIELD (twin of public._notify_suggestion_sweep_context_item and the item half of
      --    context.provision_scope_datasets_trigger). An inactive or archived field wakes nothing.
      continue when r.id is null or r.deleted_at is not null
                 or not coalesce((r.metadata #>> '{moved_from,carried,is_active}')::boolean, true);
      v_type := (r.data ->> 'entity_definition_id')::uuid;
      if e.created then
        insert into rag.kg_sweep_queue (change_type, entity_id, scope_type_id, organization_id, created_by)
        select 'context_item', r.id, v_type, r.organization_id, r.created_by
         where not exists (select 1 from rag.kg_sweep_queue q where q.change_type = 'context_item' and q.entity_id = r.id);
        if found then
          perform pg_notify('suggestion_sweep', json_build_object('change_type', 'context_item', 'entity_id', r.id::text,
            'scope_type_id', v_type::text, 'organization_id', r.organization_id::text, 'created_by', r.created_by::text)::text);
        end if;
      end if;
      -- Where a Field says it is bound to a dataset template: its own document (lane
      -- SCOPES-STORE-HOMES' home), or what the copy carried before that home existed.
      v_rs := coalesce(r.data -> 'reference_source', r.metadata #> '{moved_from,carried,reference_source}');
      if v_rs ->> 'container_type' = 'dataset_template' then
        for x in select s.id from custom.record s
                  where s.organization_id = r.organization_id and s.table_id = v_type
                    and s.data_class = 'record' and s.deleted_at is null
        loop
          perform custom.scope_table_provision(r.organization_id, r.id, x.id, null);
        end loop;
      end if;

    else
      -- ── A SCOPE (twin of platform._search_item_sync_scope, public._notify_suggestion_sweep_scope
      --    and the scope half of context.provision_scope_datasets_trigger)
      if r.id is null or r.deleted_at is not null then
        perform platform._search_item_drop('scope', e.id);
        continue;
      end if;
      select f.data ->> 'key' into v_key from custom.record f
       where f.organization_id = r.organization_id and f.id = custom._ctx_id('scope-column-field', r.table_id::text, 'description');
      perform platform._search_item_put('scope', r.id, r.organization_id, r.created_by, r.visibility,
        coalesce(nullif(btrim(r.data ->> 'name'), ''), 'Untitled scope' || coalesce(' ' || to_char(r.created_at, 'YYYY-MM-DD'), '')),
        left(r.data ->> coalesce(v_key, 'description'), 140),
        '{}'::text[], r.updated_at, null::text, null::text);
      if e.created then
        insert into rag.kg_sweep_queue (change_type, entity_id, scope_type_id, organization_id, created_by)
        select 'scope', r.id, r.table_id, r.organization_id, r.created_by
         where not exists (select 1 from rag.kg_sweep_queue q where q.change_type = 'scope' and q.entity_id = r.id);
        if found then
          perform pg_notify('suggestion_sweep', json_build_object('change_type', 'scope', 'entity_id', r.id::text,
            'scope_type_id', r.table_id::text, 'organization_id', r.organization_id::text, 'created_by', r.created_by::text)::text);
        end if;
        for x in select f.id from custom.record f
                  where f.organization_id = r.organization_id and f.table_id = c_fk and f.deleted_at is null
                    and f.data ->> 'entity_definition_id' = r.table_id::text
                    and coalesce((f.metadata #>> '{moved_from,carried,is_active}')::boolean, true)
                    and coalesce(f.data -> 'reference_source', f.metadata #> '{moved_from,carried,reference_source}') ->> 'container_type' = 'dataset_template'
        loop
          perform custom.scope_table_provision(r.organization_id, x.id, r.id, null);
        end loop;
      end if;
    end if;
  end loop;
end
$function$;
