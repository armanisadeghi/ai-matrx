-- DD-235 (B-125) — the same class, one function outside the client-door population.
--
-- `public.org_admin_reassign_member_resources` named `public.shareable_resource_registry`,
-- which moved to the `platform` schema. Every call reached `42P01 relation
-- "public.shareable_resource_registry" does not exist` — the offboarding transfer
-- could not reassign anything for anybody. This body has been repaired for exactly
-- this class ONCE ALREADY: its own comment says "DD-140b: this check read the
-- relation the iam.memberships cutover removed (42P01)" — one stale relation in the
-- body was fixed and the second one, three statements further down, was not. That is
-- precisely why the fix for DD-235 is a detector over every body and not a patch.
--
-- The function is SECURITY DEFINER with no client grant and no
-- `platform.client_callable_door` row, so it is outside arm D19's population (doors);
-- it is repaired here because it is the same defect found by the same census, and the
-- schema move is the whole change. Columns verified live: resource_type, schema_name,
-- table_name, owner_column and is_active all exist on platform.shareable_resource_registry.

set lock_timeout = '8s';

-- based-on: public.org_admin_reassign_member_resources(uuid, uuid, uuid, text[]) d1eefa16f957c96da0a8f1eb6fc62f9b29ce84a91086cbcf378a3d0613205278
create or replace function public.org_admin_reassign_member_resources(
  p_org_id uuid,
  p_from_user uuid,
  p_to_user uuid,
  p_resource_types text[] default null::text[]
)
returns table (resource_type text, reassigned bigint)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $dd235$

declare r record; v_owner text; v_sql text; v_n bigint; v_total bigint := 0;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;

  -- 🚨 DD-140. An organization admin naming THEMSELVES as the recipient is not an offboarding
  -- transfer, it is a takeover: this function rewrites the owner column of every shareable
  -- registered table, including private conversations, DMs and HR records, and the new owner then
  -- reads them through the ordinary owner arm of every std_select.
  if p_to_user = auth.uid() then
    raise exception 'An organization admin cannot reassign another member''s resources to themselves. An offboarding transfer goes through the audited transfer door, which records who moved what and tells the person whose work moved.'
      using errcode = '42501';
  end if;

  if p_from_user = p_to_user then
    raise exception 'Source and target users must differ' using errcode = '22023';
  end if;
  -- DD-140b: this check read the relation the iam.memberships cutover removed (42P01).
  if not exists (
    select 1 from iam.memberships m
    where m.container_type = 'organization' and m.container_id = p_org_id
      and m.user_id = p_to_user and m.status = 'active' and m.deleted_at is null
  ) then
    raise exception 'Target user is not a member of this organization' using errcode = '23503';
  end if;

  for r in
    select reg.resource_type,
           coalesce(reg.schema_name, 'public') as schema_name,
           reg.table_name,
           reg.owner_column
    from platform.shareable_resource_registry reg
    where coalesce(reg.is_active, true)
      and (p_resource_types is null or reg.resource_type = any (p_resource_types))
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = r.schema_name and c.table_name = r.table_name and c.column_name = 'organization_id'
    ) then
      continue;
    end if;

    v_owner := iam._resolve_owner_column(r.schema_name, r.table_name, r.owner_column);
    if v_owner is null then continue; end if;

    v_sql := format('update %I.%I set %I = $1 where organization_id = $2 and %I = $3',
                    r.schema_name, r.table_name, v_owner, v_owner);
    execute v_sql using p_to_user, p_org_id, p_from_user;
    get diagnostics v_n = row_count;

    if v_n > 0 then
      resource_type := r.resource_type;
      reassigned    := v_n;
      v_total       := v_total + v_n;
      return next;
    end if;
  end loop;

  perform iam._org_audit(p_org_id, p_from_user, 'resources.reassign',
                         jsonb_build_object('to', p_to_user, 'types', p_resource_types, 'total', v_total));
end;
$dd235$;
