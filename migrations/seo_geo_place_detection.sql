-- ============================================================================
-- I3 — DETERMINISTIC PLACE DETECTION over the gazetteer.
--
-- Same inputs → same answer, today and next year: no model, no agent, no
-- free-typed label. The detector reads `seo.geo_place` rows and writes
-- `seo.keyword_place` detections; the derived FACT (`local_intent =
-- explicit_local`) is stamped through the EXISTING universal fact store path
-- (`seo.keyword_facet_set`) against the EXISTING `local_intent` dimension —
-- never a second fact store and never a new dimension, because a place is not a
-- closed vocabulary and must never become a facet value.
--
-- THE SCOPE RULE applies here exactly as it does to the resolver: every one of
-- these functions takes the keyword ids it is about to work on. `seo.keyword`
-- is a 196k-row global corpus; a function that quietly scans all of it dies at
-- the 8s statement timeout and renders as "loading".
--
-- THE REGEX WALL stays intact: every token from the gazetteer is refused at
-- WRITE time by `seo.geo_place_assert_safe_tokens` (which calls the same
-- `seo.assert_safe_match_token` the site's own tokens go through), so nothing
-- interpolated below can carry a regex metacharacter.
--
-- THE AMBIGUITY RULE, in one sentence: a city whose name is also an ordinary
-- word (`ambiguity = 'requires_qualifier'`) only matches when the search also
-- carries its state — full name anywhere, or the two-letter abbreviation
-- immediately after the city ("dallas tx"). A state abbreviation NEVER matches
-- on its own, because "in", "or", "me", "hi", "ok", "la", "de", "id" and "pa"
-- are ordinary English words and would flag half the corpus as local.
--
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
-- ============================================================================

-- ── 1. Detection (pure — reads, never writes) ───────────────────────────────
create or replace function seo.detect_keyword_places(p_keyword_ids uuid[])
returns table (
  keyword_id uuid,
  place_id uuid,
  place_kind text,
  place_name text,
  state_code text,
  match_kind text,
  matched_text text,
  confidence smallint
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  if p_keyword_ids is null or cardinality(p_keyword_ids) = 0 then
    raise exception 'seo_geo_no_keywords: place detection takes the keywords it is about to answer for, never the whole corpus.';
  end if;

  return query
  with kw as (
    select k.id, k.normalized_phrase
    from seo.keyword k
    where k.id = any(p_keyword_ids) and k.deleted_at is null
  ),
  place_token as (
    select p.id, p.place_kind, p.name, p.state_code, p.population, p.ambiguity,
           lower(t.v) as token
    from seo.geo_place p,
         lateral jsonb_array_elements_text(p.match_tokens) t(v)
    where p.deleted_at is null and p.is_active
  ),
  hit as (
    select k.id as kw_id, k.normalized_phrase, pt.id as place_id, pt.place_kind,
           pt.name, pt.state_code, pt.population, pt.ambiguity, pt.token
    from kw k
    join place_token pt on k.normalized_phrase ~ ('\m' || pt.token || '\M')
  ),
  -- Does the search carry this city's state? Either the state's own name
  -- anywhere in the phrase, or its abbreviation sitting right after the city.
  qualified as (
    select h.*,
           (exists (
              select 1 from seo.geo_place s
              where s.deleted_at is null and s.is_active
                and s.place_kind = 'state' and s.state_code = h.state_code
                and exists (
                  select 1 from jsonb_array_elements_text(s.match_tokens) st(v)
                  where h.normalized_phrase ~ ('\m' || lower(st.v) || '\M')))
            or h.normalized_phrase ~ ('\m' || h.token || '[, ]+' || lower(h.state_code) || '\M')
           ) as state_qualified
    from hit h
    where h.place_kind = 'city'
  ),
  city_ranked as (
    select q.*,
           count(*) over (partition by q.kw_id, q.token) as rivals,
           row_number() over (
             partition by q.kw_id, q.token
             order by q.state_qualified desc, q.population desc nulls last, q.place_id
           ) as pick
    from qualified q
    where q.ambiguity = 'safe' or q.state_qualified
  )
  -- One winner per (keyword, name): "columbus" with no state is ONE city — the
  -- most populous — carried at low confidence, not four cities at full
  -- confidence. Multi-location (I4) resolves against a place, so handing it
  -- four is worse than handing it one that says it is unsure.
  select c.kw_id, c.place_id, 'city'::text, c.name, c.state_code, 'city'::text, c.token,
         (case when c.state_qualified then 100
               when c.rivals > 1 then 55
               else 95 end)::smallint
  from city_ranked c
  where c.pick = 1
  union all
  select h.kw_id, h.place_id, 'state'::text, h.name, h.state_code, 'state'::text, h.token, 100::smallint
  from hit h where h.place_kind = 'state'
  union all
  select h.kw_id, h.place_id, 'grammar'::text, h.name, null::text, 'grammar'::text, h.token, 100::smallint
  from hit h where h.place_kind = 'grammar';
end;
$$;

comment on function seo.detect_keyword_places(uuid[]) is
  'Deterministic gazetteer place detection for a bounded keyword set (THE SCOPE RULE). Reads only; seo.stamp_keyword_places persists what it finds.';

-- ── 2. Stamping (detections + the derived universal fact) ───────────────────
create or replace function seo.stamp_keyword_places(
  p_keyword_ids uuid[],
  p_detector_version text default 'gazetteer-2026-08-22'
)
returns table (
  keywords_scanned integer,
  places_written integer,
  places_retired integer,
  keywords_with_places integer,
  local_intent_stamped integer,
  human_protected integer
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_dim_id uuid;
  v_targets uuid[];
  v_written integer := 0;
  v_retired integer := 0;
  v_protected integer := 0;
  v_stamped integer := 0;
begin
  if v_uid is null then
    raise exception 'seo_geo_unauthenticated: place detection writes rows, so it runs as a person.';
  end if;
  if p_keyword_ids is null or cardinality(p_keyword_ids) = 0 then
    raise exception 'seo_geo_no_keywords: place detection takes the keywords it is about to stamp, never the whole corpus.';
  end if;

  create temp table _detected on commit drop as
    select * from seo.detect_keyword_places(p_keyword_ids);

  -- A detection that no longer holds (a place was deactivated, an alias
  -- corrected) is retired, never left behind. Only OUR OWN rows: a human or
  -- agent detection is not the detector's to withdraw.
  with retired as (
    update seo.keyword_place kp
       set deleted_at = now(), updated_by = v_uid, updated_at = now()
     where kp.keyword_id = any(p_keyword_ids)
       and kp.deleted_at is null
       and kp.source = 'gazetteer'
       and not exists (
         select 1 from _detected d
          where d.keyword_id = kp.keyword_id and d.place_id = kp.place_id
            and d.match_kind = kp.match_kind)
    returning 1
  ) select count(*)::integer into v_retired from retired;

  with written as (
    insert into seo.keyword_place
      (keyword_id, place_id, match_kind, matched_text, confidence, source,
       detector_version, organization_id, visibility, created_by, updated_by)
    select d.keyword_id, d.place_id, d.match_kind, d.matched_text, d.confidence,
           'gazetteer', p_detector_version, k.organization_id,
           'public'::platform.visibility, v_uid, v_uid
    from _detected d
    join seo.keyword k on k.id = d.keyword_id
    on conflict (keyword_id, place_id, match_kind) where deleted_at is null
    do update set confidence = excluded.confidence,
                  matched_text = excluded.matched_text,
                  detector_version = excluded.detector_version,
                  updated_by = v_uid
    returning 1
  ) select count(*)::integer into v_written from written;

  -- The derived FACT goes through the one fact-store path, against the one
  -- existing dimension. Two keywords are never touched: one a human ruled
  -- (THE EXPERT ALWAYS WINS — an override is data, not an obstacle), and one
  -- already carrying explicit_local (re-stamping churns history for nothing).
  select c.id into v_dim_id
  from platform.categories c
  where c.dimension = 'seo_facet' and c.parent_id is null
    and c.slug = 'local_intent' and c.deleted_at is null;
  if v_dim_id is null then
    raise exception 'seo_registry_unknown_facet: the local_intent dimension is missing from the facet registry.';
  end if;

  with human as (
    select distinct kf.keyword_id
    from seo.keyword_facet kf
    join platform.categories cv on cv.id = kf.category_id and cv.parent_id = v_dim_id
    where kf.deleted_at is null and kf.source = 'human'
      and kf.keyword_id = any(p_keyword_ids)
  ),
  already as (
    select distinct kf.keyword_id
    from seo.keyword_facet kf
    join platform.categories cv on cv.id = kf.category_id and cv.parent_id = v_dim_id
    where kf.deleted_at is null
      and coalesce(cv.metadata->>'value', split_part(cv.slug, ':', 2)) = 'explicit_local'
      and kf.keyword_id = any(p_keyword_ids)
  ),
  candidates as (
    select distinct d.keyword_id from _detected d
  )
  select array_agg(c.keyword_id),
         (select count(*)::integer from human h
           where h.keyword_id in (select keyword_id from candidates))
    into v_targets, v_protected
  from candidates c
  where c.keyword_id not in (select keyword_id from human)
    and c.keyword_id not in (select keyword_id from already);

  if v_targets is not null and cardinality(v_targets) > 0 then
    perform seo.keyword_facet_set(
      v_targets, 'local_intent', 'explicit_local', 'rule',
      null::uuid, 95::smallint, p_detector_version);
    v_stamped := cardinality(v_targets);
  end if;

  return query
  select cardinality(p_keyword_ids)::integer,
         v_written, v_retired,
         (select count(distinct d.keyword_id)::integer from _detected d),
         v_stamped, coalesce(v_protected, 0);
end;
$$;

comment on function seo.stamp_keyword_places(uuid[], text) is
  'Persists gazetteer detections for a bounded keyword set and derives local_intent=explicit_local through seo.keyword_facet_set. Never overwrites a human-sourced fact.';

-- ── 3. Bounded, demand-ordered backfill ─────────────────────────────────────
-- Reuses seo.keyword_classification_queue: it already carries every GSC-active
-- keyword with its measured demand, which is exactly the order this pass wants.
-- A second ledger would be a second thing to keep true.
create or replace function seo.fn_backfill_keyword_places(
  p_limit integer,
  p_min_impressions integer,
  p_detector_version text default 'gazetteer-2026-08-22'
)
returns table (
  claimed integer,
  keywords_with_places integer,
  places_written integer,
  local_intent_stamped integer,
  human_protected integer
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_ids uuid[];
  v_row record;
begin
  if not public.is_admin() then
    raise exception 'seo_geo_forbidden: the place backfill is an admin pass.';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'seo_geo_bad_limit: p_limit must be >= 1 (it is a feature knob, never a constant).';
  end if;

  select array_agg(q.keyword_id) into v_ids
  from (
    select q.keyword_id
    from seo.keyword_classification_queue q
    where q.place_scanned_at is null
      and (q.priority_clicks > 0
           or q.priority_impressions >= coalesce(p_min_impressions, 0))
    order by q.priority_clicks desc, q.priority_impressions desc, q.keyword_id
    limit p_limit
  ) q;

  if v_ids is null then
    return query select 0, 0, 0, 0, 0;
    return;
  end if;

  select * into v_row from seo.stamp_keyword_places(v_ids, p_detector_version);

  update seo.keyword_classification_queue q
     set place_scanned_at = now(),
         place_detector_version = p_detector_version,
         places_found = coalesce((
           select count(*) from seo.keyword_place kp
            where kp.keyword_id = q.keyword_id and kp.deleted_at is null), 0)
   where q.keyword_id = any(v_ids);

  return query select cardinality(v_ids)::integer,
                      v_row.keywords_with_places, v_row.places_written,
                      v_row.local_intent_stamped, v_row.human_protected;
end;
$$;

comment on function seo.fn_backfill_keyword_places(integer, integer, text) is
  'One bounded, demand-ordered place-detection pass. Both ceilings are platform.feature_knob rows under seo.keyword_place_detection — there is no code fallback.';

-- ── 4. What the workbench reads ─────────────────────────────────────────────
create or replace function seo.keyword_place_status(
  p_site_id uuid,
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
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_window integer;
  v_dim_id uuid;
begin
  if p_site_id is not null then
    perform seo.gsc_assert_site_access(p_site_id);
  elsif not public.is_admin() then
    raise exception 'seo_geo_forbidden: ask for a site, or be an admin.';
  end if;

  select max(q.demand_window_days) into v_window from seo.keyword_classification_queue q;
  select c.id into v_dim_id from platform.categories c
   where c.dimension = 'seo_facet' and c.parent_id is null
     and c.slug = 'local_intent' and c.deleted_at is null;

  return query
  with ledger as (
    select count(*)::bigint as total,
           count(*) filter (where q.place_scanned_at is not null)::bigint as scanned,
           count(*) filter (where q.place_scanned_at is null)::bigint as pending,
           count(*) filter (where q.place_scanned_at is null
                              and q.priority_clicks = 0
                              and q.priority_impressions < coalesce(p_min_impressions, 0))::bigint as deferred,
           coalesce(sum(q.priority_clicks) filter (where q.place_scanned_at is null), 0)::bigint as pend_clicks,
           coalesce(sum(q.priority_impressions) filter (where q.place_scanned_at is null), 0)::bigint as pend_imps,
           coalesce(sum(q.priority_clicks) filter (where q.place_scanned_at is not null), 0)::bigint as done_clicks,
           coalesce(sum(q.priority_clicks), 0)::bigint as all_clicks,
           max(q.place_scanned_at) as last_at
    from seo.keyword_classification_queue q
  ),
  universal as (
    select (select count(distinct kp.keyword_id) from seo.keyword_place kp where kp.deleted_at is null)::bigint as with_places,
           (select count(distinct kf.keyword_id)
              from seo.keyword_facet kf
              join platform.categories cv on cv.id = kf.category_id and cv.parent_id = v_dim_id
             where kf.deleted_at is null
               and coalesce(cv.metadata->>'value', split_part(cv.slug, ':', 2)) = 'explicit_local')::bigint as local_kws
  ),
  up_next as (
    select k.phrase
    from seo.keyword_classification_queue q
    join seo.keyword k on k.id = q.keyword_id
    where q.place_scanned_at is null
      and (q.priority_clicks > 0 or q.priority_impressions >= coalesce(p_min_impressions, 0))
    order by q.priority_clicks desc, q.priority_impressions desc, q.keyword_id
    limit 1
  ),
  site_winner as (
    select distinct on (spd.date) spd.date, spd.run_id
    from seo.search_performance_daily spd
    where p_site_id is not null and spd.provider = 'gsc' and spd.site_id = p_site_id
      and spd.dimension_profile = 'query'
      and spd.date >= current_date - coalesce(v_window, 90)
    order by spd.date, spd.created_at desc, spd.run_id desc
  ),
  site_roll as (
    select spd.keyword_id, sum(spd.clicks)::bigint as clicks
    from seo.search_performance_daily spd
    join site_winner w on w.date = spd.date and w.run_id = spd.run_id
    where p_site_id is not null and spd.provider = 'gsc' and spd.site_id = p_site_id
      and spd.dimension_profile = 'query' and spd.keyword_id is not null
      and spd.date >= current_date - coalesce(v_window, 90)
    group by spd.keyword_id
  ),
  site_agg as (
    select count(*)::bigint as kws,
           count(*) filter (where q.place_scanned_at is not null)::bigint as scanned,
           count(*) filter (where kp.keyword_id is not null)::bigint as local_kws,
           coalesce(sum(sr.clicks), 0)::bigint as clicks,
           coalesce(sum(sr.clicks) filter (where kp.keyword_id is not null), 0)::bigint as local_clicks
    from site_roll sr
    left join seo.keyword_classification_queue q on q.keyword_id = sr.keyword_id
    left join lateral (
      select 1 as keyword_id from seo.keyword_place kp2
       where kp2.keyword_id = sr.keyword_id and kp2.deleted_at is null limit 1
    ) kp on true
  ),
  areas as (
    select count(*)::bigint as total,
           count(*) filter (where coalesce(array_length(g.place_ids, 1), 0) > 0)::bigint as with_places,
           count(*) filter (where coalesce(array_length(g.place_ids, 1), 0) = 0
                              and jsonb_array_length(g.match_tokens) = 0)::bigint as empty
    from seo.site_geo_area g
    where p_site_id is not null and g.site_id = p_site_id and g.deleted_at is null
  )
  select l.total, l.scanned, l.pending, l.deferred, l.pend_clicks, l.pend_imps,
         l.done_clicks, l.all_clicks,
         u.with_places, u.local_kws,
         (select phrase from up_next), l.last_at,
         case when p_site_id is null then null else s.kws end,
         case when p_site_id is null then null else s.scanned end,
         case when p_site_id is null then null else s.local_kws end,
         case when p_site_id is null then null else s.clicks end,
         case when p_site_id is null then null else s.local_clicks end,
         a.total, a.with_places, a.empty,
         coalesce(v_window, 90)
  from ledger l cross join universal u cross join site_agg s cross join areas a;
end;
$$;

comment on function seo.keyword_place_status(uuid, integer) is
  'The place-detection scoreboard the value workbench renders: how much of the demand has been scanned, how much of it is local, and whether this site''s geo areas actually name any places.';

-- ── 5. The picker read — an area names PLACES, not typed words ──────────────
create or replace function seo.geo_place_search(
  p_query text,
  p_kinds text[],
  p_limit integer
)
returns table (
  id uuid,
  place_kind text,
  name text,
  state_code text,
  population integer,
  ambiguity text,
  ambiguity_reason text,
  label text,
  keyword_count bigint
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_q text := lower(btrim(coalesce(p_query, '')));
begin
  if (select auth.uid()) is null then
    raise exception 'seo_geo_unauthenticated: sign in to search places.';
  end if;

  return query
  select p.id, p.place_kind, p.name, p.state_code, p.population,
         p.ambiguity, p.ambiguity_reason,
         case when p.place_kind = 'city' then p.name || ', ' || p.state_code
              else p.name end as label,
         (select count(*) from seo.keyword_place kp
           where kp.place_id = p.id and kp.deleted_at is null) as keyword_count
  from seo.geo_place p
  where p.deleted_at is null and p.is_active
    and (p_kinds is null or p.place_kind = any(p_kinds))
    and (v_q = '' or p.normalized_name like v_q || '%'
         or exists (select 1 from jsonb_array_elements_text(p.match_tokens) t(v)
                     where lower(t.v) like v_q || '%'))
  order by (p.normalized_name = v_q) desc,
           p.population desc nulls last, p.name
  limit greatest(coalesce(p_limit, 25), 1);
end;
$$;

comment on function seo.geo_place_search(text, text[], integer) is
  'Type-ahead over the gazetteer for the geo-area editor. A picked place carries its own aliases, state qualifier and ambiguity rule — which a hand-typed word never can.';

grant execute on function seo.detect_keyword_places(uuid[]) to authenticated;
grant execute on function seo.stamp_keyword_places(uuid[], text) to authenticated;
grant execute on function seo.fn_backfill_keyword_places(integer, integer, text) to authenticated;
grant execute on function seo.keyword_place_status(uuid, integer) to authenticated;
grant execute on function seo.geo_place_search(text, text[], integer) to authenticated;
grant select, insert, update, delete on seo.geo_place, seo.keyword_place to svc_seo;

-- ── 6. The knobs (every ceiling is a row, with a dated review) ──────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due)
values
  ('seo.keyword_place_detection', 'batch_keywords', '300'::jsonb, '300'::jsonb,
   'integer', 'keywords', 50, 20000,
   'Keywords per place-detection pass',
   'How many keywords one bounded place pass claims from the demand ledger.',
   'agent',
   'This pass is pure SQL over a 1,059-row gazetteer -- no model, no provider, no dollars -- so the only ceiling to size against is the authenticated role''s 8s statement timeout, and a pass that trips it does not error loudly, it renders as a spinner (THE SCOPE RULE failure mode). Measured live 2026-08-22 on the real corpus, repeated: 200 keywords = 2.6s, 300 = 3.5-3.7s, 500 = 6.1s, 1000 = 11.4-11.6s. The cost is roughly 12ms/keyword and is dominated by the fact-store write (seo.keyword_facet is versioned), not by the regex match. 300 keeps a pass at well under half the ceiling. The click-earning universe is 1,442 keywords, so five presses cover everything that has ever earned a click; the full 67,884 GSC-active corpus is what the proposed nightly schedule is for. Re-measure before raising this.',
   '2026-10-22'),
  ('seo.keyword_place_detection', 'min_impressions', '0'::jsonb, '0'::jsonb,
   'integer', 'impressions', 0, 100000,
   'Demand floor for place detection',
   'Keywords below this 90-day impression count are deferred (a keyword that earned a click is never below the floor).',
   'agent',
   'Deliberately 0, unlike the classifier''s floor of 2. That floor exists because each classified keyword costs a model call; this pass costs a regex, so deferring the long tail buys nothing and would leave "near me" keywords with no clicks unflagged — exactly the searches a local business cares about. The knob exists so a site with a pathological corpus can raise it without a deploy; the deferred count is always reported, so the exclusion can never be silent.',
   '2026-10-22')
on conflict (feature, key) do nothing;
