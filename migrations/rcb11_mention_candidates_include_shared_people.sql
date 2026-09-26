-- RC-B11 — a person the record was SHARED with can be @-mentioned on it.
-- Found on localhost 2026-09-26: test@test.com, shared the admin's study guide as a viewer, could open
-- the guide and read its thread but never appeared in the mention picker — cmt_mention_candidates drew
-- its pool from the record organization's members only. The pool is now members ∪ direct user shares;
-- the viewer check on every candidate is unchanged (and is the only access question).
-- based-on: public.cmt_mention_candidates(text, uuid, text, integer) f0c8aaa85f9053f162f9c7e1a443713257e973d8a8638aa95f55375a12efa1c8

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.cmt_mention_candidates(p_entity_type text, p_entity_id uuid, p_search text DEFAULT ''::text, p_limit integer DEFAULT 8)
 RETURNS TABLE(user_id uuid, display_name text, email text, avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid;
  v_q text := lower(btrim(coalesce(p_search, '')));
begin
  if not iam.has_access(p_entity_type, p_entity_id, 'commenter'::public.permission_level) then
    raise exception 'cmt_mention_candidates: you cannot comment on this record, so you cannot mention anyone on it'
      using errcode = '42501';
  end if;
  v_org := platform.entity_organization_id(p_entity_type, p_entity_id);
  -- RC-B11 (2026-09-26): everyone who can VIEW the record — its organization's members AND the
  -- people it was shared with directly (a share reaches people outside the organization; they
  -- could read the thread but could not be mentioned in it). Every candidate still passes the
  -- viewer check, which is the whole question.
  return query
    with pool as (
      select m.user_id as id from iam.organization_member m where m.organization_id = v_org
      union
      select p.granted_to_user_id from iam.permissions p
       where p.resource_type = p_entity_type and p.resource_id = p_entity_id
         and p.granted_to_user_id is not null and p.status = 'active'
         and (p.expires_at is null or p.expires_at > now())
    )
    select u.id,
           coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email)::text,
           u.email::text,
           (u.raw_user_meta_data->>'avatar_url')::text
      from pool
      join auth.users u on u.id = pool.id
     where u.id is distinct from (select auth.uid())
       and (v_q = ''
            or lower(coalesce(u.raw_user_meta_data->>'full_name', '')) like '%' || v_q || '%'
            or lower(coalesce(u.raw_user_meta_data->>'name', '')) like '%' || v_q || '%'
            or lower(coalesce(u.email, '')) like v_q || '%')
       and iam.has_access_for(u.id, p_entity_type, p_entity_id, 'viewer'::public.permission_level)
     order by 2
     limit least(greatest(coalesce(p_limit, 8), 1), 20);
end $function$
;
