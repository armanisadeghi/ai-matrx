-- Fast link-edge count for big sites. RLS evaluates iam.has_access per ROW,
-- so PostgREST count=exact over a 100k-edge site runs 100k access checks and
-- hits statement timeout (prod 57014, 2026-07-21). This RPC checks access
-- ONCE, then counts with the service-definer privilege. Mirrors the filter
-- surface of the marketing links table.
create or replace function web.count_link_edges(
  p_site_id uuid,
  p_session_id uuid default null,
  p_search text default null,
  p_target_url text default null,
  p_anchor_text text default null,
  p_rel text default null,
  p_is_internal boolean default null,
  p_http_status_min integer default null,
  p_http_status_max integer default null,
  p_position_min integer default null,
  p_position_max integer default null
) returns bigint
language plpgsql
stable
security definer
set search_path = 'web', 'iam', 'public'
as $$
declare
  result bigint;
begin
  if not iam.has_access('web_site', p_site_id, 'viewer'::permission_level) then
    raise exception 'not authorized for site %', p_site_id using errcode = '42501';
  end if;
  select count(*) into result
  from web.link_edge e
  where e.site_id = p_site_id
    and e.deleted_at is null
    and (p_session_id is null or exists (
      select 1 from web.snapshot s
      where s.id = e.snapshot_id and s.session_id = p_session_id
    ))
    and (p_search is null or e.target_url ilike '%' || p_search || '%'
      or e.anchor_text ilike '%' || p_search || '%'
      or e.rel ilike '%' || p_search || '%')
    and (p_target_url is null or e.target_url ilike '%' || p_target_url || '%')
    and (p_anchor_text is null or e.anchor_text ilike '%' || p_anchor_text || '%')
    and (p_rel is null or e.rel ilike '%' || p_rel || '%')
    and (p_is_internal is null or e.is_internal = p_is_internal)
    and (p_http_status_min is null or e.http_status >= p_http_status_min)
    and (p_http_status_max is null or e.http_status <= p_http_status_max)
    and (p_position_min is null or e.position >= p_position_min)
    and (p_position_max is null or e.position <= p_position_max);
  return result;
end;
$$;

revoke all on function web.count_link_edges(uuid, uuid, text, text, text, text, boolean, integer, integer, integer, integer) from public;
grant execute on function web.count_link_edges(uuid, uuid, text, text, text, text, boolean, integer, integer, integer, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
