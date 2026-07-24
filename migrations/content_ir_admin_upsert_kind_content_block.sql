-- Super-admin write path for a kind's teaching content block.
--
-- WHY THIS RPC EXISTS: platform content blocks are homed in the global-readable
-- system org, and `public.content_blocks` RLS only lets an owner/admin MEMBER
-- of that org insert them — but no user is a member of the system org, so every
-- platform block to date was written by a service-role SQL migration, never a
-- UI. This SECURITY DEFINER function is the ONE UI-reachable write path: gated
-- by the EXISTING `is_super_admin()` (identical posture to shape_doctor_gather
-- and the admin_* RPC family — no new security concept), it upserts the block
-- by its globally-unique `block_id` so the kind-registry "generate / regenerate"
-- action can both create and update in place.
--
-- User-owned shapes need NONE of this: RLS already lets an owner write their own
-- content block through the canonical /api/agent-content-blocks path.
--
-- Idempotent (CREATE OR REPLACE). Ledgered in public._schema_migrations.

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
set search_path to 'content_ir', 'public', 'platform'
as $function$
declare
  v_kind text;
  v_org uuid;
  v_category uuid;
  v_meta jsonb;
  v_row public.content_blocks;
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

  select kd.kind, kd.organization_id
    into v_kind, v_org
  from content_ir.kind_definition kd
  where kd.id = p_kind_definition_id
    and kd.deleted_at is null;
  if v_kind is null then
    raise exception 'admin_upsert_kind_content_block: kind_definition % not found', p_kind_definition_id;
  end if;

  -- Home the block where the kind lives; file it under that org's "Agent Skills"
  -- content-block category when one exists (null category is legitimate).
  select c.id into v_category
  from platform.categories c
  where c.placement_type = 'content-block'
    and c.organization_id = v_org
    and lower(c.name) = 'agent skills'
  limit 1;

  v_meta := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
         '__kind_source', v_kind,
         'kind_definition_id', p_kind_definition_id,
         'generated', true
       );

  insert into public.content_blocks (
    block_id, label, description, icon_name, template,
    category_id, organization_id, user_id, is_active, sort_order,
    version, metadata
  )
  values (
    p_block_id, btrim(p_label), p_description, coalesce(nullif(btrim(p_icon_name), ''), 'Shapes'), p_template,
    v_category, v_org, null, true, 100,
    1, v_meta
  )
  on conflict (block_id) do update set
    label = excluded.label,
    description = excluded.description,
    icon_name = excluded.icon_name,
    template = excluded.template,
    category_id = coalesce(excluded.category_id, public.content_blocks.category_id),
    organization_id = excluded.organization_id,
    user_id = null,
    is_active = true,
    deleted_at = null,
    -- Merge so any hand-added metadata keys survive a regenerate.
    metadata = public.content_blocks.metadata || excluded.metadata
    -- version + updated_at/by are handled by the _touch_row / _stamp_actor triggers.
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

grant execute on function content_ir.admin_upsert_kind_content_block(
  uuid, text, text, text, text, text, jsonb
) to authenticated;
