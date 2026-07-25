-- Render-block canonicalization — repoint the 2 content_blocks-reading functions to
-- skill.render_definition. Both CREATE OR REPLACE with IDENTICAL signatures, so no
-- caller breaks mid-deploy. Part of the EXPAND phase (reversible: restore prior bodies).

-- 1. Shape-doctor gather: the 'content_blocks' dataset now reads render_definition.
--    (Dataset KEY stays 'content_blocks' — the frontend passes it; only the source moves.)
create or replace function public.shape_doctor_gather(p_dataset text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'content_ir', 'skill'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;

  case p_dataset
    when 'kinds' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'kind', kind, 'label', label, 'is_active', is_active,
        'emitted_json_schema', emitted_json_schema, 'sample_data', sample_data,
        'updated_at', updated_at, 'data', data, 'version', version,
        'visibility', visibility, 'metadata', metadata
      )), '[]'::jsonb) into v_result
      from content_ir.kind_definition where deleted_at is null;
    when 'examples' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'kind_definition_id', kind_definition_id,
        'is_canonical', is_canonical, 'data', data, 'updated_at', updated_at
      )), '[]'::jsonb) into v_result
      from content_ir.kind_example where deleted_at is null;
    when 'components' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'kind_definition_id', kind_definition_id, 'platform', platform,
        'role', role, 'component_key', component_key, 'source', source,
        'is_active', is_active, 'is_default', is_default
      )), '[]'::jsonb) into v_result
      from content_ir.kind_component where deleted_at is null;
    when 'surfaces' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'kind_definition_id', kind_definition_id,
        'surface_type', surface_type, 'token', token,
        'parser_strategy', parser_strategy, 'streaming', streaming,
        'is_active', is_active
      )), '[]'::jsonb) into v_result
      from content_ir.kind_surface where deleted_at is null;
    when 'edges' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'parent_definition_id', parent_definition_id,
        'child_definition_id', child_definition_id, 'field_name', field_name
      )), '[]'::jsonb) into v_result
      from content_ir.kind_edge where deleted_at is null;
    when 'render_block_skills' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'skill_id', skill_id, 'label', label, 'body', body
      )), '[]'::jsonb) into v_result
      from skill.definition where skill_type = 'render_block' and deleted_at is null;
    when 'content_blocks' then
      -- CANONICAL: render blocks now live in skill.render_definition.
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'template', template
      )), '[]'::jsonb) into v_result
      from skill.render_definition where deleted_at is null;
    else
      raise exception 'shape_doctor_gather: unknown dataset %', p_dataset;
  end case;

  return v_result;
end;
$function$;

-- 2. Kind content-block upsert now writes skill.render_definition (with skill_id link,
--    block_type, and public visibility for the system org). Same signature as before.
create or replace function content_ir.admin_upsert_kind_content_block(
  p_kind_definition_id uuid,
  p_block_id text,
  p_label text,
  p_description text,
  p_icon_name text,
  p_template text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'content_ir', 'public', 'platform', 'skill'
as $function$
declare
  v_kind text;
  v_org uuid;
  v_category uuid;
  v_skill uuid;
  v_meta jsonb;
  v_row skill.render_definition;
begin
  if not public.is_super_admin() then
    raise exception 'admin_upsert_kind_content_block: super admin only'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_block_id), '') = ''
     or coalesce(btrim(p_template), '') = ''
     or coalesce(btrim(p_label), '') = '' then
    raise exception 'admin_upsert_kind_content_block: block_id, label and template are required';
  end if;

  select kd.kind, kd.organization_id into v_kind, v_org
  from content_ir.kind_definition kd
  where kd.id = p_kind_definition_id and kd.deleted_at is null;
  if v_kind is null then
    raise exception 'admin_upsert_kind_content_block: kind_definition % not found', p_kind_definition_id;
  end if;

  select c.id into v_category
  from platform.categories c
  where c.placement_type = 'content-block'
    and c.organization_id = v_org
    and lower(c.name) = 'agent skills'
  limit 1;

  -- Link the block to the kind's render-block skill when one exists.
  select d.id into v_skill
  from skill.definition d
  where d.skill_id = 'kind_' || v_kind and d.deleted_at is null
  limit 1;

  v_meta := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object('__kind_source', v_kind,
                          'kind_definition_id', p_kind_definition_id,
                          'generated', true);

  insert into skill.render_definition (
    block_id, label, description, icon_name, template,
    category_id, skill_id, organization_id, is_active, sort_order,
    version, visibility, block_type, metadata
  )
  values (
    p_block_id, btrim(p_label), p_description,
    coalesce(nullif(btrim(p_icon_name), ''), 'Shapes'), p_template,
    v_category, v_skill, v_org, true, 100,
    1,
    (case when v_org = '39c38960-d30c-4840-b0c1-c9960de95582'
          then 'public' else 'internal' end)::platform.visibility,
    'render_kind', v_meta
  )
  on conflict (block_id) where (deleted_at is null) do update set
    label = excluded.label,
    description = excluded.description,
    icon_name = excluded.icon_name,
    template = excluded.template,
    category_id = coalesce(excluded.category_id, skill.render_definition.category_id),
    skill_id = coalesce(excluded.skill_id, skill.render_definition.skill_id),
    organization_id = excluded.organization_id,
    is_active = true,
    deleted_at = null,
    visibility = excluded.visibility,
    block_type = 'render_kind',
    metadata = skill.render_definition.metadata || excluded.metadata
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

grant execute on function content_ir.admin_upsert_kind_content_block(
  uuid, text, text, text, text, text, jsonb
) to authenticated;
