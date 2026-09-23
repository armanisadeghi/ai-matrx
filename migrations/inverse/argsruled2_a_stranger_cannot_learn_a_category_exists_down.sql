-- lock: platform
-- lane: ARGS-RULED-2
--
-- INVERSE of migrations/campaign/argsruled2_a_stranger_cannot_learn_a_category_exists.sql: puts public.cat_write's body back exactly as it was
-- before (byte-for-byte from pg_get_functiondef on the MAIN database, 2026-09-22), which
-- REOPENS the hole that file closed. Rule 27 only.

set lock_timeout = '4s';

create or replace function public.cat_write(p_dimension text, p_category_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_set_slug boolean DEFAULT false, p_parent_id uuid DEFAULT NULL::uuid, p_set_parent boolean DEFAULT false, p_color text DEFAULT NULL::text, p_set_color boolean DEFAULT false, p_icon text DEFAULT NULL::text, p_set_icon boolean DEFAULT false, p_position integer DEFAULT NULL::integer, p_set_position boolean DEFAULT false, p_placement_type text DEFAULT NULL::text, p_set_placement_type boolean DEFAULT false, p_metadata_patch jsonb DEFAULT NULL::jsonb, p_is_system boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_row platform.categories;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_dim text := nullif(btrim(coalesce(p_dimension, '')), '');
begin
  if v_actor is null then
    raise exception 'cat_write: a category belongs to an organization, and nobody is signed in.'
      using errcode = '42501';
  end if;
  if v_dim is null then
    raise exception 'cat_write: name the dimension this category belongs to (feedback, shortcut, skill, app, …).'
      using errcode = '22004';
  end if;
  if p_metadata_patch is not null
     and jsonb_typeof(p_metadata_patch) is distinct from 'object' then
    raise exception 'cat_write: the metadata patch is an object.' using errcode = '22023';
  end if;

  -- ── CREATE ──
  if p_category_id is null then
    if v_name is null then
      raise exception 'cat_write: a category needs a name.' using errcode = '22004';
    end if;
    if p_organization_id is null then
      raise exception 'cat_write: name the organization this category belongs to.'
        using errcode = '22004';
    end if;
    -- THE LADDER. What std_insert asked, plus the is_system arm the cat_* doors already carry.
    if not (iam.has_org_access(p_organization_id)
            or (p_organization_id in (select organization_id from iam.system_orgs where global_readable)
                and public.is_super_admin())) then
      raise exception 'cat_write: % is not an organization you can add a category to.', p_organization_id
        using errcode = '42501';
    end if;
    if coalesce(p_is_system, false) and not public.is_super_admin() then
      raise exception 'cat_write: a SYSTEM category is platform vocabulary, not an organization''s — that needs a super admin.'
        using errcode = '42501';
    end if;
    -- THE PARENT IS THIS ORGANIZATION'S OR THE PLATFORM'S, the sentence cat_create already
    -- carries (0850): a foreign parent and an invented one answer the SAME way, so the door is
    -- not an existence oracle over every category id.
    if p_parent_id is not null and not exists (
         select 1 from platform.categories parent
          where parent.id = p_parent_id and parent.deleted_at is null
            and parent.dimension = v_dim
            and (parent.organization_id = p_organization_id or parent.is_system)) then
      raise exception 'cat_write: parent category not found' using errcode = '22023';
    end if;

    insert into platform.categories
      (organization_id, dimension, name, slug, parent_id, is_system, color, icon,
       "position", placement_type, metadata, created_by, updated_by)
    values
      (p_organization_id, v_dim, v_name, nullif(btrim(coalesce(p_slug, '')), ''),
       p_parent_id, coalesce(p_is_system, false), p_color, p_icon,
       p_position, nullif(btrim(coalesce(p_placement_type, '')), ''),
       coalesce(p_metadata_patch, '{}'::jsonb), v_actor, v_actor)
    returning * into v_row;

    return public._category_json(v_row);
  end if;

  -- ── UPDATE ──
  -- RESOLVED BY (id, dimension) TOGETHER. One table holds every vocabulary in the product and
  -- no policy on it has ever looked at which one a row belongs to.
  select * into v_row
    from platform.categories c
   where c.id = p_category_id and c.dimension = v_dim and c.deleted_at is null;
  if not found then
    return null;
  end if;

  if v_row.is_system then
    if not public.is_super_admin() then
      raise exception 'cat_write: this is platform vocabulary, not your organization''s — changing it needs a super admin.'
        using errcode = '42501';
    end if;
  elsif not (iam.has_org_access(v_row.organization_id)
             or v_row.created_by = v_actor
             or iam.has_access('category', v_row.id, 'editor'::public.permission_level)
             or ((v_row.visibility >= 'internal'::platform.visibility) and public.is_platform_admin())) then
    raise exception 'cat_write: this category is not yours to change.' using errcode = '42501';
  end if;

  if p_set_parent and p_parent_id is not null and not exists (
       select 1 from platform.categories parent
        where parent.id = p_parent_id and parent.deleted_at is null
          and parent.dimension = v_dim
          and (parent.organization_id = v_row.organization_id or parent.is_system)) then
    raise exception 'cat_write: parent category not found' using errcode = '22023';
  end if;

  -- A PATCH, NOT A REPLACEMENT. Every optional column carries its own `p_set_*` flag, so a
  -- caller changing a name cannot erase a colour it never mentioned — which is what the
  -- existing cat_update does, and what several of these call sites were working around.
  update platform.categories c
     set name = coalesce(v_name, c.name),
         slug = case when p_set_slug then nullif(btrim(coalesce(p_slug, '')), '') else c.slug end,
         parent_id = case when p_set_parent then p_parent_id else c.parent_id end,
         color = case when p_set_color then p_color else c.color end,
         icon = case when p_set_icon then p_icon else c.icon end,
         "position" = case when p_set_position then p_position else c."position" end,
         placement_type = case when p_set_placement_type
                               then nullif(btrim(coalesce(p_placement_type, '')), '')
                               else c.placement_type end,
         -- THE MERGE. ContentBlocksManager wrote `{ is_active }` over the whole column and
         -- wiped `legacy_table` with it.
         metadata = case when p_metadata_patch is null then c.metadata
                         else c.metadata || p_metadata_patch end,
         updated_by = v_actor
   where c.id = v_row.id and c.dimension = v_dim and c.deleted_at is null
  returning * into v_row;

  return public._category_json(v_row);
end;
$function$

;
