-- KI-026 (cross-site hub): the multi-site batch variant of the ONE value
-- read. Pairs of (site_id, keyword_ids) resolve through the existing
-- single-site function per site — same resolver, same per-site access
-- assert, never a second arithmetic. Idempotent.

create or replace function seo.gsc_keyword_value_for_multi(p_pairs jsonb)
returns table(
  site_id uuid,
  keyword_id uuid,
  traffic_class text,
  class_source text,
  value_score numeric,
  value_band text,
  value_source text,
  reasons jsonb
)
language plpgsql
stable security definer
set search_path to 'seo', 'platform', 'pg_temp'
as $function$
declare
  v_pair jsonb;
  v_site uuid;
  v_ids uuid[];
  v_sites integer := 0;
  v_total integer := 0;
begin
  if p_pairs is null or jsonb_typeof(p_pairs) <> 'array' then
    return;
  end if;
  for v_pair in select * from jsonb_array_elements(p_pairs) loop
    v_site := (v_pair->>'site_id')::uuid;
    select coalesce(array_agg(value::uuid), '{}') into v_ids
      from jsonb_array_elements_text(v_pair->'keyword_ids');
    if v_site is null or coalesce(array_length(v_ids, 1), 0) = 0 then
      continue;
    end if;
    v_sites := v_sites + 1;
    v_total := v_total + array_length(v_ids, 1);
    if v_sites > 25 then
      raise exception 'gsc_too_many_sites: max 25 sites per call';
    end if;
    if v_total > 2000 then
      raise exception 'gsc_too_many_keywords: max 2000 keywords per call';
    end if;
    -- The inner call performs seo.gsc_assert_site_access(v_site): a caller
    -- with no access to ONE site fails the whole call loudly rather than
    -- getting a silently partial answer.
    return query
      select v_site, f.keyword_id, f.traffic_class, f.class_source,
             f.value_score, f.value_band, f.value_source, f.reasons
      from seo.gsc_keyword_value_for(v_site, v_ids) f;
  end loop;
end;
$function$;

grant execute on function seo.gsc_keyword_value_for_multi(jsonb) to authenticated;

notify pgrst, 'reload schema';
