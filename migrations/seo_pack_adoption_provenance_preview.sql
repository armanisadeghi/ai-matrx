-- =============================================================================
-- YOUR RULEBOOK — pack adoption you can READ, with provenance and a what-if
-- =============================================================================
-- Arman, 2026-08-22, on the packs screen: "the UI for this is so horrible that
-- it would be impossible for me to even be able to actually read and understand
-- these." The UI could not be readable because the DATA underneath could not
-- answer the three questions a business asks of an industry pack:
--
--   1. "What will this do to MY keywords?"  — nothing previewed a whole pack;
--      only a single rule could be previewed (gsc_value_rule_preview).
--   2. "What was applied to me, and from where?" — adopt_starter_pack stamped
--      metadata.adopted_from_pack on RULES and GEO AREAS only; the site's bands
--      and topic worth carried nothing, so "which of these is the pack's and
--      which is mine" had no answer for half the ledger.
--   3. "Can I take some of it, change it, and put it back?" — adoption was
--      all-or-nothing per part (p_include), a changed row was indistinguishable
--      from an adopted one, and P13's "re-apply is a button" had no reset.
--
-- Rulings (Arman, chat, 2026-08-22): per-item pick at adoption; two re-apply
-- buttons ("fill what's missing" never touches your rows, "reset to pack" does,
-- after listing what); one-click review & accept for a new site; the org's own
-- industries first; and the law over all of it — EVERY bulk control has an
-- individual AND an all; nothing is ever forced on a user.
--
-- This migration:
--   A. seo.starter_pack.industry_id → iam.industries (the org-industry opt-in,
--      iam.org_industries, is the platform's ONE industry mechanism; the admin
--      Library chip owns authoring — this only lets the user side ORDER by it).
--   B. starter_pack_catalog(p_status, p_organization_id) → + industry, org_match.
--   C. adopt_starter_pack v3: provenance on EVERY written row
--      (metadata.adopted_from_pack + pack_item_id / template_rule_id);
--      p_item_ids / p_rule_ids per-item pick; p_reset overwrites ONLY rows that
--      still carry the pack's provenance (a row the site authored is never
--      touched); archived = the site's ruling, so "fill" never revives it and
--      "reset" does. Places are never reset (they are the business's, not the
--      pack's). Backfills provenance for rows already adopted before today,
--      keyed on the transaction timestamp every row of one adopt call shares.
--   D. starter_pack_site_status(site, pack) — per item: missing / as_adopted /
--      changed / archived, the pack's value beside the site's, adopted_at/by.
--      starter_pack_site_adoptions(site) — one receipt row per adopted pack.
--   E. starter_pack_preview(site, pack, start, end, rule_ids, sample) — the
--      whole-pack what-if over the site's own GSC window: the ONE resolver's
--      reason chain re-arithmetic'd with the pack's not-yet-adopted rules
--      multiplied in (exactly what gsc_value_rule_preview does for one rule),
--      summarized by the same gsc_value_preview_summarize, plus per-rule and
--      per-topic touch counts with real sample keywords. THE SCOPE RULE holds:
--      only the window's keywords are resolved.
--
-- Idempotent. SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
-- and …/pack-adoption-ui-proposal.md.
-- =============================================================================

-- ── A. industry link ────────────────────────────────────────────────────────
alter table seo.starter_pack
  add column if not exists industry_id uuid references iam.industries(id) on delete set null;

comment on column seo.starter_pack.industry_id is
  'The iam.industries row this pack is FOR. Orgs opt into industries via iam.org_industries; the user-side catalog lists matching packs first. NULL = not yet linked (the admin Library chip owns authoring).';

update seo.starter_pack p
   set industry_id = i.id
  from iam.industries i
 where p.slug = 'medical-practice' and i.slug = 'medical' and p.industry_id is null;

-- ── B. catalog, org-aware ───────────────────────────────────────────────────
drop function if exists seo.starter_pack_catalog(text);

create or replace function seo.starter_pack_catalog(
  p_status text default null,
  p_organization_id uuid default null)
returns table(
  id uuid, slug text, name text, industry text, summary text, description text,
  status text, geo_model text, guidelines text, source_notes text,
  source_corpus jsonb, ratified_at timestamptz, ratification_notes text,
  topic_count int, rule_count int, value_band_count int, geo_band_count int,
  geo_area_count int,
  industry_id uuid, industry_name text, org_match boolean)
language sql stable security definer
set search_path to 'seo', 'platform', 'iam', 'pg_temp'
as $function$
  select p.id, p.slug, p.name, p.industry, p.summary, p.description,
         p.status, p.geo_model, p.guidelines, p.source_notes,
         p.source_corpus, p.ratified_at, p.ratification_notes,
         count(*) filter (where i.item_kind = 'topic')::int,
         (select count(*)::int from seo.keyword_class_rule r
           where r.pack_id = p.id and r.is_template and r.deleted_at is null),
         count(*) filter (where i.item_kind = 'value_band')::int,
         count(*) filter (where i.item_kind = 'geo_band')::int,
         count(*) filter (where i.item_kind = 'geo_area')::int,
         p.industry_id,
         ind.name,
         (p_organization_id is not null and p.industry_id is not null and exists (
            select 1 from iam.org_industries oi
             where oi.organization_id = p_organization_id
               and oi.industry_id = p.industry_id))
  from seo.starter_pack p
  left join seo.starter_pack_item i on i.pack_id = p.id and i.deleted_at is null
  left join iam.industries ind on ind.id = p.industry_id
  where p.deleted_at is null
    and (p_status is null or p.status = p_status)
  group by p.id, ind.name
  order by
    (p_organization_id is not null and p.industry_id is not null and exists (
       select 1 from iam.org_industries oi
        where oi.organization_id = p_organization_id
          and oi.industry_id = p.industry_id)) desc,
    case p.status when 'ratified' then 0 when 'proposed' then 1 when 'draft' then 2 else 3 end,
    p.name;
$function$;

grant execute on function seo.starter_pack_catalog(text, uuid) to authenticated, service_role;

-- ── C. adopt_starter_pack v3 ────────────────────────────────────────────────
drop function if exists seo.adopt_starter_pack(uuid, uuid, text[], uuid[], boolean, jsonb, jsonb);

create or replace function seo.adopt_starter_pack(
  p_site_id uuid,
  p_pack_id uuid,
  p_include text[] default null,
  p_topic_ids uuid[] default null,
  p_seed_guidelines boolean default true,
  p_geo_places jsonb default null,
  p_geo_place_ids jsonb default null,
  p_item_ids uuid[] default null,
  p_rule_ids uuid[] default null,
  p_reset boolean default false)
returns jsonb
language plpgsql security definer
set search_path to 'seo', 'platform', 'web', 'pg_temp'
as $function$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
  v_pack seo.starter_pack%rowtype;
  v_topics int := 0; v_bands int := 0; v_geo_bands int := 0;
  v_areas int := 0; v_rules int := 0; v_guidelines boolean := false;
  v_filled int := 0; v_pending bigint := 0;
  v_reset_rules int := 0; v_reset_topics int := 0; v_reset_bands int := 0;
  v_reset_geo_bands int := 0; v_reset_areas int := 0;
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

  -- ── topics ──────────────────────────────────────────────────────────────
  if 'topics' = any(v_want) then
    with ins as (
      insert into seo.site_topic_value
        (site_id, topic_id, weight, lead_quality, service_match, notes,
         organization_id, created_by, updated_by, metadata)
      select p_site_id, i.topic_id, i.weight, i.lead_quality, i.service_match,
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
               service_match = i.service_match, notes = i.notes,
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

  -- ── value bands ─────────────────────────────────────────────────────────
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
        -- archived is the site's ruling: never re-insert over it
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

  -- ── geo bands ───────────────────────────────────────────────────────────
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

  -- ── geo areas ───────────────────────────────────────────────────────────
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

    -- Fill an area that is still empty with the places given now; never touch
    -- one that already carries places (that is the site's own ruling).
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
      -- Band and kind come back from the pack; PLACES are never reset — they
      -- are the business's, the pack never carried them.
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

  -- ── rules ───────────────────────────────────────────────────────────────
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
        and (p_rule_ids is null or r.id = any(p_rule_ids))
        -- archived is the site's ruling: never re-insert over it
        and not exists (
          select 1 from seo.keyword_class_rule x
          where x.site_id = p_site_id
            and x.metadata->>'template_rule_id' = r.id::text)
      returning 1)
    select count(*)::int into v_rules from ins;

    if p_reset then
      with upd as (
        update seo.keyword_class_rule x
           set name = r.name, description = r.description, pattern = r.pattern,
               match_kind = r.match_kind, target_class = r.target_class,
               value_multiplier = r.value_multiplier, match_facet = r.match_facet,
               match_facet_value = r.match_facet_value, notes = r.notes,
               deleted_at = null, updated_by = v_uid,
               metadata = coalesce(x.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
          from seo.keyword_class_rule r
         where r.pack_id = p_pack_id and r.is_template and r.deleted_at is null
           and (p_rule_ids is null or r.id = any(p_rule_ids))
           and x.site_id = p_site_id
           and x.metadata->>'template_rule_id' = r.id::text
        returning 1)
      select count(*)::int into v_reset_rules from upd;
    end if;
  end if;

  -- ── guidelines (seeded only when the site has none) ─────────────────────
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
    'geo_areas', v_areas, 'rules', v_rules, 'guidelines_seeded', v_guidelines,
    'geo_areas_filled', v_filled, 'geo_areas_pending', v_pending,
    'reset_rules', v_reset_rules, 'reset_topics', v_reset_topics,
    'reset_value_bands', v_reset_bands, 'reset_geo_bands', v_reset_geo_bands,
    'reset_geo_areas', v_reset_areas);
end;
$function$;

comment on function seo.adopt_starter_pack(uuid, uuid, text[], uuid[], boolean, jsonb, jsonb, uuid[], uuid[], boolean) is
  'Adopt an industry starter pack onto a site — THE one adoption write. Additive and idempotent by default: writes only what is missing, never a row the site already has (archived counts as the site''s ruling). Every written row carries metadata.adopted_from_pack + pack_item_id / template_rule_id. p_item_ids / p_rule_ids pick individual items (NULL = all). p_reset=true additionally overwrites rows that still carry this pack''s provenance back to the pack''s values (reviving archived ones) — places are never reset. p_geo_place_ids / p_geo_places map an archetype to the business''s own places; an area adopted without them is stamped places_pending and reported in geo_areas_pending.';

grant execute on function seo.adopt_starter_pack(uuid, uuid, text[], uuid[], boolean, jsonb, jsonb, uuid[], uuid[], boolean)
  to authenticated, service_role;

-- ── C′. provenance backfill for rows adopted before this migration ──────────
-- Every row one adopt call writes shares the SAME created_at (now() is
-- transaction-stable), and the rules already carried adopted_from_pack — so the
-- rules' created_at is a precise key for the bands / areas / topic worth written
-- beside them. Matched on the pack item's identity too, so nothing is claimed
-- that the pack did not propose.
with adoptions as (
  select distinct r.site_id, r.metadata->>'adopted_from_pack' as slug, r.created_at
  from seo.keyword_class_rule r
  where r.site_id is not null and r.metadata ? 'adopted_from_pack'
)
update seo.site_vocabulary v
   set metadata = coalesce(v.metadata, '{}'::jsonb)
                  || jsonb_build_object('adopted_from_pack', a.slug, 'pack_item_id', i.id,
                                        'provenance_backfilled_at', now())
  from adoptions a
  join seo.starter_pack p on p.slug = a.slug
  join seo.starter_pack_item i on i.pack_id = p.id and i.deleted_at is null
 where v.site_id = a.site_id and v.created_at = a.created_at
   and v.vocab_kind = i.item_kind and v.value = i.value
   and not (coalesce(v.metadata, '{}'::jsonb) ? 'pack_item_id');

with adoptions as (
  select distinct r.site_id, r.metadata->>'adopted_from_pack' as slug, r.created_at
  from seo.keyword_class_rule r
  where r.site_id is not null and r.metadata ? 'adopted_from_pack'
)
update seo.site_geo_area g
   set metadata = coalesce(g.metadata, '{}'::jsonb)
                  || jsonb_build_object('adopted_from_pack', a.slug, 'pack_item_id', i.id,
                                        'provenance_backfilled_at', now())
  from adoptions a
  join seo.starter_pack p on p.slug = a.slug
  join seo.starter_pack_item i on i.pack_id = p.id and i.item_kind = 'geo_area' and i.deleted_at is null
 where g.site_id = a.site_id and g.created_at = a.created_at and g.label = i.label
   and not (coalesce(g.metadata, '{}'::jsonb) ? 'pack_item_id');

with adoptions as (
  select distinct r.site_id, r.metadata->>'adopted_from_pack' as slug, r.created_at
  from seo.keyword_class_rule r
  where r.site_id is not null and r.metadata ? 'adopted_from_pack'
)
update seo.site_topic_value t
   set metadata = coalesce(t.metadata, '{}'::jsonb)
                  || jsonb_build_object('adopted_from_pack', a.slug, 'pack_item_id', i.id,
                                        'provenance_backfilled_at', now())
  from adoptions a
  join seo.starter_pack p on p.slug = a.slug
  join seo.starter_pack_item i on i.pack_id = p.id and i.item_kind = 'topic' and i.deleted_at is null
 where t.site_id = a.site_id and t.created_at = a.created_at and t.topic_id = i.topic_id
   and not (coalesce(t.metadata, '{}'::jsonb) ? 'pack_item_id');

-- ── D. status + adoptions ───────────────────────────────────────────────────
create or replace function seo.starter_pack_site_status(p_site_id uuid, p_pack_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'seo', 'platform', 'pg_temp'
as $function$
declare
  v_slug text;
  v_adopted_at timestamptz;
  v_adopted_by uuid;
  v_items jsonb;
begin
  perform seo.gsc_assert_site_access(p_site_id);

  select slug into v_slug from seo.starter_pack where id = p_pack_id and deleted_at is null;
  if v_slug is null then
    raise exception 'seo_pack_not_found: %', p_pack_id;
  end if;

  -- The receipt: the earliest row on this site that names this pack.
  select x.created_at, x.created_by into v_adopted_at, v_adopted_by
  from (
    select r.created_at, r.created_by from seo.keyword_class_rule r
     where r.site_id = p_site_id and r.metadata->>'adopted_from_pack' = v_slug
    union all
    select v.created_at, v.created_by from seo.site_vocabulary v
     where v.site_id = p_site_id and v.metadata->>'adopted_from_pack' = v_slug
    union all
    select g.created_at, g.created_by from seo.site_geo_area g
     where g.site_id = p_site_id and g.metadata->>'adopted_from_pack' = v_slug
    union all
    select t.created_at, t.created_by from seo.site_topic_value t
     where t.site_id = p_site_id and t.metadata->>'adopted_from_pack' = v_slug
  ) x
  order by x.created_at asc
  limit 1;

  with rule_items as (
    select jsonb_build_object(
      'kind', 'rule',
      'ref', r.id,
      'label', r.name,
      'site_row_id', x.id,
      'pack', jsonb_build_object(
        'name', r.name, 'description', r.description, 'pattern', r.pattern,
        'match_kind', r.match_kind, 'match_facet', r.match_facet,
        'match_facet_value', r.match_facet_value, 'target_class', r.target_class,
        'value_multiplier', r.value_multiplier, 'notes', r.notes),
      'site', case when x.id is null then null else jsonb_build_object(
        'name', x.name, 'description', x.description, 'pattern', x.pattern,
        'match_kind', x.match_kind, 'match_facet', x.match_facet,
        'match_facet_value', x.match_facet_value, 'target_class', x.target_class,
        'value_multiplier', x.value_multiplier, 'notes', x.notes) end,
      'state', case
        when x.id is null then 'missing'
        when x.deleted_at is not null then 'archived'
        when (x.name, x.pattern, x.match_kind, x.match_facet, x.match_facet_value,
              x.value_multiplier, x.target_class)
             is distinct from
             (r.name, r.pattern, r.match_kind, r.match_facet, r.match_facet_value,
              r.value_multiplier, r.target_class) then 'changed'
        else 'as_adopted' end,
      'sort', 0) as item
    from seo.keyword_class_rule r
    left join lateral (
      select * from seo.keyword_class_rule x
       where x.site_id = p_site_id and x.metadata->>'template_rule_id' = r.id::text
       order by (x.deleted_at is null) desc, x.created_at desc
       limit 1) x on true
    where r.pack_id = p_pack_id and r.is_template and r.deleted_at is null
  ),
  vocab_items as (
    select jsonb_build_object(
      'kind', i.item_kind,
      'ref', i.id,
      'label', i.label,
      'site_row_id', v.id,
      'pack', jsonb_build_object('value', i.value, 'label', i.label,
        'description', i.description, 'config', i.config, 'sort', i.sort, 'notes', i.notes),
      'site', case when v.id is null then null else jsonb_build_object('value', v.value,
        'label', v.label, 'description', v.description, 'config', v.config, 'sort', v.sort) end,
      'state', case
        when v.id is null then 'missing'
        when v.deleted_at is not null or not v.active then 'archived'
        when (v.label, v.config, v.sort) is distinct from (i.label, i.config, i.sort) then 'changed'
        else 'as_adopted' end,
      'sort', i.sort) as item
    from seo.starter_pack_item i
    left join lateral (
      select * from seo.site_vocabulary v
       where v.site_id = p_site_id and v.vocab_kind = i.item_kind
         and (v.metadata->>'pack_item_id' = i.id::text
              or (not (coalesce(v.metadata,'{}'::jsonb) ? 'pack_item_id') and v.value = i.value))
       order by (v.deleted_at is null) desc, (v.metadata->>'pack_item_id' = i.id::text) desc, v.created_at desc
       limit 1) v on true
    where i.pack_id = p_pack_id and i.item_kind in ('value_band','geo_band') and i.deleted_at is null
  ),
  topic_items as (
    select jsonb_build_object(
      'kind', 'topic',
      'ref', i.id,
      'topic_id', i.topic_id,
      'label', tp.name,
      'site_row_id', t.id,
      'pack', jsonb_build_object('weight', i.weight, 'lead_quality', i.lead_quality,
        'service_match', i.service_match, 'notes', i.notes),
      'site', case when t.id is null then null else jsonb_build_object('weight', t.weight,
        'lead_quality', t.lead_quality, 'service_match', t.service_match, 'notes', t.notes) end,
      'state', case
        when t.id is null then 'missing'
        when t.deleted_at is not null then 'archived'
        when not (coalesce(t.metadata,'{}'::jsonb) ? 'pack_item_id') then 'yours'
        when (t.weight, t.lead_quality, t.service_match)
             is distinct from (i.weight, i.lead_quality, i.service_match) then 'changed'
        else 'as_adopted' end,
      'sort', i.sort) as item
    from seo.starter_pack_item i
    join seo.topic tp on tp.id = i.topic_id
    left join seo.site_topic_value t
      on t.site_id = p_site_id and t.topic_id = i.topic_id
    where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
  ),
  area_items as (
    select jsonb_build_object(
      'kind', 'geo_area',
      'ref', i.id,
      'label', i.label,
      'site_row_id', g.id,
      'pack', jsonb_build_object('area_kind', coalesce(i.area_kind,'city'),
        'geo_band', i.geo_band, 'notes', i.notes),
      'site', case when g.id is null then null else jsonb_build_object('area_kind', g.area_kind,
        'geo_band', g.geo_band, 'notes', g.notes,
        'places', coalesce(array_length(g.place_ids, 1), 0),
        'tokens', coalesce(jsonb_array_length(g.match_tokens), 0),
        'places_pending', coalesce(jsonb_array_length(g.match_tokens), 0) = 0
                          and coalesce(array_length(g.place_ids, 1), 0) = 0) end,
      'state', case
        when g.id is null then 'missing'
        when g.deleted_at is not null then 'archived'
        when (g.area_kind, g.geo_band) is distinct from (coalesce(i.area_kind,'city'), i.geo_band) then 'changed'
        else 'as_adopted' end,
      'sort', i.sort) as item
    from seo.starter_pack_item i
    left join lateral (
      select * from seo.site_geo_area g
       where g.site_id = p_site_id
         and (g.metadata->>'pack_item_id' = i.id::text
              or (not (coalesce(g.metadata,'{}'::jsonb) ? 'pack_item_id') and g.label = i.label))
       order by (g.deleted_at is null) desc, (g.metadata->>'pack_item_id' = i.id::text) desc, g.created_at desc
       limit 1) g on true
    where i.pack_id = p_pack_id and i.item_kind = 'geo_area' and i.deleted_at is null
  ),
  everything as (
    select item from rule_items
    union all select item from vocab_items
    union all select item from topic_items
    union all select item from area_items
  )
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_items from everything;

  return jsonb_build_object(
    'pack_id', p_pack_id,
    'slug', v_slug,
    'adopted', v_adopted_at is not null,
    'adopted_at', v_adopted_at,
    'adopted_by', v_adopted_by,
    'adopted_by_label', (
      select coalesce(u.raw_user_meta_data->>'full_name',
                      u.raw_user_meta_data->>'name', u.email)
      from auth.users u where u.id = v_adopted_by),
    'counts', (
      select jsonb_build_object(
        'total', count(*),
        'missing', count(*) filter (where e->>'state' = 'missing'),
        'as_adopted', count(*) filter (where e->>'state' = 'as_adopted'),
        'changed', count(*) filter (where e->>'state' = 'changed'),
        'archived', count(*) filter (where e->>'state' = 'archived'),
        'yours', count(*) filter (where e->>'state' = 'yours'),
        'places_pending', count(*) filter (where (e->'site'->>'places_pending')::boolean))
      from jsonb_array_elements(v_items) e),
    'items', v_items);
end;
$function$;

comment on function seo.starter_pack_site_status(uuid, uuid) is
  'Provenance of one pack on one site: when/by whom it was adopted, and per pack item (rules, bands, geo bands, geo areas, topic worth) whether the site row is missing / as_adopted / changed / archived (/ yours for a topic worth the site set itself), with the pack''s value beside the site''s. Read by the Rulebook source chips, the pack receipt, and the "reset to pack" dialog.';

grant execute on function seo.starter_pack_site_status(uuid, uuid) to authenticated, service_role;

create or replace function seo.starter_pack_site_adoptions(p_site_id uuid)
returns table(
  pack_id uuid, slug text, name text, status text,
  adopted_at timestamptz, adopted_by uuid, adopted_by_label text,
  total int, as_adopted int, changed int, archived int, missing int, places_pending int)
language plpgsql stable security definer
set search_path to 'seo', 'platform', 'pg_temp'
as $function$
declare
  r record;
  s jsonb;
begin
  perform seo.gsc_assert_site_access(p_site_id);
  for r in
    select p.id, p.slug, p.name, p.status
    from seo.starter_pack p
    where p.deleted_at is null
      and (
        exists (select 1 from seo.keyword_class_rule x where x.site_id = p_site_id and x.metadata->>'adopted_from_pack' = p.slug)
        or exists (select 1 from seo.site_vocabulary v where v.site_id = p_site_id and v.metadata->>'adopted_from_pack' = p.slug)
        or exists (select 1 from seo.site_geo_area g where g.site_id = p_site_id and g.metadata->>'adopted_from_pack' = p.slug)
        or exists (select 1 from seo.site_topic_value t where t.site_id = p_site_id and t.metadata->>'adopted_from_pack' = p.slug))
  loop
    s := seo.starter_pack_site_status(p_site_id, r.id);
    pack_id := r.id; slug := r.slug; name := r.name; status := r.status;
    adopted_at := (s->>'adopted_at')::timestamptz;
    adopted_by := (s->>'adopted_by')::uuid;
    adopted_by_label := s->>'adopted_by_label';
    total := (s->'counts'->>'total')::int;
    as_adopted := (s->'counts'->>'as_adopted')::int;
    changed := (s->'counts'->>'changed')::int;
    archived := (s->'counts'->>'archived')::int;
    missing := (s->'counts'->>'missing')::int;
    places_pending := (s->'counts'->>'places_pending')::int;
    return next;
  end loop;
end;
$function$;

comment on function seo.starter_pack_site_adoptions(uuid) is
  'One receipt row per pack this site has adopted anything from: adopted when / by whom and how many items are still as adopted, changed, archived, or missing. The packs screen''s adopted state.';

grant execute on function seo.starter_pack_site_adoptions(uuid) to authenticated, service_role;

-- ── E. whole-pack preview on the site's own keywords ────────────────────────
-- Mirrors the NO PHANTOM BASE resolver (only a topic worth is a base; rules
-- without one stamp but do not value). The pack's TOPIC items therefore join
-- the what-if: a pack topic becomes a keyword's base when it is the nearest
-- ruled ancestor and the site has no row on that topic — exactly what
-- adoption's "on conflict do nothing" would leave behind.
create or replace function seo.starter_pack_preview(
  p_site_id uuid,
  p_pack_id uuid,
  p_start date,
  p_end date,
  p_rule_ids uuid[] default null,
  p_sample integer default 3,
  p_item_ids uuid[] default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'seo', 'platform', 'pg_temp'
as $function$
declare
  v_result jsonb;
  v_sample int := greatest(1, least(coalesce(p_sample, 3), 10));
begin
  perform seo.gsc_assert_site_access(p_site_id);

  with recursive
  winner as (
    select distinct on (spd.date) spd.date as d, spd.run_id as rid
    from seo.search_performance_daily spd
    where spd.provider = 'gsc' and spd.site_id = p_site_id
      and spd.dimension_profile = 'query' and spd.date between p_start and p_end
    order by spd.date, spd.created_at desc, spd.run_id desc
  ),
  vol as (
    select spd.keyword_id as kid, sum(spd.clicks)::bigint as c, sum(spd.impressions)::bigint as i
    from seo.search_performance_daily spd
    join winner w on w.d = spd.date and w.rid = spd.run_id
    where spd.provider = 'gsc' and spd.site_id = p_site_id
      and spd.dimension_profile = 'query' and spd.keyword_id is not null
    group by spd.keyword_id
  ),
  ids as (select array_agg(kid) as a from vol),
  vm as (select * from seo.keyword_value_map(p_site_id, (select a from ids))),
  bands as (
    select sv.value, (sv.config->>'min_score')::numeric as min_score
    from seo.site_vocabulary sv
    where sv.site_id = p_site_id and sv.vocab_kind = 'value_band' and sv.active
      and sv.deleted_at is null and sv.config ? 'min_score'
    union all
    select c.slug, (c.metadata->>'min_score')::numeric
    from platform.categories c
    where c.dimension = 'seo_value_band' and c.deleted_at is null and c.metadata ? 'min_score'
      and not exists (
        select 1 from seo.site_vocabulary sv2
        where sv2.site_id = p_site_id and sv2.vocab_kind = 'value_band' and sv2.active
          and sv2.deleted_at is null and sv2.config ? 'min_score')
  ),
  base as (
    select v.kid, k.normalized_phrase, v.c, v.i,
           coalesce(m.value_band, 'unvalued') as band,
           coalesce(m.value_source, 'unvalued') as source,
           m.value_score as score,
           coalesce(m.reasons, '[]'::jsonb) as reasons
    from vol v
    join seo.keyword k on k.id = v.kid and k.deleted_at is null
    left join vm m on m.keyword_id = v.kid
  ),
  -- ── the pack's rules that would be NEW on this site ──
  prules as (
    select r.id, r.name, r.pattern, r.match_kind, r.match_facet, r.match_facet_value,
           r.value_multiplier,
           exists (select 1 from seo.keyword_class_rule x
                    where x.site_id = p_site_id and x.deleted_at is null
                      and x.metadata->>'template_rule_id' = r.id::text) as already_adopted,
           (select c.id from platform.categories c
             where c.dimension = 'seo_facet' and c.parent_id is null
               and c.slug = r.match_facet and c.deleted_at is null) as dim_id
    from seo.keyword_class_rule r
    where r.pack_id = p_pack_id and r.is_template and r.deleted_at is null
      and r.value_multiplier is not null
      and (p_rule_ids is null or r.id = any(p_rule_ids))
  ),
  hits as (
    select b.kid, r.id as rule_id, r.value_multiplier, r.already_adopted
    from base b
    join prules r on (
      (r.pattern is not null and (
           (r.match_kind = 'contains'    and b.normalized_phrase like '%' || seo.gsc_perf_like_escape(lower(r.pattern)) || '%')
        or (r.match_kind = 'exact'       and b.normalized_phrase = lower(r.pattern))
        or (r.match_kind = 'starts_with' and b.normalized_phrase like seo.gsc_perf_like_escape(lower(r.pattern)) || '%')
        or (r.match_kind = 'ends_with'   and b.normalized_phrase like '%' || seo.gsc_perf_like_escape(lower(r.pattern)))
        or (r.match_kind = 'word'        and b.normalized_phrase ~ ('\m' || lower(r.pattern) || '\M'))))
      or (r.match_facet is not null and r.dim_id is not null and exists (
          select 1 from seo.keyword_facet kf
          join platform.categories cv on cv.id = kf.category_id and cv.deleted_at is null
          where kf.keyword_id = b.kid and kf.deleted_at is null
            and cv.parent_id = r.dim_id
            and coalesce(cv.metadata->>'value', split_part(cv.slug, ':', 2)) = r.match_facet_value)))
  ),
  newmult as (
    select kid, exp(sum(ln(value_multiplier))) as mult
    from hits where not already_adopted
    group by kid
  ),
  -- ── the pack's topic worth, joined to what the site already rules ──
  ptopics as (
    select i.id as item_id, i.topic_id, i.weight, i.lead_quality, i.service_match,
           exists (select 1 from seo.site_topic_value stv
                    where stv.site_id = p_site_id and stv.topic_id = i.topic_id
                      and stv.deleted_at is null) as already_valued
    from seo.starter_pack_item i
    where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
      and i.topic_id is not null
  ),
  candidates as (
    -- every topic worth that WOULD exist after adoption: the site's own rows,
    -- plus the selected pack topics the site has no row for (on conflict do nothing)
    select stv.topic_id, stv.weight,
           (stv.lead_quality = 'negative_value'
              or stv.service_match in ('not_offered','actively_avoided')) as negative_guard,
           false as from_pack
    from seo.site_topic_value stv
    where stv.site_id = p_site_id and stv.deleted_at is null
    union all
    select t.topic_id, t.weight,
           (t.lead_quality = 'negative_value'
              or t.service_match in ('not_offered','actively_avoided')),
           true
    from ptopics t
    where not t.already_valued
      and (p_item_ids is null or t.item_id = any(p_item_ids))
  ),
  lineage as (
    select kt.keyword_id as kw_id, kt.topic_id, 0 as depth
    from seo.keyword_topic kt
    join base b on b.kid = kt.keyword_id
    where kt.is_primary and kt.deleted_at is null
    union all
    select l.kw_id, t.parent_id, l.depth + 1
    from lineage l
    join seo.topic t on t.id = l.topic_id and t.deleted_at is null
    where t.parent_id is not null and l.depth < 12
  ),
  lineage_d as (select distinct kw_id, topic_id, depth from lineage),
  new_base as (
    select distinct on (l.kw_id) l.kw_id, c.weight as base_weight, c.negative_guard, c.from_pack, c.topic_id
    from lineage_d l
    join candidates c on c.topic_id = l.topic_id
    order by l.kw_id, l.depth
  ),
  parts as (
    select b.*,
      nb.base_weight as new_base_weight,
      coalesce(nb.negative_guard, false) as new_negative_guard,
      coalesce(nb.from_pack, false) as base_from_pack,
      (select (r->>'weight')::numeric from jsonb_array_elements(b.reasons) r
        where r->>'kind' = 'topic' limit 1) as old_base_weight,
      coalesce(nm.mult, 1) as new_mult,
      (nm.kid is not null) as rule_touched,
      coalesce((select exp(sum(ln((r->>'multiplier')::numeric)))
                  from jsonb_array_elements(b.reasons) r
                 where r->>'kind' = 'rule'), 1) as other_rules,
      coalesce((select (r->>'multiplier')::numeric from jsonb_array_elements(b.reasons) r
                 where r->>'kind' = 'geo' limit 1), 1) as geo_mult
    from base b
    left join new_base nb on nb.kw_id = b.kid
    left join newmult nm on nm.kid = b.kid
  ),
  touched as (
    -- a keyword the pack would change in any way: a new rule fires on it, or
    -- its base would come from a pack topic
    select p.* from parts p
    where p.rule_touched or p.base_from_pack
  ),
  scored as (
    select t.*,
      case
        when t.source = 'override' then null
        when t.new_negative_guard or t.geo_mult = 0 then 0
        when t.new_base_weight is null then null
        else least(100, greatest(0, t.new_base_weight * t.other_rules * t.geo_mult * t.new_mult))
      end as next_raw,
      (t.rule_touched and t.new_base_weight is null and t.source <> 'override' and t.band <> 'negative') as stamped_only
    from touched t
  ),
  banded as (
    select s.*,
      case
        when s.next_raw is null then s.band
        when round(s.next_raw, 1) = 0 then 'negative'
        else coalesce(
          (select b.value from bands b where b.min_score <= round(s.next_raw, 1)
            order by b.min_score desc limit 1),
          (select b.value from bands b order by b.min_score asc limit 1),
          s.band)
      end as next_band
    from scored s
  ),
  rows_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kw_id', kid, 'keyword', normalized_phrase, 'clicks', c, 'impressions', i,
      'band', band, 'source', source, 'score', score, 'matched', true,
      'stamped_only', stamped_only, 'next_raw', next_raw)), '[]'::jsonb) as j
    from banded
  ),
  per_rule as (
    select r.id as rule_id, r.already_adopted,
           count(h.kid)::bigint as keywords,
           coalesce(sum(b.c), 0)::bigint as clicks,
           coalesce(sum(b.i), 0)::bigint as impressions,
           count(h.kid) filter (where bd.next_band is distinct from b.band)::bigint as moved,
           coalesce((
             select jsonb_agg(q.s) from (
               select jsonb_build_object(
                 'keyword_id', b2.kid, 'keyword', b2.normalized_phrase,
                 'clicks', b2.c, 'impressions', b2.i,
                 'from_band', b2.band, 'to_band', coalesce(bd2.next_band, b2.band)) as s
               from hits h2
               join base b2 on b2.kid = h2.kid
               left join banded bd2 on bd2.kid = h2.kid
               where h2.rule_id = r.id
               order by b2.c desc, b2.i desc
               limit v_sample) q), '[]'::jsonb) as samples
    from prules r
    left join hits h on h.rule_id = r.id
    left join base b on b.kid = h.kid
    left join banded bd on bd.kid = h.kid
    group by r.id, r.already_adopted
  ),
  per_topic as (
    select t.item_id, t.topic_id, t.already_valued,
           count(distinct l.kw_id)::bigint as keywords,
           coalesce(sum(b.c), 0)::bigint as clicks,
           coalesce(sum(b.i), 0)::bigint as impressions,
           count(distinct nb.kw_id) filter (where nb.from_pack and nb.topic_id = t.topic_id)::bigint as would_base,
           coalesce((
             select jsonb_agg(q.s) from (
               select jsonb_build_object(
                 'keyword_id', b2.kid, 'keyword', b2.normalized_phrase,
                 'clicks', b2.c, 'impressions', b2.i,
                 'from_band', b2.band, 'to_band', coalesce(bd2.next_band, b2.band)) as s
               from new_base nb2
               join base b2 on b2.kid = nb2.kw_id
               left join banded bd2 on bd2.kid = nb2.kw_id
               where nb2.topic_id = t.topic_id and nb2.from_pack
               order by b2.c desc, b2.i desc
               limit v_sample) q), '[]'::jsonb) as samples
    from ptopics t
    left join lineage_d l on l.topic_id = t.topic_id
    left join base b on b.kid = l.kw_id
    left join new_base nb on nb.kw_id = l.kw_id
    group by t.item_id, t.topic_id, t.already_valued
  )
  select jsonb_build_object(
    'window_keywords', (select count(*) from vol),
    'summary', seo.gsc_value_preview_summarize(
        p_site_id, (select count(*) from vol), (select j from rows_json), 10),
    'unvalued_before', (select count(*) from base where band = 'unvalued'),
    'unvalued_after',
      (select count(*) from base where band = 'unvalued')
      - (select count(*) from banded where band = 'unvalued' and next_band <> 'unvalued'),
    'band_counts_before', coalesce((
      select jsonb_object_agg(x.band, x.n)
      from (select band, count(*) as n from base group by band) x), '{}'::jsonb),
    'band_counts_after', coalesce((
      select jsonb_object_agg(x.nb, x.n)
      from (select coalesce(bd.next_band, b.band) as nb, count(*) as n
            from base b left join banded bd on bd.kid = b.kid
            group by 1) x), '{}'::jsonb),
    'rules', coalesce((select jsonb_agg(to_jsonb(pr)) from per_rule pr), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(to_jsonb(pt)) from per_topic pt), '[]'::jsonb))
  into v_result;

  return v_result;
end;
$function$;

drop function if exists seo.starter_pack_preview(uuid, uuid, date, date, uuid[], integer);

comment on function seo.starter_pack_preview(uuid, uuid, date, date, uuid[], integer, uuid[]) is
  'What adopting a pack would do to THIS site''s keywords in the given GSC window, before anything is written. Mirrors the ONE resolver (no phantom base: only a topic worth is a base): the selected pack topic items become a keyword''s base when they are its nearest ruled ancestor and the site has no row on that topic, and the selected not-yet-adopted pack rules multiply into the published reason chain. Summarized by gsc_value_preview_summarize; per rule and per topic: keywords / clicks / impressions touched, how many move band, and sample keywords from→to. THE SCOPE RULE: resolves only the window''s keywords.';

grant execute on function seo.starter_pack_preview(uuid, uuid, date, date, uuid[], integer, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
