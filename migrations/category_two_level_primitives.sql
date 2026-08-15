-- Applied live to Matrx Main on 2026-08-15 via Supabase MCP migration
-- `category_two_level_primitives`. This file records the already-live change.

create or replace function platform._enforce_category_two_levels()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_parent platform.categories%rowtype;
begin
  if new.deleted_at is not null
     and (tg_op = 'INSERT' or old.deleted_at is null)
     and exists (
       select 1 from platform.categories child
       where child.parent_id = new.id and child.deleted_at is null
     ) then
    raise exception 'category_shape: move or delete child categories first'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from platform.categories child
    where child.parent_id = new.id
      and child.deleted_at is null
      and child.dimension is distinct from new.dimension
  ) then
    raise exception 'category_shape: parent and child must share a dimension'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from platform.categories child
    where child.parent_id = new.id
      and child.deleted_at is null
      and child.organization_id is distinct from new.organization_id
      and not (new.is_system and new.visibility = 'public'::platform.visibility)
  ) then
    raise exception 'category_shape: cross-organization parents must be public system categories'
      using errcode = '23514';
  end if;

  if new.parent_id is null then return new; end if;

  if new.parent_id = new.id then
    raise exception 'category_shape: a category cannot parent itself'
      using errcode = '23514';
  end if;

  if exists (
    with recursive descendants(id) as (
      select child.id from platform.categories child
      where child.parent_id = new.id and child.deleted_at is null
      union
      select child.id
      from platform.categories child
      join descendants d on child.parent_id = d.id
      where child.deleted_at is null
    )
    select 1 from descendants where id = new.parent_id
  ) then
    raise exception 'category_shape: reparenting would create a cycle'
      using errcode = '23514';
  end if;

  select parent.* into v_parent
  from platform.categories parent
  where parent.id = new.parent_id and parent.deleted_at is null;

  if not found then
    raise exception 'category_shape: parent category is missing or deleted'
      using errcode = '23503';
  end if;

  if v_parent.dimension is distinct from new.dimension then
    raise exception 'category_shape: parent and child must share a dimension'
      using errcode = '23514';
  end if;

  if v_parent.organization_id is distinct from new.organization_id
     and not (
       v_parent.is_system
       and v_parent.visibility = 'public'::platform.visibility
     ) then
    raise exception 'category_shape: cross-organization parents must be public system categories'
      using errcode = '23514';
  end if;

  if v_parent.parent_id is not null then
    raise exception 'category_shape: categories support exactly two levels'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from platform.categories child
    where child.parent_id = new.id and child.deleted_at is null
  ) then
    raise exception 'category_shape: a category with children cannot become a child'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function platform._enforce_category_two_levels() from public;

drop trigger if exists _category_two_level_guard on platform.categories;
create trigger _category_two_level_guard
before insert or update on platform.categories
for each row execute function platform._enforce_category_two_levels();

create or replace function public.cat_create(
  p_dimension text,
  p_name text,
  p_org_id uuid,
  p_parent_id uuid default null,
  p_color text default null,
  p_icon text default null,
  p_slug text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'cat_create: not authenticated' using errcode = '42501';
  end if;
  if p_org_id is null or not iam.has_org_access(p_org_id) then
    raise exception 'cat_create: no org access' using errcode = '42501';
  end if;
  if nullif(btrim(p_dimension), '') is null then
    raise exception 'cat_create: dimension is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'cat_create: name is required' using errcode = '22023';
  end if;

  insert into platform.categories (
    organization_id, dimension, name, slug, parent_id, is_system,
    color, icon, created_by, updated_by
  ) values (
    p_org_id, btrim(p_dimension), btrim(p_name), nullif(btrim(p_slug), ''),
    p_parent_id, false, p_color, p_icon, auth.uid(), auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.cat_update(
  p_category_id uuid,
  p_name text,
  p_slug text default null,
  p_color text default null,
  p_icon text default null,
  p_position integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_category platform.categories%rowtype;
begin
  if auth.uid() is null then
    raise exception 'cat_update: not authenticated' using errcode = '42501';
  end if;
  select category.* into v_category
  from platform.categories category
  where category.id = p_category_id and category.deleted_at is null;
  if not found then
    raise exception 'cat_update: category not found' using errcode = 'P0002';
  end if;
  if v_category.is_system then
    if not public.is_super_admin() then
      raise exception 'cat_update: system categories require super-admin access'
        using errcode = '42501';
    end if;
  elsif not iam.has_org_access(v_category.organization_id) then
    raise exception 'cat_update: no org access' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'cat_update: name is required' using errcode = '22023';
  end if;

  update platform.categories
  set name = btrim(p_name),
      slug = nullif(btrim(p_slug), ''),
      color = p_color,
      icon = p_icon,
      "position" = p_position
  where id = p_category_id;
  return p_category_id;
end;
$function$;

create or replace function public.cat_reparent(
  p_category_id uuid,
  p_parent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_category platform.categories%rowtype;
begin
  if auth.uid() is null then
    raise exception 'cat_reparent: not authenticated' using errcode = '42501';
  end if;
  select category.* into v_category
  from platform.categories category
  where category.id = p_category_id and category.deleted_at is null;
  if not found then
    raise exception 'cat_reparent: category not found' using errcode = 'P0002';
  end if;
  if v_category.is_system then
    if not public.is_super_admin() then
      raise exception 'cat_reparent: system categories require super-admin access'
        using errcode = '42501';
    end if;
  elsif not iam.has_org_access(v_category.organization_id) then
    raise exception 'cat_reparent: no org access' using errcode = '42501';
  end if;

  update platform.categories set parent_id = p_parent_id
  where id = p_category_id;
  return p_category_id;
end;
$function$;

create or replace function public.cat_delete(p_category_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_category platform.categories%rowtype;
begin
  if auth.uid() is null then
    raise exception 'cat_delete: not authenticated' using errcode = '42501';
  end if;
  select category.* into v_category
  from platform.categories category
  where category.id = p_category_id and category.deleted_at is null;
  if not found then
    raise exception 'cat_delete: category not found' using errcode = 'P0002';
  end if;
  if v_category.is_system then
    if not public.is_super_admin() then
      raise exception 'cat_delete: system categories require super-admin access'
        using errcode = '42501';
    end if;
  elsif not iam.has_org_access(v_category.organization_id) then
    raise exception 'cat_delete: no org access' using errcode = '42501';
  end if;

  update platform.categories set deleted_at = now()
  where id = p_category_id;
  return p_category_id;
end;
$function$;

revoke all on function public.cat_create(text,text,uuid,uuid,text,text,text) from public, anon;
revoke all on function public.cat_update(uuid,text,text,text,text,integer) from public, anon;
revoke all on function public.cat_reparent(uuid,uuid) from public, anon;
revoke all on function public.cat_delete(uuid) from public, anon;

grant execute on function public.cat_create(text,text,uuid,uuid,text,text,text) to authenticated, service_role;
grant execute on function public.cat_update(uuid,text,text,text,text,integer) to authenticated, service_role;
grant execute on function public.cat_reparent(uuid,uuid) to authenticated, service_role;
grant execute on function public.cat_delete(uuid) to authenticated, service_role;

comment on function platform._enforce_category_two_levels() is
  'Enforces the canonical category + subcategory shape: same dimension, at most two levels, no cycles, and no hidden cross-org parents.';
comment on function public.cat_update(uuid,text,text,text,text,integer) is
  'Updates the editable scalar fields of one visible category; reparenting is a separate RPC.';
comment on function public.cat_reparent(uuid,uuid) is
  'Moves one category to the root or beneath one root category; the platform trigger enforces the two-level shape.';
comment on function public.cat_delete(uuid) is
  'Soft-deletes one category; categories with live children must be emptied first.';
