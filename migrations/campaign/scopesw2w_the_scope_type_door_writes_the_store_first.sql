-- draft: claude-w2w clone-proven pattern door; production waits on the lane manager's ruling (chair record doors vs the lane-9 store halves) and CA1; needs scopesw2w_a_scope_type_under_a_type_keeps_its_parent_in_the_store.sql first
-- chair-step: it REPLACES the body of one lane-9 scope door, custom.context_type_write (signature, SECURITY DEFINER, search_path and grants unchanged). The door no longer calls public.create_scope_type / public.update_scope_type and no longer reads context.scope_types to decide anything: the organization, the parent type, the descendants and the current words come from the store Table (custom.scope_type_row_of); the access predicates are the old functions' own, word for word (no move to the store ladder, chair item CA1). The store Table is written FIRST through the lane-9 store half custom._ctx_store_type (marked as a scope door); the old context.scope_types row is then written as the IMAGE with the store's words; and the store half is handed the image row once more, which in steady state changes nothing. No new door, no grant, no change to the chair's record doors or the access ladder.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_type_write(uuid, uuid, jsonb) d1e11f9ced7a5ac3d98eee5f73e2f01e03ec703a1afc9c56f2cb56006dc9e08c
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw2w_the_scope_type_door_writes_the_store_first_down.sql.
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
      'label_singular', coalesce(s -> 'label_singular', v_cur -> 'label_singular'),
      'label_plural', coalesce(s -> 'label_plural', v_cur -> 'label_plural'),
      'icon', coalesce(s -> 'icon', v_cur -> 'icon'), 'description', coalesce(s -> 'description', v_cur -> 'description'),
      'color', coalesce(s -> 'color', v_cur -> 'color'),
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
      raise exception 'The scope type % is in the record store but not in the older scope tables, so its image could not be kept.', p_type_id
        using errcode = 'P0002', hint = 'Lane 9 W2-W: until wave 3 every scope Table has its old row. Nothing was saved.';
    end if;
  end if;

  -- 3. THE IMAGE'S OWN WORDS BACK (the old triggers fill a few columns). In steady state this changes nothing.
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  perform custom._ctx_store_type(v_org, v_img.id, to_jsonb(v_img));
  perform custom._ctx_mark(v_was);

  if p_type_id is not null and not (s ? 'parent_type_id' or (s ? 'max_assignments' and jsonb_typeof(s -> 'max_assignments') = 'null')) then
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
  end if;
  return custom._ctx_answer(v_org, v_img.id, to_jsonb(v_img));
end;
$function$;
