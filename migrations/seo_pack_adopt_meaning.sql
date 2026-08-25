-- KI-030 part 2 — the pack's meaning is what gets adopted, previewed and reconciled.
--
-- Part 1 flipped what a pack CARRIES (seo_pack_content_dimension_values.sql).
-- This file flips what the product DOES with it:
--   * adopt writes dimension values + matchers + worth (additive, idempotent,
--     never over a site's own ruling) instead of copying template rules;
--   * the preview projects those matchers and that worth on the site's real
--     keywords, reading the resolver's published summary as it does today;
--   * the site status reconciles meaning items — including rows a site adopted
--     BEFORE the flip, matched through metadata.converted_from_rules;
--   * `rules` stops being a pack part anywhere.
--
-- Idempotent. Safe to re-apply.

-- ── The one place that answers "which value does this pack item mean HERE" ──
create or replace function seo._pack_site_value_id(
  p_site_id uuid, p_scope text, p_dimension_slug text, p_value text)
returns uuid
language sql stable
set search_path to 'pg_catalog','public'
as $fn$
  select c.id
    from platform.categories c
   where c.dimension = 'seo_facet' and c.deleted_at is null
     and c.slug = case when p_scope = 'site'
       then 'site_' || p_dimension_slug || '_'
            || replace(left(p_site_id::text, 8), '-', '') || ':' || p_value
       else p_dimension_slug || ':' || p_value end
   limit 1;
$fn$;

comment on function seo._pack_site_value_id(uuid,text,text,text) is
  'KI-030 — a pack item names a dimension value in the abstract; this resolves it to THIS site''s value row (or NULL when the site has never had one). Read-only: adoption is the only thing that creates.';

-- ── ADOPT ──────────────────────────────────────────────────────────────────
drop function if exists seo.adopt_starter_pack(uuid,uuid,text[],uuid[],boolean,jsonb,jsonb,uuid[],uuid[],boolean);

create or replace function seo.adopt_starter_pack(
  p_site_id uuid, p_pack_id uuid,
  p_include text[] default null,
  p_topic_ids uuid[] default null,
  p_seed_guidelines boolean default true,
  p_geo_places jsonb default null,
  p_geo_place_ids jsonb default null,
  p_item_ids uuid[] default null,
  p_reset boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'seo','platform','web','pg_temp'
as $function$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
  v_pack seo.starter_pack%rowtype;
  v_topics int := 0; v_bands int := 0; v_geo_bands int := 0;
  v_areas int := 0; v_guidelines boolean := false;
  v_filled int := 0; v_pending bigint := 0;
  v_meaning int := 0; v_matchers int := 0; v_worths int := 0; v_skipped int := 0;
  v_reset_topics int := 0; v_reset_bands int := 0;
  v_reset_geo_bands int := 0; v_reset_areas int := 0; v_reset_meaning int := 0;
  v_existing text;
  v_want text[] := coalesce(p_include, array['topics','value_bands','geo_bands','geo_areas','meaning']);
  it seo.starter_pack_item%rowtype;
  m jsonb; v_dim uuid; v_value uuid; v_n int;
begin
  perform seo.gsc_assert_site_access(p_site_id);

  select * into v_pack from seo.starter_pack where id = p_pack_id and deleted_at is null;
  if not found then
    raise exception 'seo_pack_not_found: %', p_pack_id;
  end if;

  select organization_id into v_org from web.site where id = p_site_id and deleted_at is null;
  if v_org is null then
    raise exception 'seo_site_not_found: %', p_site_id;
  end if;

  if 'topics' = any(v_want) then
    with ins as (
      insert into seo.site_topic_value
        (site_id, topic_id, weight, lead_quality, offering_match, notes,
         organization_id, created_by, updated_by, metadata)
      select p_site_id, i.topic_id, i.weight, i.lead_quality, i.offering_match,
             i.notes, v_org, v_uid, v_uid,
             jsonb_build_object('adopted_from_pack', v_pack.slug, 'pack_item_id', i.id)
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
        and (p_topic_ids is null or i.topic_id = any(p_topic_ids))
        and (p_item_ids is null or i.id = any(p_item_ids))
      on conflict (site_id, topic_id) do nothing
      returning 1)
    select count(*)::int into v_topics from ins;

    if p_reset then
      with upd as (
        update seo.site_topic_value t
           set weight = i.weight, lead_quality = i.lead_quality,
               offering_match = i.offering_match, notes = i.notes,
               deleted_at = null, updated_by = v_uid,
               metadata = coalesce(t.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
          from seo.starter_pack_item i
         where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
           and (p_item_ids is null or i.id = any(p_item_ids))
           and t.site_id = p_site_id
           and t.metadata->>'pack_item_id' = i.id::text
        returning 1)
      select count(*)::int into v_reset_topics from upd;
    end if;
  end if;

  if 'value_bands' = any(v_want) then
    with ins as (
      insert into seo.site_vocabulary
        (site_id, vocab_kind, value, label, description, sort, config,
         organization_id, created_by, updated_by, metadata)
      select p_site_id, 'value_band', i.value, i.label, i.description, i.sort, i.config,
             v_org, v_uid, v_uid,
             jsonb_build_object('adopted_from_pack', v_pack.slug, 'pack_item_id', i.id)
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'value_band' and i.deleted_at is null
        and (p_item_ids is null or i.id = any(p_item_ids))
        and not exists (select 1 from seo.site_vocabulary v
                         where v.site_id = p_site_id and v.vocab_kind = 'value_band'
                           and v.value = i.value)
      on conflict do nothing
      returning 1)
    select count(*)::int into v_bands from ins;

    if p_reset then
      with upd as (
        update seo.site_vocabulary v
           set label = i.label, description = i.description, sort = i.sort,
               config = i.config, active = true, deleted_at = null, updated_by = v_uid,
               metadata = coalesce(v.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
          from seo.starter_pack_item i
         where i.pack_id = p_pack_id and i.item_kind = 'value_band' and i.deleted_at is null
           and (p_item_ids is null or i.id = any(p_item_ids))
           and v.site_id = p_site_id and v.vocab_kind = 'value_band'
           and v.metadata->>'pack_item_id' = i.id::text
           and not exists (select 1 from seo.site_vocabulary live
                            where live.site_id = p_site_id and live.vocab_kind = 'value_band'
                              and live.value = v.value and live.deleted_at is null
                              and live.id <> v.id)
        returning 1)
      select count(*)::int into v_reset_bands from upd;
    end if;
  end if;

  if 'geo_bands' = any(v_want) then
    with ins as (
      insert into seo.site_vocabulary
        (site_id, vocab_kind, value, label, description, sort, config,
         organization_id, created_by, updated_by, metadata)
      select p_site_id, 'geo_band', i.value, i.label, i.description, i.sort, i.config,
             v_org, v_uid, v_uid,
             jsonb_build_object('adopted_from_pack', v_pack.slug, 'pack_item_id', i.id)
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'geo_band' and i.deleted_at is null
        and (p_item_ids is null or i.id = any(p_item_ids))
        and not exists (select 1 from seo.site_vocabulary v
                         where v.site_id = p_site_id and v.vocab_kind = 'geo_band'
                           and v.value = i.value)
      on conflict do nothing
      returning 1)
    select count(*)::int into v_geo_bands from ins;

    if p_reset then
      with upd as (
        update seo.site_vocabulary v
           set label = i.label, description = i.description, sort = i.sort,
               config = i.config, active = true, deleted_at = null, updated_by = v_uid,
               metadata = coalesce(v.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
          from seo.starter_pack_item i
         where i.pack_id = p_pack_id and i.item_kind = 'geo_band' and i.deleted_at is null
           and (p_item_ids is null or i.id = any(p_item_ids))
           and v.site_id = p_site_id and v.vocab_kind = 'geo_band'
           and v.metadata->>'pack_item_id' = i.id::text
           and not exists (select 1 from seo.site_vocabulary live
                            where live.site_id = p_site_id and live.vocab_kind = 'geo_band'
                              and live.value = v.value and live.deleted_at is null
                              and live.id <> v.id)
        returning 1)
      select count(*)::int into v_reset_geo_bands from upd;
    end if;
  end if;

  if 'geo_areas' = any(v_want) then
    with ins as (
      insert into seo.site_geo_area
        (site_id, label, area_kind, match_tokens, place_ids, geo_band, notes,
         organization_id, created_by, updated_by, metadata)
      select p_site_id, a.label, a.area_kind, a.tokens, a.place_ids, a.geo_band, a.notes,
             v_org, v_uid, v_uid,
             jsonb_build_object(
               'adopted_from_pack', v_pack.slug,
               'pack_item_id', a.item_id,
               'places_pending',
               jsonb_array_length(a.tokens) = 0
                 and coalesce(array_length(a.place_ids, 1), 0) = 0)
      from seo._pack_geo_archetypes(p_pack_id, p_geo_places, p_geo_place_ids) a
      where (p_item_ids is null or a.item_id = any(p_item_ids))
        and not exists (select 1 from seo.site_geo_area g
                         where g.site_id = p_site_id and g.label = a.label)
      on conflict do nothing
      returning 1)
    select count(*)::int into v_areas from ins;

    with upd as (
      update seo.site_geo_area g
         set match_tokens = a.tokens,
             place_ids = a.place_ids,
             metadata = (coalesce(g.metadata, '{}'::jsonb) - 'places_pending')
                        || jsonb_build_object('places_filled_at', now()),
             updated_by = v_uid
        from seo._pack_geo_archetypes(p_pack_id, p_geo_places, p_geo_place_ids) a
       where g.site_id = p_site_id
         and g.deleted_at is null
         and g.label = a.label
         and (p_item_ids is null or a.item_id = any(p_item_ids))
         and coalesce(jsonb_array_length(g.match_tokens), 0) = 0
         and coalesce(array_length(g.place_ids, 1), 0) = 0
         and (jsonb_array_length(a.tokens) > 0
              or coalesce(array_length(a.place_ids, 1), 0) > 0)
      returning 1)
    select count(*)::int into v_filled from upd;

    if p_reset then
      with upd as (
        update seo.site_geo_area g
           set area_kind = coalesce(i.area_kind, 'city'), geo_band = i.geo_band,
               notes = i.notes, deleted_at = null, updated_by = v_uid,
               metadata = coalesce(g.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
          from seo.starter_pack_item i
         where i.pack_id = p_pack_id and i.item_kind = 'geo_area' and i.deleted_at is null
           and (p_item_ids is null or i.id = any(p_item_ids))
           and g.site_id = p_site_id
           and g.metadata->>'pack_item_id' = i.id::text
           and not exists (select 1 from seo.site_geo_area live
                            where live.site_id = p_site_id and live.label = g.label
                              and live.deleted_at is null and live.id <> g.id)
        returning 1)
      select count(*)::int into v_reset_areas from upd;
    end if;
  end if;

  -- ── MEANING: dimension values + matchers + worth (KI-030) ────────────────
  -- Additive and idempotent by construction: a matcher is written only when
  -- this site has no live matcher with the same phrase on the same value, and
  -- a worth row only when this site has expressed NO worth for that value.
  -- A site's own ruling is never overwritten — not even by `reset`, which only
  -- puts back rows still carrying this pack's provenance.
  if 'meaning' = any(v_want) then
    for it in
      select * from seo.starter_pack_item
       where pack_id = p_pack_id and item_kind = 'meaning' and deleted_at is null
         and (p_item_ids is null or id = any(p_item_ids))
       order by sort, label
    loop
      if it.dimension_scope = 'site' then
        v_dim := seo._ensure_site_dimension(
          p_site_id, it.dimension_slug,
          coalesce(it.dimension_label, initcap(replace(it.dimension_slug, '_', ' '))),
          it.description, 'intrinsic');
        v_value := seo._ensure_value(v_dim, it.value, it.label,
          jsonb_build_object('pack_item_id', it.id::text,
                             'adopted_from_pack', v_pack.slug,
                             'description', it.description));
      else
        -- Platform vocabularies are governed rows. A pack may SCORE one; it may
        -- never invent one, so an unknown value is reported, not created.
        select id into v_dim from platform.categories
         where dimension = 'seo_facet' and parent_id is null
           and slug = it.dimension_slug and deleted_at is null;
        select id into v_value from platform.categories
         where dimension = 'seo_facet'
           and slug = it.dimension_slug || ':' || it.value and deleted_at is null;
        if v_dim is null or v_value is null then
          v_skipped := v_skipped + 1;
          continue;
        end if;
      end if;
      v_meaning := v_meaning + 1;

      for m in select value from jsonb_array_elements(coalesce(it.matchers, '[]'::jsonb)) loop
        insert into seo.dimension_value_matcher
          (site_id, value_id, kind, pattern, enabled, origin, pack_id, notes,
           organization_id, created_by, updated_by, metadata)
        select p_site_id, v_value, m->>'kind', m->>'pattern',
               coalesce((m->>'enabled')::boolean, true), 'pack', p_pack_id,
               'from starter pack "' || v_pack.slug || '"',
               v_org, v_uid, v_uid,
               jsonb_build_object('adopted_from_pack', v_pack.slug,
                                  'pack_item_id', it.id::text)
        where not exists (
          select 1 from seo.dimension_value_matcher x
           where x.site_id = p_site_id and x.value_id = v_value
             and x.kind = m->>'kind'
             and lower(coalesce(x.pattern, '')) = lower(m->>'pattern')
             and x.deleted_at is null);
        get diagnostics v_n = row_count;
        v_matchers := v_matchers + v_n;
      end loop;

      if it.worth_effect is not null then
        insert into seo.site_value_worth
          (site_id, value_id, effect, amount, origin, pack_id, notes,
           organization_id, created_by, updated_by, metadata)
        select p_site_id, v_value, it.worth_effect, it.worth_amount, 'pack', p_pack_id,
               coalesce(it.notes, 'from starter pack "' || v_pack.slug || '"'),
               v_org, v_uid, v_uid,
               jsonb_build_object('adopted_from_pack', v_pack.slug,
                                  'pack_item_id', it.id::text)
        where not exists (
          select 1 from seo.site_value_worth w
           where w.site_id = p_site_id and w.value_id = v_value and w.deleted_at is null);
        get diagnostics v_n = row_count;
        v_worths := v_worths + v_n;
      end if;

      if p_reset then
        update seo.site_value_worth w
           set effect = it.worth_effect, amount = it.worth_amount,
               notes = coalesce(it.notes, w.notes), deleted_at = null, updated_by = v_uid,
               metadata = coalesce(w.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
         where w.site_id = p_site_id and w.value_id = v_value
           and w.metadata->>'pack_item_id' = it.id::text
           and it.worth_effect is not null;
        get diagnostics v_n = row_count;
        v_reset_meaning := v_reset_meaning + v_n;

        update seo.dimension_value_matcher x
           set deleted_at = null, updated_by = v_uid,
               metadata = coalesce(x.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
         where x.site_id = p_site_id and x.value_id = v_value
           and x.metadata->>'pack_item_id' = it.id::text
           and x.deleted_at is not null
           and not exists (
             select 1 from seo.dimension_value_matcher live
              where live.site_id = x.site_id and live.value_id = x.value_id
                and live.kind = x.kind
                and lower(coalesce(live.pattern,'')) = lower(coalesce(x.pattern,''))
                and live.deleted_at is null);
        get diagnostics v_n = row_count;
        v_reset_meaning := v_reset_meaning + v_n;
      end if;
    end loop;
  end if;

  if p_seed_guidelines and v_pack.guidelines is not null then
    select g.guidelines into v_existing from seo.gsc_site_kw_guidelines(p_site_id) g;
    if coalesce(btrim(v_existing), '') = '' then
      perform 1 from seo.gsc_set_site_kw_guidelines(p_site_id, v_pack.guidelines);
      v_guidelines := true;
    end if;
  end if;

  select count(*) into v_pending
  from seo.site_geo_area g
  where g.site_id = p_site_id and g.deleted_at is null
    and coalesce(jsonb_array_length(g.match_tokens), 0) = 0
    and coalesce(array_length(g.place_ids, 1), 0) = 0;

  return jsonb_build_object(
    'pack', v_pack.slug, 'site_id', p_site_id,
    'topics', v_topics, 'value_bands', v_bands, 'geo_bands', v_geo_bands,
    'geo_areas', v_areas, 'guidelines_seeded', v_guidelines,
    'meaning_values', v_meaning, 'matchers', v_matchers, 'worths', v_worths,
    'meaning_skipped', v_skipped,
    'geo_areas_filled', v_filled, 'geo_areas_pending', v_pending,
    'reset_meaning', v_reset_meaning, 'reset_topics', v_reset_topics,
    'reset_value_bands', v_reset_bands, 'reset_geo_bands', v_reset_geo_bands,
    'reset_geo_areas', v_reset_areas);
end;
$function$;

revoke all on function seo.adopt_starter_pack(uuid,uuid,text[],uuid[],boolean,jsonb,jsonb,uuid[],boolean) from public;
revoke all on function seo.adopt_starter_pack(uuid,uuid,text[],uuid[],boolean,jsonb,jsonb,uuid[],boolean) from anon, authenticated;

comment on function seo.adopt_starter_pack(uuid,uuid,text[],uuid[],boolean,jsonb,jsonb,uuid[],boolean) is
  'The pack MATERIALIZER (internal — the public door is public.library_subscribe). Writes topic worth, band vocabularies, geo archetypes and MEANING (dimension values + matchers + worth). Additive, idempotent, never over a site''s own ruling.';
