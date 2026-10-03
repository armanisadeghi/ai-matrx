-- chair-step: the inverse of scopesw2w_the_scope_door_writes_the_store_first.sql — restores the body of custom.context_scope_write as it stood on production and the clone 2026-10-03 04:10Z, in which the door decides and writes through public.create_scope / public.update_scope and the store follows.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_scope_write(uuid, uuid, uuid, jsonb) d9aa6c787b139dbeceec0f5189ee0952e8d93fdcf7fea32d02a0b08189e87b15
-- lock: custom

CREATE OR REPLACE FUNCTION custom.context_scope_write(p_organization_id uuid, p_scope_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row jsonb;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org uuid;
  v_parent uuid;
begin
  if p_scope_id is null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.context_scope_write');
    v_row := public.create_scope(
      p_organization_id, p_type_id, s ->> 'name', nullif(s ->> 'parent_scope_id', '')::uuid,
      coalesce(s ->> 'description', ''), coalesce(s -> 'settings', '{}'::jsonb), nullif(s ->> 'slug', ''),
      (s ->> 'sort_order')::smallint);
  elsif s ? 'parent_scope_id' then
    -- A SCOPE MOVED UNDER ANOTHER (lane SCOPES-OLD-WRITERS): what the agents' structure tool could
    -- always do and public.update_scope cannot (it has no parent). One row write, under
    -- update_scope's own check, in its own sentence; the parent is a live scope of the same
    -- organization and never the scope itself or one of its own descendants.
    select sc.organization_id into v_org from context.scopes sc where sc.id = p_scope_id;
    if v_org is null or not (public.is_platform_admin() or iam.has_org_access(v_org)) then
      raise exception 'not authorized to update scope' using errcode = '42501',
              detail = jsonb_build_object('scope_id', p_scope_id)::text;
    end if;
    v_parent := nullif(s ->> 'parent_scope_id', '')::uuid;
    if v_parent is not null and (
         v_parent = p_scope_id
         or not exists (select 1 from context.scopes p
                         where p.id = v_parent and p.organization_id = v_org and p.deleted_at is null)
         or exists (with recursive under as (
                      select c.id from context.scopes c where c.parent_scope_id = p_scope_id
                      union
                      select c.id from context.scopes c join under u on c.parent_scope_id = u.id)
                    select 1 from under where under.id = v_parent)) then
      raise exception 'That parent is not a scope of this organization this scope can sit under.'
        using errcode = '22023',
              hint = 'A scope''s parent is another live scope of the same organization, and never the scope itself or one of its own children.';
    end if;
    update context.scopes sc
       set parent_scope_id = v_parent,
           name = coalesce(s ->> 'name', sc.name),
           description = coalesce(s ->> 'description', sc.description),
           settings = case when s ? 'settings' then coalesce(s -> 'settings', sc.settings) else sc.settings end,
           slug = coalesce(nullif(s ->> 'slug', ''), sc.slug),
           sort_order = coalesce((s ->> 'sort_order')::smallint, sc.sort_order),
           updated_at = now()
     where sc.id = p_scope_id
    returning to_jsonb(sc.*) into v_row;
    v_row := v_row || jsonb_build_object('type_label',
      (select st.label_singular from context.scope_types st where st.id = (v_row ->> 'scope_type_id')::uuid));
  else
    v_row := public.update_scope(
      p_scope_id, s ->> 'name', s ->> 'description', case when s ? 'settings' then s -> 'settings' end,
      nullif(s ->> 'slug', ''), (s ->> 'sort_order')::smallint);
  end if;
  if p_scope_id is not null then
    perform custom.assert_client_may_reach((v_row ->> 'organization_id')::uuid, 'custom.context_scope_write');
  end if;
  return custom._ctx_answer((v_row ->> 'organization_id')::uuid, (v_row ->> 'id')::uuid, v_row);
end;
$function$;

