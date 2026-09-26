-- chair-step: rule-27 inverse of rcb11_mention_candidates_include_shared_people.sql — the mention pool goes back to the record organization's members only (people a record was shared with directly can no longer be mentioned on it).
-- based-on: public.cmt_mention_candidates(text, uuid, text, integer) 41f5b00be42ea024b4128c06dab9198725502813a7946697cac3ae5828b75aa0

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
  return query
    select u.id,
           coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email)::text,
           u.email::text,
           (u.raw_user_meta_data->>'avatar_url')::text
      from iam.organization_member m
      join auth.users u on u.id = m.user_id
     where m.organization_id = v_org
       and u.id is distinct from (select auth.uid())
       and (v_q = ''
            or lower(coalesce(u.raw_user_meta_data->>'full_name', '')) like '%' || v_q || '%'
            or lower(coalesce(u.raw_user_meta_data->>'name', '')) like '%' || v_q || '%'
            or lower(coalesce(u.email, '')) like v_q || '%')
       and iam.has_access_for(u.id, p_entity_type, p_entity_id, 'viewer'::public.permission_level)
     order by 2
     limit least(greatest(coalesce(p_limit, 8), 1), 20);
end $function$
;
