-- MSR-26: keyword research goes to a SITE, not an organization.
-- 1. seo.fn_ingest_keyword_research gains p_site_id (optional, appended so
--    existing callers keep working) and writes seo.site_keyword_value rows
--    for every keyword the artifact touches — idempotent (UNIQUE(site_id,
--    keyword_id), ON CONFLICT DO NOTHING).
-- 2. seo.site_keyword_value_copy — sibling of seo.site_meaning_copy — copies
--    the site<->keyword associations from one site to another. Global
--    keyword ids travel as-is; only the site_keyword_value row is recreated.

CREATE OR REPLACE FUNCTION seo.fn_ingest_keyword_research(
  p_research jsonb,
  p_language text DEFAULT 'en'::text,
  p_research_doc_id uuid DEFAULT NULL::uuid,
  p_site_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'public'
AS $function$
declare
  v_doc jsonb;
  v_list jsonb;
  v_label text;
  v_phrase text;
  v_primary_id uuid;
  v_other_id uuid;
  v_created boolean;
  v_src uuid; v_tgt uuid; v_type text;
  v_detail jsonb;
  v_kw_created int := 0; v_kw_existing int := 0;
  v_edge_written int := 0; v_edge_rejected_skipped int := 0; v_edge_self_skipped int := 0;
  v_primaries jsonb := '[]'::jsonb;
  v_site_org uuid;
  v_keyword_ids uuid[] := '{}';
  v_site_values_created int := 0;
begin
  if p_site_id is not null then
    select organization_id into v_site_org from web.site where id = p_site_id and deleted_at is null;
    if v_site_org is null then
      raise exception 'seo_research_site_not_found: site % does not exist', p_site_id using errcode = 'P0002';
    end if;
  end if;

  for v_doc in
    select d from jsonb_array_elements(
      case when jsonb_typeof(p_research) = 'array' then p_research
           else jsonb_build_array(p_research) end) d
  loop
    continue when v_doc is null or v_doc->>'primary_keyword' is null;

    select o_id, o_created into v_primary_id, v_created
    from seo.fn_upsert_keyword(v_doc->>'primary_keyword', p_language);
    if v_created then v_kw_created := v_kw_created + 1; else v_kw_existing := v_kw_existing + 1; end if;
    v_primaries := v_primaries || to_jsonb(v_primary_id);
    v_keyword_ids := v_keyword_ids || v_primary_id;

    for v_list in select jsonb_array_elements(coalesce(v_doc->'keyword_lists','[]'::jsonb)) loop
      v_label := lower(coalesce(v_list->>'label',''));

      for v_phrase in
        select distinct btrim(x.value)
        from jsonb_array_elements_text(coalesce(v_list->'keywords','[]'::jsonb)) x
        where length(btrim(x.value)) > 0
      loop
        select o_id, o_created into v_other_id, v_created
        from seo.fn_upsert_keyword(v_phrase, p_language);
        if v_created then v_kw_created := v_kw_created + 1; else v_kw_existing := v_kw_existing + 1; end if;
        v_keyword_ids := v_keyword_ids || v_other_id;

        if v_label like 'parent%' then
          v_src := v_primary_id; v_tgt := v_other_id; v_type := 'refines';
        elsif v_label like 'child%' then
          v_src := v_other_id; v_tgt := v_primary_id; v_type := 'refines';
        elsif v_label like '%lsi%' then
          v_src := v_other_id; v_tgt := v_primary_id; v_type := 'variant_of';
        elsif v_label like 'related%' then
          v_src := least(v_primary_id, v_other_id); v_tgt := greatest(v_primary_id, v_other_id); v_type := 'related';
        else
          continue;
        end if;

        if v_src = v_tgt then
          v_edge_self_skipped := v_edge_self_skipped + 1;
          continue;
        end if;

        v_detail := jsonb_build_object('list_label', v_list->>'label');
        if p_research_doc_id is not null then
          v_detail := v_detail || jsonb_build_object('research_id', p_research_doc_id);
        end if;

        if exists (select 1 from seo.keyword_edge e
                   where e.source_keyword_id = v_src and e.target_keyword_id = v_tgt
                     and e.edge_type = v_type and e.status = 'rejected') then
          v_edge_rejected_skipped := v_edge_rejected_skipped + 1;
          continue;
        end if;

        insert into seo.keyword_edge (source_keyword_id, target_keyword_id, edge_type, origin, status, confidence, detail)
        values (v_src, v_tgt, v_type, 'ai_research', 'proposed', 60, v_detail)
        on conflict (source_keyword_id, target_keyword_id, edge_type) do update
          set confidence = greatest(coalesce(seo.keyword_edge.confidence,0), excluded.confidence),
              detail = seo.keyword_edge.detail || excluded.detail
          where seo.keyword_edge.status <> 'rejected';
        v_edge_written := v_edge_written + 1;
      end loop;
    end loop;
  end loop;

  -- The site<->keyword association — the actual defect this migration fixes.
  -- Every keyword this run touched (primary + every list phrase) lands on
  -- the site. The phrase identity itself stays in the shared global library
  -- (seo.keyword); only the (site_id, keyword_id) row is created here.
  if p_site_id is not null and array_length(v_keyword_ids, 1) > 0 then
    insert into seo.site_keyword_value (site_id, keyword_id, organization_id)
    select distinct p_site_id, kid, v_site_org
    from unnest(v_keyword_ids) as kid
    on conflict (site_id, keyword_id) do nothing;
    get diagnostics v_site_values_created = row_count;
  end if;

  return jsonb_build_object(
    'primary_keyword_ids', v_primaries,
    'keywords_created', v_kw_created,
    'keywords_already_existed', v_kw_existing,
    'edges_written', v_edge_written,
    'edges_skipped_rejected', v_edge_rejected_skipped,
    'edges_skipped_self', v_edge_self_skipped,
    'site_keyword_values_created', v_site_values_created);
end;
$function$;

-- Sibling of seo.site_meaning_copy: copy site<->keyword associations from
-- one site to another. Permission-checked both ends via
-- seo.fn_is_site_editor; global keyword ids travel as-is, only the site row
-- is recreated; provenance stamped in metadata->>'copied_from_site'.
CREATE OR REPLACE FUNCTION seo.site_keyword_value_copy(
  p_from_site uuid,
  p_to_site uuid,
  p_keyword_ids uuid[] DEFAULT NULL,
  p_dry_run boolean DEFAULT true
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $function$
DECLARE
  v_copied     int;
  v_skipped    int;
  v_org        uuid;
  v_from_label text;
  v_to_label   text;
BEGIN
  IF p_from_site IS NULL OR p_to_site IS NULL THEN
    RAISE EXCEPTION 'seo_copy_needs_two_sites: choose the site to copy from and the site to copy into';
  END IF;
  IF p_from_site = p_to_site THEN
    RAISE EXCEPTION 'seo_copy_same_site: those are the same site';
  END IF;
  IF NOT seo.fn_is_site_editor(p_from_site) THEN
    RAISE EXCEPTION 'seo_copy_denied_source: you can not read the keywords of the site you are copying from'
      USING ERRCODE = '42501';
  END IF;
  IF NOT seo.fn_is_site_editor(p_to_site) THEN
    RAISE EXCEPTION 'seo_copy_denied_target: you do not have permission to change this site'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(name, domain) INTO v_from_label FROM web.site WHERE id = p_from_site AND deleted_at IS NULL;
  SELECT COALESCE(name, domain), organization_id INTO v_to_label, v_org FROM web.site WHERE id = p_to_site AND deleted_at IS NULL;
  IF v_from_label IS NULL OR v_to_label IS NULL THEN
    RAISE EXCEPTION 'seo_site_not_found: one of those sites does not exist' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) FILTER (WHERE NOT dup), count(*) FILTER (WHERE dup) INTO v_copied, v_skipped
  FROM (
    SELECT EXISTS (
             SELECT 1 FROM seo.site_keyword_value t
              WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.keyword_id = s.keyword_id
           ) AS dup
      FROM seo.site_keyword_value s
     WHERE s.site_id = p_from_site AND s.deleted_at IS NULL
       AND (p_keyword_ids IS NULL OR s.keyword_id = ANY(p_keyword_ids))
  ) x;

  IF NOT p_dry_run THEN
    INSERT INTO seo.site_keyword_value (site_id, keyword_id, organization_id, created_by, metadata)
    SELECT p_to_site, s.keyword_id, v_org, (SELECT auth.uid()),
           COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site)
      FROM seo.site_keyword_value s
     WHERE s.site_id = p_from_site AND s.deleted_at IS NULL
       AND (p_keyword_ids IS NULL OR s.keyword_id = ANY(p_keyword_ids))
       AND NOT EXISTS (
             SELECT 1 FROM seo.site_keyword_value t
              WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.keyword_id = s.keyword_id
           );
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'from', jsonb_build_object('id', p_from_site, 'label', v_from_label),
    'to',   jsonb_build_object('id', p_to_site,   'label', v_to_label),
    'copied', v_copied,
    'skipped_existing', v_skipped);
END;
$function$;

GRANT EXECUTE ON FUNCTION seo.site_keyword_value_copy(uuid, uuid, uuid[], boolean) TO authenticated, service_role;
