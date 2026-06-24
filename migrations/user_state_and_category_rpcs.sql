-- user_state_and_category_rpcs.sql
-- Applied 2026-06-24 during the DB changeover (via Supabase MCP apply_migration).
--
-- Canonical per-user state (platform.user_entity_state) + categories (platform.categories)
-- FE data path. authenticated has no direct grant on platform.*, so access is via these
-- PUBLIC SECURITY-DEFINER RPCs. Per-user state gated on auth.uid(); categories on
-- iam.has_org_access. Category ASSIGNMENT to entities reuses assoc_add(target_type='category')
-- — no separate assignment path. Idempotent.

create or replace function public.ues_set(
  p_entity_type text, p_entity_id uuid,
  p_is_favorite boolean default null, p_is_pinned boolean default null, p_is_hidden boolean default null
) returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'ues_set: not authenticated' using errcode='42501'; end if;
  insert into platform.user_entity_state (user_id, entity_type, entity_id, is_favorite, is_pinned, is_hidden, updated_at)
  values (v_uid, p_entity_type, p_entity_id,
          coalesce(p_is_favorite,false), coalesce(p_is_pinned,false), coalesce(p_is_hidden,false), now())
  on conflict (user_id, entity_type, entity_id) do update set
    is_favorite = coalesce(p_is_favorite, platform.user_entity_state.is_favorite),
    is_pinned   = coalesce(p_is_pinned,   platform.user_entity_state.is_pinned),
    is_hidden   = coalesce(p_is_hidden,   platform.user_entity_state.is_hidden),
    updated_at  = now();
end $fn$;

create or replace function public.ues_list(p_kind text default null)
returns table (entity_type text, entity_id uuid, is_favorite boolean, is_pinned boolean, is_hidden boolean, last_viewed_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path to 'public' as $fn$
  select entity_type, entity_id, is_favorite, is_pinned, is_hidden, last_viewed_at, updated_at
    from platform.user_entity_state
   where user_id = auth.uid()
     and (p_kind is null
          or (p_kind='favorite' and is_favorite)
          or (p_kind='pinned'   and is_pinned)
          or (p_kind='hidden'   and is_hidden));
$fn$;

create or replace function public.ues_get_bulk(p_entity_type text, p_entity_ids uuid[])
returns table (entity_id uuid, is_favorite boolean, is_pinned boolean, is_hidden boolean, last_viewed_at timestamptz)
language sql stable security definer set search_path to 'public' as $fn$
  select entity_id, is_favorite, is_pinned, is_hidden, last_viewed_at
    from platform.user_entity_state
   where user_id = auth.uid() and entity_type = p_entity_type
     and entity_id = any(coalesce(p_entity_ids,'{}'::uuid[]));
$fn$;

create or replace function public.ues_touch(p_entity_type text, p_entity_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  insert into platform.user_entity_state (user_id, entity_type, entity_id, last_viewed_at, updated_at)
  values (v_uid, p_entity_type, p_entity_id, now(), now())
  on conflict (user_id, entity_type, entity_id) do update set last_viewed_at = now(), updated_at = now();
end $fn$;

create or replace function public.cat_list(p_dimension text default null)
returns table (id uuid, org_id uuid, dimension text, name text, slug text, parent_id uuid, is_system boolean, color text, icon text, "position" integer)
language sql stable security definer set search_path to 'public' as $fn$
  select id, org_id, dimension, name, slug, parent_id, is_system, color, icon, "position"
    from platform.categories
   where deleted_at is null
     and (org_id is null or iam.has_org_access(org_id))
     and (p_dimension is null or dimension = p_dimension)
   order by dimension, "position" nulls last, name;
$fn$;

create or replace function public.cat_create(
  p_dimension text, p_name text, p_org_id uuid,
  p_parent_id uuid default null, p_color text default null, p_icon text default null, p_slug text default null
) returns uuid
language plpgsql security definer set search_path to 'public' as $fn$
declare v_id uuid;
begin
  if p_org_id is null or not iam.has_org_access(p_org_id) then
    raise exception 'cat_create: no org access' using errcode='42501';
  end if;
  insert into platform.categories (org_id, dimension, name, slug, parent_id, is_system, color, icon, created_by, updated_by)
  values (p_org_id, p_dimension, p_name, p_slug, p_parent_id, false, p_color, p_icon, auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end $fn$;

revoke all on function public.ues_set(text,uuid,boolean,boolean,boolean) from public;
revoke all on function public.ues_list(text) from public;
revoke all on function public.ues_get_bulk(text,uuid[]) from public;
revoke all on function public.ues_touch(text,uuid) from public;
revoke all on function public.cat_list(text) from public;
revoke all on function public.cat_create(text,text,uuid,uuid,text,text,text) from public;
grant execute on function public.ues_set(text,uuid,boolean,boolean,boolean) to authenticated;
grant execute on function public.ues_list(text) to authenticated;
grant execute on function public.ues_get_bulk(text,uuid[]) to authenticated;
grant execute on function public.ues_touch(text,uuid) to authenticated;
grant execute on function public.cat_list(text) to authenticated;
grant execute on function public.cat_create(text,text,uuid,uuid,text,text,text) to authenticated;
