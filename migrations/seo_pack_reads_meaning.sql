-- KI-030 part 3 — every pack READ and every authoring write speaks `meaning`.
--
-- Applied 2026-08-25 (session ki030-packs) alongside
-- seo_pack_content_dimension_values.sql (the shape + the content conversion) and
-- seo_pack_adopt_meaning.sql (the materializer). This file is the live text of
-- the functions it replaces, so the repo and the database cannot disagree:
--
--   * public.library_subscribe    — stops passing `rule_ids`; `item_ids` selects
--                                   every part of a pack, meaning included.
--   * starter_pack_detail         — returns `meaning`, not `rules`.
--   * starter_pack_catalog        — `meaning_count` replaces `rule_count`.
--   * starter_pack_new_version    — clones the meaning columns, no rule rows.
--   * starter_pack_item_save      — authors dimension values, matchers and worth.
--   * starter_pack_from_proposal  — lands the proposer's `rules` and converts
--                                   them in the same transaction, so nothing is
--                                   ever STORED in the legacy shape.
--   * starter_pack_site_status    — reconciles meaning items, including sites
--                                   that adopted BEFORE the flip (matched
--                                   through metadata.converted_from_rules).
--   * starter_pack_preview        — projects matchers + worth; see the honesty
--                                   note in its own header.
--
-- Also dropped: seo.starter_pack_rule_save / seo.starter_pack_rule_delete.
-- Idempotent. Safe to re-apply.

drop function if exists seo.starter_pack_rule_save(jsonb);
drop function if exists seo.starter_pack_rule_delete(uuid);

CREATE OR REPLACE FUNCTION public.library_subscribe(p_entity_type text, p_entity_id uuid, p_organization_id uuid DEFAULT NULL::uuid, p_target jsonb DEFAULT NULL::jsonb, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'rag', 'iam', 'seo', 'web'
AS $function$
declare v_actor uuid; v_row platform.entity_grants; v_status text; v_result jsonb := '{}'::jsonb; v_via text; v_org uuid := p_organization_id;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  if v_org is null and p_entity_type = 'seo_starter_pack' and p_target ? 'site_id' then
    select s.organization_id into v_org from web.site s where s.id = (p_target->>'site_id')::uuid and s.deleted_at is null;
  end if;
  if v_org is null then raise exception 'library: organization required' using errcode = '22023'; end if;
  if v_actor is null or not exists (
      select 1 from iam.organization_member om where om.organization_id = v_org and om.user_id = v_actor) then
    raise exception 'not authorized: caller is not a member of org %', v_org using errcode = '42501';
  end if;

  if p_entity_type = 'data_store' then
    if not exists (select 1 from rag.data_stores s where s.id = p_entity_id and s.discoverable) then
      raise exception 'store % is not discoverable', p_entity_id;
    end if;

  elsif p_entity_type = 'seo_starter_pack' then
    select status into v_status from seo.starter_pack where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'seo_pack_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('seo_starter_pack', p_entity_id, v_org);
    if not coalesce(public.is_admin()
            or v_via = 'organization'
            or (v_via in ('industry', 'global') and v_status = 'ratified'), false) then
      raise exception 'library: organization % is not entitled to pack % (status %, via %)',
        v_org, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;

  elsif p_entity_type = 'rulebook' then
    select status into v_status from platform.rulebook where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'rulebook_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('rulebook', p_entity_id, v_org);
    if not coalesce(public.is_admin()
            or v_via = 'organization'
            or (v_via in ('industry', 'global') and v_status = 'active'), false) then
      raise exception 'library: organization % is not entitled to Rulebook % (status %, via %)',
        v_org, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;

  else
    raise exception 'library: % cannot be subscribed to', p_entity_type;
  end if;

  select * into v_row from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = 'organization' and organization_id = v_org
   limit 1;
  if v_row.id is null then
    insert into platform.entity_grants(entity_type, entity_id, audience, organization_id, granted_by)
    values (p_entity_type, p_entity_id, 'organization', v_org, v_actor)
    returning * into v_row;
  end if;

  if p_entity_type = 'seo_starter_pack' and p_target ? 'site_id' then
    -- KI-030: `rule_ids` is gone — a pack's meaning is items now, so `item_ids`
    -- selects every part including the dimension values.
    v_result := seo.adopt_starter_pack(
      (p_target->>'site_id')::uuid, p_entity_id,
      case when p_target ? 'include' then (select array_agg(x) from jsonb_array_elements_text(p_target->'include') x) end,
      case when p_target ? 'topic_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'topic_ids') x) end,
      coalesce((p_target->>'seed_guidelines')::boolean, true),
      p_target->'geo_places', p_target->'geo_place_ids',
      case when p_target ? 'item_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'item_ids') x) end,
      coalesce((p_target->>'reset')::boolean, false));
  elsif p_entity_type = 'rulebook' then
    v_result := platform.materialize_library_rulebook(p_entity_id, v_org, v_actor, coalesce(p_target, '{}'::jsonb));
  end if;

  perform public._library_audit(v_actor, 'self_subscribe', p_entity_type, p_entity_id, null, v_org,
                                jsonb_build_object('target', coalesce(p_target, '{}'::jsonb) - 'geo_places' - 'geo_place_ids'));
  return v_result || jsonb_build_object('grant_id', v_row.id, 'subscribed', true, 'organization_id', v_org);
end $function$;

CREATE OR REPLACE FUNCTION seo.starter_pack_detail(p_pack_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'iam', 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_out jsonb;
begin
  if not (public.is_admin()
          or (v_uid is not null and public.is_pack_curator(v_uid, p_pack_id))
          or (v_uid is not null and public.user_can_read_via_library_grant(v_uid, 'seo_starter_pack', p_pack_id))) then
    raise exception 'seo_pack_not_entitled: %', p_pack_id using errcode = '42501';
  end if;
  select jsonb_build_object(
    'pack', (to_jsonb(p) - 'proposal') || jsonb_build_object(
              'industry_name', ind.name, 'industry_slug', ind.slug,
              'can_author', (public.is_admin() or (v_uid is not null and public.is_pack_curator(v_uid, p.id) and p.status in ('draft','proposed'))),
              'is_admin', public.is_admin(),
              'subscriber_count', (select count(*) from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='organization'),
              'open_questions', coalesce(p.metadata->'open_questions', '[]'::jsonb),
              'status_history', coalesce(p.metadata->'status_history', '[]'::jsonb)),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'topic_id', t.id, 'name', t.name, 'slug', t.slug, 'node_type', t.node_type, 'parent_id', t.parent_id,
        'description', t.description, 'weight', i.weight, 'lead_quality', i.lead_quality, 'offering_match', i.offering_match,
        'notes', i.notes, 'sort', i.sort) order by i.sort, t.name)
      from seo.starter_pack_item i join seo.topic t on t.id = i.topic_id and t.deleted_at is null
      where i.pack_id = p.id and i.item_kind = 'topic' and i.deleted_at is null), '[]'::jsonb),
    'value_bands', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', i.id, 'value', i.value, 'label', i.label, 'description', i.description,
        'config', i.config, 'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'value_band' and i.deleted_at is null), '[]'::jsonb),
    'geo_bands', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', i.id, 'value', i.value, 'label', i.label, 'description', i.description,
        'config', i.config, 'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_band' and i.deleted_at is null), '[]'::jsonb),
    'geo_areas', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', i.id, 'label', i.label, 'area_kind', i.area_kind, 'match_tokens', i.match_tokens,
        'geo_band', i.geo_band, 'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_area' and i.deleted_at is null), '[]'::jsonb),
    'meaning', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'dimension_scope', i.dimension_scope, 'dimension_slug', i.dimension_slug,
        'dimension_label', i.dimension_label, 'value', i.value, 'label', i.label,
        'description', i.description, 'notes', i.notes, 'matchers', i.matchers,
        'worth_effect', i.worth_effect, 'worth_amount', i.worth_amount, 'sort', i.sort)
        order by i.sort, i.label)
      from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'meaning' and i.deleted_at is null), '[]'::jsonb))
  into v_out
  from seo.starter_pack p left join iam.industries ind on ind.id = p.industry_id
  where p.id = p_pack_id and p.deleted_at is null;
  return v_out;
end $function$;

drop function if exists seo.starter_pack_catalog(text, uuid);

CREATE OR REPLACE FUNCTION seo.starter_pack_catalog(p_status text DEFAULT NULL::text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, slug text, name text, industry text, summary text, description text, status text, geo_model text, guidelines text, source_notes text, source_corpus jsonb, ratified_at timestamp with time zone, ratification_notes text, topic_count integer, meaning_count integer, value_band_count integer, geo_band_count integer, geo_area_count integer, industry_id uuid, industry_name text, org_match boolean, industry_slug text, pack_version integer, entitled_via text, subscribed boolean, subscriber_count integer, supersedes_pack_id uuid, proposed_at timestamp with time zone, updated_at timestamp with time zone, can_author boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'iam', 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_admin boolean := public.is_admin();
begin
  return query
  with ent as (
    select p.id as pid,
      case
        when v_admin then 'admin'
        when v_uid is not null and public.is_pack_curator(v_uid, p.id) then 'curator'
        when p_organization_id is not null then public.library_entitlement('seo_starter_pack', p.id, p_organization_id)
        when v_uid is not null and exists (select 1 from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id
               and g.audience='organization' and g.organization_id in (select om.organization_id from iam.organization_member om where om.user_id=v_uid)) then 'organization'
        when v_uid is not null and exists (select 1 from platform.entity_grants g join iam.org_industries oi on oi.industry_id=g.industry_id
               join iam.organization_member om on om.organization_id=oi.organization_id
               where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='industry' and om.user_id=v_uid) then 'industry'
        when exists (select 1 from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='global') then 'global'
      end as via
    from seo.starter_pack p where p.deleted_at is null)
  select p.id, p.slug, p.name, p.industry, p.summary, p.description, p.status, p.geo_model, p.guidelines, p.source_notes,
         p.source_corpus, p.ratified_at, p.ratification_notes,
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'topic' and i.deleted_at is null),
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'meaning' and i.deleted_at is null),
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'value_band' and i.deleted_at is null),
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_band' and i.deleted_at is null),
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_area' and i.deleted_at is null),
         p.industry_id, ind.name,
         (p_organization_id is not null and p.industry_id is not null and exists (
            select 1 from iam.org_industries oi where oi.organization_id = p_organization_id and oi.industry_id = p.industry_id)),
         ind.slug, p.pack_version, e.via,
         (p_organization_id is not null and exists (select 1 from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id
             and g.audience='organization' and g.organization_id=p_organization_id)),
         (select count(*)::int from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='organization'),
         p.supersedes_pack_id, p.proposed_at, p.updated_at,
         (v_admin or (v_uid is not null and public.is_pack_curator(v_uid, p.id) and p.status in ('draft','proposed')))
  from seo.starter_pack p
  join ent e on e.pid = p.id
  left join iam.industries ind on ind.id = p.industry_id
  where p.deleted_at is null
    and (p_status is null or p.status = p_status)
    and e.via is not null
    and (e.via in ('admin','curator','organization') or p.status = 'ratified')
  order by
    (p_organization_id is not null and p.industry_id is not null and exists (
       select 1 from iam.org_industries oi where oi.organization_id = p_organization_id and oi.industry_id = p.industry_id)) desc,
    case p.status when 'ratified' then 0 when 'proposed' then 1 when 'draft' then 2 else 3 end,
    p.name;
end $function$;

CREATE OR REPLACE FUNCTION seo.starter_pack_new_version(p_pack_id uuid, p_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'seo', 'platform'
AS $function$
declare v_src seo.starter_pack; v_new seo.starter_pack; v_uid uuid := auth.uid(); v_slug text;
begin
  perform seo._pack_assert_author(p_pack_id);
  select * into v_src from seo.starter_pack where id = p_pack_id and deleted_at is null;
  v_slug := coalesce(nullif(p_slug,''), v_src.slug || '-v' || (v_src.pack_version + 1)::text);
  insert into seo.starter_pack (slug, name, industry, industry_id, summary, description, geo_model, guidelines, source_notes,
                                source_corpus, status, organization_id, visibility, created_by, updated_by, metadata, supersedes_pack_id, pack_version)
  values (v_slug, v_src.name, v_src.industry, v_src.industry_id, v_src.summary, v_src.description, v_src.geo_model, v_src.guidelines,
          v_src.source_notes, v_src.source_corpus, 'draft', v_src.organization_id, 'internal', v_uid, v_uid,
          coalesce(v_src.metadata,'{}'::jsonb) - 'status_history', p_pack_id, 1)
  returning * into v_new;
  insert into seo.starter_pack_item (pack_id, item_kind, topic_id, weight, lead_quality, offering_match, value, label, description,
                                     config, area_kind, match_tokens, geo_band, sort, notes,
                                     dimension_slug, dimension_label, dimension_scope, worth_effect, worth_amount, matchers,
                                     organization_id, visibility, created_by, updated_by, metadata)
  select v_new.id, item_kind, topic_id, weight, lead_quality, offering_match, value, label, description, config, area_kind, match_tokens,
         geo_band, sort, notes, dimension_slug, dimension_label, dimension_scope, worth_effect, worth_amount, matchers,
         organization_id, 'internal', v_uid, v_uid, jsonb_build_object('cloned_from_item', id)
  from seo.starter_pack_item where pack_id = p_pack_id and deleted_at is null;
  perform public._library_audit(v_uid, 'pack_new_version', 'seo_starter_pack', v_new.id, v_new.industry_id, null, jsonb_build_object('supersedes', p_pack_id));
  return to_jsonb(v_new) - 'proposal';
end $function$;

CREATE OR REPLACE FUNCTION seo.starter_pack_item_save(p_item jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'seo', 'platform'
AS $function$
declare v_id uuid := nullif(p_item->>'id','')::uuid; v_pack uuid := (p_item->>'pack_id')::uuid; v_row seo.starter_pack_item;
        v_lib uuid := public.system_org_id('library'); v_uid uuid := auth.uid();
begin
  if v_id is not null then select pack_id into v_pack from seo.starter_pack_item where id = v_id; end if;
  perform seo._pack_assert_author(v_pack);
  if v_id is null then
    insert into seo.starter_pack_item (pack_id, item_kind, topic_id, weight, lead_quality, offering_match, value, label, description,
                                       config, area_kind, match_tokens, geo_band, sort, notes,
                                       dimension_slug, dimension_label, dimension_scope, worth_effect, worth_amount, matchers,
                                       organization_id, visibility, created_by, updated_by)
    values (v_pack, p_item->>'item_kind', nullif(p_item->>'topic_id','')::uuid, (p_item->>'weight')::numeric,
            nullif(p_item->>'lead_quality',''), nullif(p_item->>'offering_match',''), nullif(p_item->>'value',''), nullif(p_item->>'label',''),
            p_item->>'description', coalesce(p_item->'config', '{}'::jsonb), nullif(p_item->>'area_kind',''),
            coalesce(p_item->'match_tokens', '[]'::jsonb), nullif(p_item->>'geo_band',''), coalesce((p_item->>'sort')::int, 0),
            p_item->>'notes',
            nullif(p_item->>'dimension_slug',''), nullif(p_item->>'dimension_label',''), nullif(p_item->>'dimension_scope',''),
            nullif(p_item->>'worth_effect',''), nullif(p_item->>'worth_amount','')::numeric,
            coalesce(p_item->'matchers', '[]'::jsonb),
            v_lib, 'internal', v_uid, v_uid)
    returning * into v_row;
  else
    update seo.starter_pack_item set
      topic_id = case when p_item ? 'topic_id' then nullif(p_item->>'topic_id','')::uuid else topic_id end,
      weight = case when p_item ? 'weight' then (p_item->>'weight')::numeric else weight end,
      lead_quality = case when p_item ? 'lead_quality' then nullif(p_item->>'lead_quality','') else lead_quality end,
      offering_match = case when p_item ? 'offering_match' then nullif(p_item->>'offering_match','') else offering_match end,
      value = case when p_item ? 'value' then nullif(p_item->>'value','') else value end,
      label = case when p_item ? 'label' then nullif(p_item->>'label','') else label end,
      description = case when p_item ? 'description' then p_item->>'description' else description end,
      config = case when p_item ? 'config' then p_item->'config' else config end,
      area_kind = case when p_item ? 'area_kind' then nullif(p_item->>'area_kind','') else area_kind end,
      match_tokens = case when p_item ? 'match_tokens' then p_item->'match_tokens' else match_tokens end,
      geo_band = case when p_item ? 'geo_band' then nullif(p_item->>'geo_band','') else geo_band end,
      sort = case when p_item ? 'sort' then (p_item->>'sort')::int else sort end,
      notes = case when p_item ? 'notes' then p_item->>'notes' else notes end,
      dimension_slug = case when p_item ? 'dimension_slug' then nullif(p_item->>'dimension_slug','') else dimension_slug end,
      dimension_label = case when p_item ? 'dimension_label' then nullif(p_item->>'dimension_label','') else dimension_label end,
      dimension_scope = case when p_item ? 'dimension_scope' then nullif(p_item->>'dimension_scope','') else dimension_scope end,
      worth_effect = case when p_item ? 'worth_effect' then nullif(p_item->>'worth_effect','') else worth_effect end,
      worth_amount = case when p_item ? 'worth_amount' then nullif(p_item->>'worth_amount','')::numeric else worth_amount end,
      matchers = case when p_item ? 'matchers' then p_item->'matchers' else matchers end,
      deleted_at = null, updated_at = now(), updated_by = v_uid
    where id = v_id returning * into v_row;
  end if;
  perform seo._pack_touch(v_pack);
  return to_jsonb(v_row);
end $function$;

CREATE OR REPLACE FUNCTION seo.starter_pack_from_proposal(p_proposal jsonb, p_industry_id uuid DEFAULT NULL::uuid, p_source_corpus jsonb DEFAULT NULL::jsonb, p_source_site_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'seo', 'platform'
AS $function$
declare v_pack seo.starter_pack; v_lib uuid := public.system_org_id('library'); v_uid uuid := auth.uid(); v_slug text; r jsonb; v_n int := 0;
begin
  perform seo._pack_assert_creator(p_industry_id);
  if p_proposal->>'error' is not null and p_proposal->>'error' <> '' then
    raise exception 'seo_pack_proposal_error: %', p_proposal->>'error';
  end if;
  v_slug := coalesce(nullif(p_proposal->'pack'->>'slug',''), 'pack-' || left(gen_random_uuid()::text, 8));
  while exists (select 1 from seo.starter_pack where slug = v_slug) loop
    v_n := v_n + 1; v_slug := (p_proposal->'pack'->>'slug') || '-' || v_n::text;
  end loop;
  insert into seo.starter_pack (slug, name, industry, industry_id, summary, description, geo_model, guidelines, source_notes, source_corpus,
                                proposal, status, organization_id, visibility, created_by, updated_by, metadata)
  values (v_slug, p_proposal->'pack'->>'name', p_proposal->>'industry', p_industry_id, p_proposal->'pack'->>'summary',
          p_proposal->'pack'->>'description', coalesce(nullif(p_proposal->'pack'->>'geo_model',''), 'national'),
          p_proposal->'pack'->>'guidelines', p_proposal->>'demand_reading', p_source_corpus, p_proposal, 'draft', v_lib, 'internal', v_uid, v_uid,
          jsonb_build_object('proposer_version', p_proposal->>'proposer_version', 'confidence', p_proposal->'confidence',
                             'open_questions', coalesce(p_proposal->'open_questions', '[]'::jsonb),
                             'source_site_ids', coalesce(to_jsonb(p_source_site_ids), '[]'::jsonb)))
  returning * into v_pack;
  -- The proposer agent still speaks `rules` (its output contract is pinned).
  -- They land as template rows and are converted to meaning items in the same
  -- transaction, so nothing is ever STORED in the legacy shape.
  for r in select * from jsonb_array_elements(coalesce(p_proposal->'rules', '[]'::jsonb)) loop
    insert into seo.keyword_class_rule (name, description, pattern, match_kind, match_facet, match_facet_value, target_class, value_multiplier,
                                        notes, pack_id, is_template, auto_apply, site_id, organization_id, visibility, created_by, updated_by, metadata)
    values (r->>'name', r->>'description', nullif(r->>'pattern',''), nullif(r->>'match_kind',''), nullif(r->>'match_facet',''),
            nullif(r->>'match_facet_value',''), nullif(r->>'target_class',''), (r->>'value_multiplier')::numeric, r->>'rationale',
            v_pack.id, true, false, null, v_lib, 'internal', v_uid, v_uid, '{}'::jsonb);
  end loop;
  insert into seo.starter_pack_item (pack_id, item_kind, value, label, description, config, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'value_band', b->>'value', b->>'label', b->>'description', jsonb_build_object('min_score', (b->>'min_score')::numeric),
         ord, b->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'value_bands', '[]'::jsonb)) with ordinality as t(b, ord);
  insert into seo.starter_pack_item (pack_id, item_kind, value, label, description, config, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'geo_band', b->>'value', b->>'label', b->>'description', jsonb_build_object('multiplier', (b->>'multiplier')::numeric),
         ord, b->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'geo_bands', '[]'::jsonb)) with ordinality as t(b, ord);
  insert into seo.starter_pack_item (pack_id, item_kind, label, area_kind, match_tokens, geo_band, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'geo_area', a->>'label', coalesce(nullif(a->>'area_kind',''), 'city'), coalesce(a->'match_tokens', '[]'::jsonb),
         a->>'geo_band', ord, a->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'geo_areas', '[]'::jsonb)) with ordinality as t(a, ord);
  perform seo._pack_convert_rules_to_meaning(v_pack.id);
  perform public._library_audit(v_uid, 'pack_from_proposal', 'seo_starter_pack', v_pack.id, p_industry_id, null,
                                jsonb_build_object('slug', v_slug, 'proposer_version', p_proposal->>'proposer_version'));
  return to_jsonb(v_pack) - 'proposal';
end $function$;

CREATE OR REPLACE FUNCTION seo.starter_pack_site_status(p_site_id uuid, p_pack_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
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
    union all
    select w.created_at, w.created_by from seo.site_value_worth w
     where w.site_id = p_site_id and w.metadata->>'adopted_from_pack' = v_slug
  ) x
  order by x.created_at asc
  limit 1;

  with meaning_items as (
    select jsonb_build_object(
      'kind', 'meaning',
      'ref', i.id,
      'label', i.label,
      'site_row_id', w.id,
      'pack', jsonb_build_object(
        'dimension_slug', i.dimension_slug, 'dimension_label', i.dimension_label,
        'dimension_scope', i.dimension_scope, 'value', i.value, 'label', i.label,
        'worth_effect', i.worth_effect, 'worth_amount', i.worth_amount,
        'matchers', i.matchers, 'notes', i.notes),
      'site', case when v.value_id is null then null else jsonb_build_object(
        'worth_effect', w.effect, 'worth_amount', w.amount, 'origin', w.origin,
        'matchers', coalesce(mc.n, 0), 'patterns', coalesce(mc.patterns, '[]'::jsonb)) end,
      'state', case
        when v.value_id is null then 'missing'
        when w.id is null and coalesce(mc.n, 0) = 0 then
          case when coalesce(arch.n, 0) > 0 then 'archived' else 'missing' end
        when not coalesce(prov.from_pack, false) then 'yours'
        when (w.effect, w.amount) is distinct from (i.worth_effect, i.worth_amount)
          or coalesce(mc.n, 0) < jsonb_array_length(coalesce(i.matchers, '[]'::jsonb)) then 'changed'
        else 'as_adopted' end,
      'sort', i.sort) as item
    from seo.starter_pack_item i
    cross join lateral (
      select seo._pack_site_value_id(p_site_id, i.dimension_scope, i.dimension_slug, i.value) as value_id) v
    left join lateral (
      select * from seo.site_value_worth w2
       where w2.site_id = p_site_id and w2.value_id = v.value_id and w2.deleted_at is null
       limit 1) w on true
    left join lateral (
      select count(*)::int as n,
             coalesce(jsonb_agg(x.pattern order by x.pattern), '[]'::jsonb) as patterns
        from seo.dimension_value_matcher x
       where x.site_id = p_site_id and x.value_id = v.value_id and x.deleted_at is null
         and x.pattern is not null) mc on true
    left join lateral (
      select count(*)::int as n from seo.site_value_worth w3
       where w3.site_id = p_site_id and w3.value_id = v.value_id and w3.deleted_at is not null) arch on true
    left join lateral (
      -- Provenance: written by THIS pack, either by the current adopt path
      -- (pack_item_id) or, for sites that adopted before KI-030, through the
      -- template rule this item was converted from.
      select (
        w.metadata->>'pack_item_id' = i.id::text
        or exists (
          select 1 from seo.keyword_class_rule sr
           where sr.id::text = w.metadata->>'rule_id'
             and sr.site_id = p_site_id
             and sr.metadata->>'template_rule_id' in (
               select jsonb_array_elements_text(coalesce(i.metadata->'converted_from_rules', '[]'::jsonb))))
      ) as from_pack) prov on true
    where i.pack_id = p_pack_id and i.item_kind = 'meaning' and i.deleted_at is null
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
        when (v.label, v.config) is distinct from (i.label, i.config) then 'changed'
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
        'offering_match', i.offering_match, 'notes', i.notes),
      'site', case when t.id is null then null else jsonb_build_object('weight', t.weight,
        'lead_quality', t.lead_quality, 'offering_match', t.offering_match, 'notes', t.notes) end,
      'state', case
        when t.id is null then 'missing'
        when t.deleted_at is not null then 'archived'
        when not (coalesce(t.metadata,'{}'::jsonb) ? 'pack_item_id') then 'yours'
        when (t.weight, t.lead_quality, t.offering_match)
             is distinct from (i.weight, i.lead_quality, i.offering_match) then 'changed'
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
    select item from meaning_items
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

drop function if exists seo.starter_pack_preview(uuid,uuid,date,date,uuid[],integer,uuid[]);

CREATE OR REPLACE FUNCTION seo.starter_pack_preview(p_site_id uuid, p_pack_id uuid, p_start date, p_end date, p_item_ids uuid[] DEFAULT NULL::uuid[], p_sample integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
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
  -- ── the pack's meaning, resolved against what this site already has ──
  pmeaning as (
    select i.id as item_id, i.dimension_scope, i.dimension_slug, i.value, i.label,
           i.worth_effect, i.worth_amount, i.matchers, i.sort,
           seo._pack_site_value_id(p_site_id, i.dimension_scope, i.dimension_slug, i.value) as value_id
    from seo.starter_pack_item i
    where i.pack_id = p_pack_id and i.item_kind = 'meaning' and i.deleted_at is null
      and (p_item_ids is null or i.id = any(p_item_ids))
  ),
  pstate as (
    select m.*,
           coalesce((select true from seo.site_value_worth w
                      where w.site_id = p_site_id and w.value_id = m.value_id
                        and w.deleted_at is null limit 1), false) as already_adopted
    from pmeaning m
  ),
  raw_hits as (
    -- a phrase the pack would stamp
    select b.kid, m.item_id, m.dimension_slug, m.sort
    from base b
    join pstate m on jsonb_array_length(coalesce(m.matchers, '[]'::jsonb)) > 0
    join lateral jsonb_array_elements(m.matchers) e on true
    where coalesce((e->>'enabled')::boolean, true)
      and ((e->>'kind' = 'contains'    and b.normalized_phrase like '%' || seo.gsc_perf_like_escape(lower(e->>'pattern')) || '%')
        or (e->>'kind' = 'exact'       and b.normalized_phrase = lower(e->>'pattern'))
        or (e->>'kind' = 'starts_with' and b.normalized_phrase like seo.gsc_perf_like_escape(lower(e->>'pattern')) || '%')
        or (e->>'kind' = 'ends_with'   and b.normalized_phrase like '%' || seo.gsc_perf_like_escape(lower(e->>'pattern')))
        or (e->>'kind' = 'word'        and b.normalized_phrase ~ ('\m' || lower(e->>'pattern') || '\M')))
    union
    -- a fact the keyword already carries: the pack only says what it is WORTH
    select b.kid, m.item_id, m.dimension_slug, m.sort
    from base b
    join pstate m on m.value_id is not null
      and jsonb_array_length(coalesce(m.matchers, '[]'::jsonb)) = 0
    where exists (select 1 from seo.keyword_facet kf
                   where kf.keyword_id = b.kid and kf.category_id = m.value_id
                     and kf.deleted_at is null)
  ),
  hits as (
    -- one value per dimension, exactly as the engine will collapse it
    select distinct on (h.kid, h.dimension_slug) h.kid, h.item_id
    from raw_hits h
    order by h.kid, h.dimension_slug, h.sort, h.item_id
  ),
  newworth as (
    select h.kid,
           coalesce(sum(m.worth_amount) filter (where m.worth_effect = 'add' and not m.already_adopted), 0) as adds,
           coalesce(exp(sum(ln(greatest(m.worth_amount, 0.0001)))
                     filter (where m.worth_effect = 'scale' and not m.already_adopted)), 1) as factor,
           bool_or(m.worth_effect = 'never' and not m.already_adopted) as any_never
    from hits h join pstate m on m.item_id = h.item_id
    group by h.kid
  ),
  -- ── the pack's topic worth, joined to what the site already rules ──
  ptopics as (
    select i.id as item_id, i.topic_id, i.weight, i.lead_quality, i.offering_match,
           exists (select 1 from seo.site_topic_value stv
                    where stv.site_id = p_site_id and stv.topic_id = i.topic_id
                      and stv.deleted_at is null) as already_valued
    from seo.starter_pack_item i
    where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
      and i.topic_id is not null
  ),
  candidates as (
    select stv.topic_id, stv.weight,
           (stv.lead_quality = 'negative_value'
              or stv.offering_match in ('not_offered','actively_avoided')) as negative_guard,
           false as from_pack
    from seo.site_topic_value stv
    where stv.site_id = p_site_id and stv.deleted_at is null
    union all
    select t.topic_id, t.weight,
           (t.lead_quality = 'negative_value'
              or t.offering_match in ('not_offered','actively_avoided')),
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
      coalesce(nw.adds, 0) as new_adds,
      coalesce(nw.factor, 1) as new_factor,
      coalesce(nw.any_never, false) as new_never,
      (nw.kid is not null) as meaning_touched,
      coalesce((select (r->>'total_before_factor')::numeric from jsonb_array_elements(b.reasons) r
                 where r->>'kind' = 'summary' limit 1), seo.fn_value_baseline(p_site_id)) as total_before,
      coalesce((select (r->>'factor')::numeric from jsonb_array_elements(b.reasons) r
                 where r->>'kind' = 'summary' limit 1), 1) as cur_factor,
      coalesce((select (r->>'has_meaning')::boolean from jsonb_array_elements(b.reasons) r
                 where r->>'kind' = 'summary' limit 1), false) as had_meaning,
      coalesce((select (r->>'never')::boolean from jsonb_array_elements(b.reasons) r
                 where r->>'kind' = 'summary' limit 1), false) as cur_never
    from base b
    left join new_base nb on nb.kw_id = b.kid
    left join newworth nw on nw.kid = b.kid
  ),
  touched as (
    select p.* from parts p
    where p.meaning_touched or p.base_from_pack
  ),
  scored as (
    -- baseline + adds -> factors (clamped 0.05-5) -> floor at 0 -> never wins
    select t.*,
      case
        when t.source = 'override' then null
        when t.cur_never or t.new_negative_guard or t.new_never then 0
        else greatest(0, round(
               (t.total_before
                  - coalesce(t.old_base_weight, 0)
                  + coalesce(t.new_base_weight, coalesce(t.old_base_weight, 0))
                  + t.new_adds)
               * least(5, greatest(0.05, t.cur_factor * t.new_factor)), 1))
      end as next_raw,
      (t.meaning_touched and t.new_adds = 0 and t.new_factor = 1 and not t.new_never
         and t.new_base_weight is null and t.source <> 'override') as stamped_only
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
  per_meaning as (
    select m.item_id, m.already_adopted,
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
               where h2.item_id = m.item_id
               order by b2.c desc, b2.i desc
               limit v_sample) q), '[]'::jsonb) as samples
    from pstate m
    left join hits h on h.item_id = m.item_id
    left join base b on b.kid = h.kid
    left join banded bd on bd.kid = h.kid
    group by m.item_id, m.already_adopted
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
    'meaning', coalesce((select jsonb_agg(to_jsonb(pm)) from per_meaning pm), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(to_jsonb(pt)) from per_topic pt), '[]'::jsonb))
  into v_result;

  return v_result;
end;
$function$;

revoke all on function seo.starter_pack_catalog(text,uuid) from public;
grant execute on function seo.starter_pack_catalog(text,uuid) to authenticated, service_role;
revoke all on function seo.starter_pack_preview(uuid,uuid,date,date,uuid[],integer) from public;
grant execute on function seo.starter_pack_preview(uuid,uuid,date,date,uuid[],integer) to authenticated, service_role;

notify pgrst, 'reload schema';
