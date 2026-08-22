-- =============================================================================
-- PACK ADOPTION MUST DEMAND PLACES  (HANDOFF I8)
-- =============================================================================
-- A starter pack ships geo areas as ARCHETYPES with empty match_tokens — "a
-- pack never carries somebody else's cities". Adoption then wrote four labelled
-- shells that match no keyword, so the ideal/acceptable/expansion/excluded model
-- was a NO-OP on every adopting site until somebody happened to notice. Measured
-- 2026-08-22 on datadestruction.com: all 4 areas carried zero tokens and
-- gsc_site_meaning_health reported them `inert`.
--
-- The cause is the adoption CONTRACT, not the site. So adoption now:
--   1. accepts the business's own places per archetype (p_geo_places), keyed by
--      the pack item id the caller was shown;
--   2. when places are skipped, stamps the created area
--      metadata.places_pending = true — the shell says out loud that it is
--      unfinished instead of looking configured;
--   3. on RE-adoption fills an area that is still empty (additive — that is
--      "writing only what is missing"), and NEVER touches an area that already
--      carries tokens, because those are the site's own ruling;
--   4. reports geo_areas_pending / geo_areas_filled so the UI can put a
--      persistent door in front of the unfinished ones.
--
-- Tokens are normalized (trim/lower/dedupe) and pass through the existing
-- site_geo_area_assert_tokens BEFORE trigger — THE REGEX WALL is the one
-- authority on what a place name may contain, and this function does not fork it.
--
-- Idempotent: CREATE OR REPLACE only. Safe to re-run.
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
-- =============================================================================

-- The archetypes of one pack, each carrying whatever places the caller gave for
-- it, normalized once. Normalization lives in ONE place so the same token set is
-- written whether it arrived from the adoption wizard, the geo bench, or an
-- agent. THE REGEX WALL still has the final word: every write goes through the
-- site_geo_area_assert_tokens BEFORE trigger, which this never re-implements.
create or replace function seo._pack_geo_archetypes(
  p_pack_id uuid,
  p_geo_places jsonb
)
returns table(item_id uuid, label text, area_kind text, geo_band text, notes text, tokens jsonb)
language sql
stable
set search_path to 'seo', 'pg_temp'
as $function$
  select i.id,
         i.label,
         coalesce(i.area_kind, 'city'),
         i.geo_band,
         i.notes,
         coalesce(
           (select jsonb_agg(distinct t.tok)
              from jsonb_array_elements_text(
                     coalesce(p_geo_places -> i.id::text, '[]'::jsonb)) raw(tok0)
              cross join lateral (select lower(btrim(raw.tok0)) as tok) t
             where t.tok <> ''),
           '[]'::jsonb)
  from seo.starter_pack_item i
  where i.pack_id = p_pack_id and i.item_kind = 'geo_area' and i.deleted_at is null;
$function$;

grant execute on function seo._pack_geo_archetypes(uuid, jsonb) to authenticated, service_role;

-- A 6th parameter is a NEW overload, and a 5-argument call would then be
-- ambiguous — so the old signature goes.
drop function if exists seo.adopt_starter_pack(uuid, uuid, text[], uuid[], boolean);

create or replace function seo.adopt_starter_pack(
  p_site_id uuid,
  p_pack_id uuid,
  p_include text[] default null::text[],
  p_topic_ids uuid[] default null::uuid[],
  p_seed_guidelines boolean default true,
  p_geo_places jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'seo', 'platform', 'web', 'pg_temp'
as $function$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
  v_pack seo.starter_pack%rowtype;
  v_topics int := 0; v_bands int := 0; v_geo_bands int := 0;
  v_areas int := 0; v_rules int := 0; v_guidelines boolean := false;
  v_filled int := 0; v_pending bigint := 0;
  v_existing text;
  v_want text[] := coalesce(p_include, array['topics','value_bands','geo_bands','geo_areas','rules']);
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
        (site_id, topic_id, weight, lead_quality, service_match, notes,
         organization_id, created_by, updated_by)
      select p_site_id, i.topic_id, i.weight, i.lead_quality, i.service_match,
             i.notes, v_org, v_uid, v_uid
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
        and (p_topic_ids is null or i.topic_id = any(p_topic_ids))
      on conflict (site_id, topic_id) do nothing
      returning 1)
    select count(*)::int into v_topics from ins;
  end if;

  if 'value_bands' = any(v_want) then
    with ins as (
      insert into seo.site_vocabulary
        (site_id, vocab_kind, value, label, description, sort, config,
         organization_id, created_by, updated_by)
      select p_site_id, 'value_band', i.value, i.label, i.description, i.sort, i.config,
             v_org, v_uid, v_uid
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'value_band' and i.deleted_at is null
      on conflict do nothing
      returning 1)
    select count(*)::int into v_bands from ins;
  end if;

  if 'geo_bands' = any(v_want) then
    with ins as (
      insert into seo.site_vocabulary
        (site_id, vocab_kind, value, label, description, sort, config,
         organization_id, created_by, updated_by)
      select p_site_id, 'geo_band', i.value, i.label, i.description, i.sort, i.config,
             v_org, v_uid, v_uid
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'geo_band' and i.deleted_at is null
      on conflict do nothing
      returning 1)
    select count(*)::int into v_geo_bands from ins;
  end if;

  if 'geo_areas' = any(v_want) then
    with ins as (
      insert into seo.site_geo_area
        (site_id, label, area_kind, match_tokens, geo_band, notes,
         organization_id, created_by, updated_by, metadata)
      select p_site_id, a.label, a.area_kind, a.tokens, a.geo_band, a.notes,
             v_org, v_uid, v_uid,
             jsonb_build_object(
               'adopted_from_pack', v_pack.slug,
               'pack_item_id', a.item_id,
               -- Loud, persistent, and machine-readable: this area was created
               -- as a labelled shell and has never been told what it stands for.
               'places_pending', jsonb_array_length(a.tokens) = 0)
      from seo._pack_geo_archetypes(p_pack_id, p_geo_places) a
      on conflict do nothing
      returning 1)
    select count(*)::int into v_areas from ins;

    -- Fill an area this site already has but never gave places to. Additive:
    -- an area that already carries tokens is the site's own ruling and is left
    -- exactly as it is, on every re-adoption, forever.
    with upd as (
      update seo.site_geo_area g
         set match_tokens = a.tokens,
             metadata = (coalesce(g.metadata, '{}'::jsonb) - 'places_pending')
                        || jsonb_build_object('places_filled_at', now()),
             updated_by = v_uid
        from seo._pack_geo_archetypes(p_pack_id, p_geo_places) a
       where g.site_id = p_site_id
         and g.deleted_at is null
         and g.label = a.label
         and coalesce(jsonb_array_length(g.match_tokens), 0) = 0
         and jsonb_array_length(a.tokens) > 0
      returning 1)
    select count(*)::int into v_filled from upd;
  end if;

  if 'rules' = any(v_want) then
    with ins as (
      insert into seo.keyword_class_rule
        (name, description, pattern, match_kind, target_class, value_multiplier,
         match_facet, match_facet_value, notes, site_id, organization_id,
         is_template, auto_apply, created_by, updated_by, metadata)
      select r.name, r.description, r.pattern, r.match_kind, r.target_class,
             r.value_multiplier, r.match_facet, r.match_facet_value, r.notes,
             p_site_id, v_org, false, false, v_uid, v_uid,
             jsonb_build_object('adopted_from_pack', v_pack.slug, 'template_rule_id', r.id)
      from seo.keyword_class_rule r
      where r.pack_id = p_pack_id and r.is_template and r.deleted_at is null
        and not exists (
          select 1 from seo.keyword_class_rule x
          where x.site_id = p_site_id and x.deleted_at is null
            and x.metadata->>'template_rule_id' = r.id::text)
      returning 1)
    select count(*)::int into v_rules from ins;
  end if;

  if p_seed_guidelines and v_pack.guidelines is not null then
    select g.guidelines into v_existing from seo.gsc_site_kw_guidelines(p_site_id) g;
    if coalesce(btrim(v_existing), '') = '' then
      perform 1 from seo.gsc_set_site_kw_guidelines(p_site_id, v_pack.guidelines);
      v_guidelines := true;
    end if;
  end if;

  -- What is STILL unfinished after this adoption — the number the packs screen
  -- and the meaning-health row put a door in front of.
  select count(*) into v_pending
  from seo.site_geo_area g
  where g.site_id = p_site_id and g.deleted_at is null
    and coalesce(jsonb_array_length(g.match_tokens), 0) = 0;

  return jsonb_build_object(
    'pack', v_pack.slug, 'site_id', p_site_id,
    'topics', v_topics, 'value_bands', v_bands, 'geo_bands', v_geo_bands,
    'geo_areas', v_areas, 'rules', v_rules, 'guidelines_seeded', v_guidelines,
    'geo_areas_filled', v_filled, 'geo_areas_pending', v_pending);
end;
$function$;

comment on function seo.adopt_starter_pack(uuid, uuid, text[], uuid[], boolean, jsonb) is
  'Adopt an industry starter pack onto a site. Additive and idempotent: never overwrites a ruling the site has already made. p_geo_places maps a pack geo_area item id to the business''s own place names; an archetype adopted without places is stamped metadata.places_pending=true and reported in geo_areas_pending, and a later adoption with places fills it.';

grant execute on function seo.adopt_starter_pack(uuid, uuid, text[], uuid[], boolean, jsonb)
  to authenticated, service_role;
