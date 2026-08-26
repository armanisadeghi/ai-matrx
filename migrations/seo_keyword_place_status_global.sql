-- Typed global entrypoint for the place-detection scoreboard.
--
-- Postgres permits NULL for seo.keyword_place_status(p_site_id, ...), and that
-- function already enforces public.is_admin() for the global lane. Supabase's
-- generated RPC types do not represent nullable function arguments, so expose
-- the global lane as a parameter-free wrapper instead of weakening the
-- generated frontend contract.

create or replace function seo.keyword_place_status_global(
  p_min_impressions integer
)
returns table (
  queue_total bigint,
  queue_scanned bigint,
  queue_pending bigint,
  queue_deferred bigint,
  pending_clicks bigint,
  pending_impressions bigint,
  scanned_clicks bigint,
  queue_clicks bigint,
  keywords_with_places bigint,
  keywords_explicit_local bigint,
  next_phrase text,
  last_scanned_at timestamptz,
  site_keywords bigint,
  site_keywords_scanned bigint,
  site_keywords_local bigint,
  site_clicks bigint,
  site_local_clicks bigint,
  areas_total bigint,
  areas_with_places bigint,
  areas_empty bigint,
  demand_window_days integer
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select *
  from seo.keyword_place_status(null, p_min_impressions);
$$;

comment on function seo.keyword_place_status_global(integer) is
  'Admin-only global place-detection scoreboard. Typed wrapper around keyword_place_status(NULL, min impressions).';

revoke all on function seo.keyword_place_status_global(integer) from public;
grant execute on function seo.keyword_place_status_global(integer) to authenticated;
