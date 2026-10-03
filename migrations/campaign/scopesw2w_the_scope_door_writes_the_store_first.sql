-- draft: claude-w2w clone-proven pattern door; production waits on the lane manager's ruling (chair record doors vs the lane-9 store halves) and CA1
-- chair-step: it REPLACES the body of one lane-9 scope door, custom.context_scope_write (signature, SECURITY DEFINER, search_path and grants unchanged). The door no longer calls public.create_scope / public.update_scope and no longer reads context.scopes or context.scope_types to decide anything: the organization, the type, the parent, the sort order and the current values come from the record store; the access predicate is the one the old functions applied, word for word (a platform admin, or iam.has_org_access on the scope's organization — no move to the store ladder, which is chair item CA1). The store Record is written FIRST through the lane-9 store half custom._ctx_store_scope (marked as a scope door, so the follow trigger does not copy it a second time); the old context.scopes row is then written as the IMAGE, with today's statements, so every old trigger and every reader not yet moved sees the same row; and the store half is handed the image row once more, which in steady state changes nothing (proven 'current' by the suite) and otherwise takes the old triggers' words, exactly as the write-through does today. No new door, no grant, no change to the chair's record doors or the access ladder.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_scope_write(uuid, uuid, uuid, jsonb) e22357d3d6e1de646eaae962a6307865c140f629fe7874f06d58b18f9ef715f7
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw2w_the_scope_door_writes_the_store_first_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy adds "Concussion return-to-learn" to its Practice Areas with
-- an intake form and a workers' comp flag, files "ACL return-to-sport testing" under Sports rehab, and
-- renames Sports rehab. Every one of those is decided and written in the record store; the old tables
-- receive the same row as an image until wave 3 removes them.
-- Guard (same answer, same effect, both seats, against the old body): scripts/campaign-tests/scopesw2w_the_scope_door_writes_the_store_first_same_answer.sql.

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
  v_row    context.scopes;
  v_desc   text;
  v_cur    jsonb;
  v_sort   smallint;
  v_spec   jsonb;
  v_was    text;
  v_actor  text;
  v_label  text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_scope_id is null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.context_scope_write');
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
      raise exception 'create_scope: scope type not found in this organization' using errcode = '22023';
    end if;
    v_type := p_type_id;
    v_parent := nullif(s ->> 'parent_scope_id', '')::uuid;
    if v_parent is not null and not exists (
         select 1 from custom.record p
           join custom.record pt on pt.organization_id = p.organization_id and pt.id = p.table_id
                                and pt.table_id = custom.table_kernel_id() and pt.data ->> 'kept_for' = 'context'
          where p.organization_id = v_org and p.id = v_parent and p.data_class = 'record' and p.deleted_at is null) then
      raise exception 'create_scope: parent scope not found in this organization' using errcode = '22023';
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
    v_spec := jsonb_build_object(
      'id', p_scope_id, 'organization_id', v_org, 'scope_type_id', v_type, 'parent_scope_id', v_parent,
      'name', coalesce(s -> 'name', v_rec.data -> 'name'),
      'description', coalesce(s ->> 'description', v_rec.data ->> v_desc, ''),
      'settings', case when s ? 'settings' then coalesce(nullif(s -> 'settings', 'null'::jsonb), v_cur) else v_cur end,
      'slug', custom._ctx_scope_slug(coalesce(nullif(s ->> 'slug', ''), v_rec.data ->> 'slug')),
      'sort_order', coalesce((s ->> 'sort_order')::smallint, nullif(v_rec.data ->> 'sort_order', '')::smallint, 0::smallint),
      'created_by', v_rec.created_by, 'deleted_at', v_rec.deleted_at);
  end if;

  -- 1. THE STORE, FIRST. Marked as a scope door, so the old tables' follow trigger does not copy it again.
  v_was := custom._ctx_mark('door');
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  perform custom._ctx_store_scope(v_org, v_type, coalesce(v_id, p_scope_id), v_spec);
  perform set_config('app.actor_system', v_actor, true);

  -- 2. THE IMAGE: the old row, written with today's statements, so every old trigger and reader sees it.
  if p_scope_id is null then
    insert into context.scopes (id, organization_id, scope_type_id, parent_scope_id, name, description, settings,
                                slug, sort_order, created_by)
    values (v_id, v_org, v_type, v_parent, s ->> 'name', coalesce(s ->> 'description', ''),
            coalesce(s -> 'settings', '{}'::jsonb), nullif(s ->> 'slug', ''), v_sort, (select auth.uid()))
    returning * into v_row;
  elsif s ? 'parent_scope_id' then
    update context.scopes sc
       set parent_scope_id = v_parent,
           name = coalesce(s ->> 'name', sc.name),
           description = coalesce(s ->> 'description', sc.description),
           settings = case when s ? 'settings' then coalesce(s -> 'settings', sc.settings) else sc.settings end,
           slug = coalesce(nullif(s ->> 'slug', ''), sc.slug),
           sort_order = coalesce((s ->> 'sort_order')::smallint, sc.sort_order),
           updated_at = now()
     where sc.id = p_scope_id
    returning * into v_row;
  else
    update context.scopes sc
       set name = coalesce(s ->> 'name', sc.name),
           description = coalesce(s ->> 'description', sc.description),
           settings = coalesce(case when s ? 'settings' then s -> 'settings' end, sc.settings),
           slug = coalesce(nullif(s ->> 'slug', ''), sc.slug),
           sort_order = coalesce((s ->> 'sort_order')::smallint, sc.sort_order),
           updated_at = now()
     where sc.id = p_scope_id
    returning * into v_row;
  end if;
  if v_row.id is null then
    raise exception 'The scope % is in the record store but not in the older scope tables, so its image could not be kept.', p_scope_id
      using errcode = 'P0002',
            hint = 'Lane 9 W2-W: until wave 3 every scope Record has its old row. Nothing was saved.';
  end if;

  -- 3. THE IMAGE'S OWN WORDS BACK (the old triggers fill a few columns). In steady state this changes nothing.
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  perform custom._ctx_store_scope(v_org, v_type, v_row.id, to_jsonb(v_row));
  perform custom._ctx_mark(v_was);

  if p_scope_id is not null then
    perform custom.assert_client_may_reach(v_org, 'custom.context_scope_write');
  end if;
  select t.data ->> 'label_singular' into v_label
    from custom.record t where t.organization_id = v_org and t.id = v_type;
  return custom._ctx_answer(v_org, v_row.id, to_jsonb(v_row) || jsonb_build_object('type_label', v_label));
end;
$function$;
