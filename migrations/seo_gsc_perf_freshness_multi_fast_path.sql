-- based-on: seo.gsc_perf_freshness_multi(uuid[]) 7d5dbcafed15b8fc0afab4c261f8744326c4e2cd514b1c8823eac6c5043d478b

-- The portfolio freshness door needs one fact: the newest query-profile date.
-- Calling gsc_perf_freshness for every site also computed MIN and COUNT across
-- every profile, forcing large scans that can exceed the Data API timeout.
create or replace function seo.gsc_perf_freshness_multi(p_site_ids uuid[])
returns date
language plpgsql
stable
security definer
set search_path to 'seo', 'pg_temp'
as $function$
declare
  v_site uuid;
  v_site_max date;
  v_max date := null;
begin
  if p_site_ids is null or cardinality(p_site_ids) = 0 then
    return null;
  end if;

  for v_site in select distinct u from unnest(p_site_ids) as u loop
    begin
      perform seo.gsc_assert_site_access(v_site);
    exception
      when insufficient_privilege or raise_exception then
        continue;
    end;

    select spd.date
    into v_site_max
    from seo.search_performance_daily spd
    where spd.site_id = v_site
      and spd.provider = 'gsc'
      and spd.dimension_profile = 'query'
    order by spd.date desc
    limit 1;

    if v_site_max is not null and (v_max is null or v_site_max > v_max) then
      v_max := v_site_max;
    end if;
  end loop;

  return v_max;
end;
$function$;

revoke all on function seo.gsc_perf_freshness_multi(uuid[]) from public, anon;
grant execute on function seo.gsc_perf_freshness_multi(uuid[]) to authenticated;
