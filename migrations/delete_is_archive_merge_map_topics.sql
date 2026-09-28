-- based-on: seo.merge_map_topics(uuid, text[], text) 6c653848d42d7bc9bc514e5528353a5a30754933b4401c1fddeaacf02b950187
-- Delete means archive (Arman, 2026-09-27): merging topical-map topics hard-
-- deleted the platform.associations edges that lost the merge (duplicates of an
-- edge the target already holds). They are now archived (deleted_at) on the
-- retired source topic. Every SEO reader of these edges already filters
-- deleted_at (map_topic_associations, _tm_attachments, list_page_intents, ...).
-- Body is the live pg_get_functiondef read immediately before writing; the only
-- change is DELETE -> UPDATE ... SET deleted_at on live rows.

CREATE OR REPLACE FUNCTION seo.merge_map_topics(p_map_id uuid, p_from_slugs text[], p_into_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_into uuid; v_from uuid[]; v_assoc int := 0; v_nodes int := 0; v_kw int := 0; v_children int := 0; v_dup int := 0; n int;
        v_org uuid;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'merge_map_topics: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_from_slugs IS NULL THEN RAISE EXCEPTION 'merge_map_topics: p_from_slugs is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_into_slug IS NULL THEN RAISE EXCEPTION 'merge_map_topics: p_into_slug is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  v_org := v_map.organization_id;
  -- ROUND 22: merging into a retired or rejected topic buries every attachment
  -- it moves. A DESTINATION must be live.
  v_into := seo._tm_live_topic_id(p_map_id, p_into_slug);
  IF v_into IS NULL THEN perform platform.refuse_not_found(format('target topic %s not found', p_into_slug)); END IF;
  SELECT array_agg(id) INTO v_from FROM seo.map_topic
   WHERE map_id = p_map_id AND slug = ANY(p_from_slugs) AND deleted_at IS NULL AND id <> v_into;
  IF v_from IS NULL OR array_length(v_from,1) <> array_length(p_from_slugs,1) THEN
    perform platform.refuse_not_found('merge_map_topics: one or more source slugs not found (or equal to the target)');
  END IF;

  -- ROUND 18: rows filed under another organization are never touched (every
  -- statement below is scoped to v_org) and never counted in the result.

  -- Delete means archive (2026-09-27): an edge that loses the merge is
  -- archived (deleted_at) on the retired topic, never removed.
  UPDATE platform.associations a SET deleted_at = now()
    FROM seo.map_facet_value v, seo.map_facet_value tv, platform.associations ta
   WHERE a.source_type='seo_map_topic' AND a.source_id = ANY(v_from) AND a.target_type='seo_map_facet_value' AND a.role='facet'
     AND a.organization_id = v_org AND a.deleted_at IS NULL
     AND v.id = a.target_id
     AND ta.source_type='seo_map_topic' AND ta.source_id = v_into AND ta.target_type='seo_map_facet_value' AND ta.role='facet' AND ta.deleted_at IS NULL
     AND tv.id = ta.target_id AND tv.facet_id = v.facet_id;
  GET DIAGNOSTICS v_dup = ROW_COUNT;

  -- ROUND 23: when the topic being removed AND the target BOTH hold an edge
  -- from the same row with the same role, only one survives the move. It
  -- used to be the target's, whoever wrote it — so a merge could silently
  -- drop a person's edge and keep a mapper's. The higher source wins; an
  -- equal one leaves the target untouched. The payload MOVES INTACT: no
  -- mover re-stamps `source`.
  UPDATE platform.associations t
     SET payload_kind = f.payload_kind, payload = f.payload
    FROM platform.associations f
   WHERE t.target_type='seo_map_topic' AND t.target_id = v_into AND t.organization_id = v_org
     AND f.target_type='seo_map_topic' AND f.target_id = ANY(v_from) AND f.organization_id = v_org
     AND f.source_type = t.source_type AND f.source_id = t.source_id
     AND f.role IS NOT DISTINCT FROM t.role
     AND seo._tm_source_rank(f.payload->>'source') > seo._tm_source_rank(t.payload->>'source');
  UPDATE platform.associations t
     SET payload_kind = f.payload_kind, payload = f.payload
    FROM platform.associations f
   WHERE t.source_type='seo_map_topic' AND t.source_id = v_into AND t.organization_id = v_org
     AND f.source_type='seo_map_topic' AND f.source_id = ANY(v_from) AND f.organization_id = v_org
     AND f.target_type = t.target_type AND f.target_id = t.target_id
     AND f.role IS NOT DISTINCT FROM t.role
     AND seo._tm_source_rank(f.payload->>'source') > seo._tm_source_rank(t.payload->>'source');
  UPDATE platform.associations SET source_id = v_into
   WHERE source_type='seo_map_topic' AND source_id = ANY(v_from) AND organization_id = v_org
     AND NOT EXISTS (SELECT 1 FROM platform.associations x WHERE x.source_type='seo_map_topic' AND x.source_id=v_into
                       AND x.target_type=platform.associations.target_type AND x.target_id=platform.associations.target_id AND x.role=platform.associations.role);
  GET DIAGNOSTICS n = ROW_COUNT; v_assoc := v_assoc + n;
  UPDATE platform.associations SET deleted_at = now()
   WHERE source_type='seo_map_topic' AND source_id = ANY(v_from) AND organization_id = v_org AND deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; v_dup := v_dup + n;

  UPDATE platform.associations SET target_id = v_into
   WHERE target_type='seo_map_topic' AND target_id = ANY(v_from) AND organization_id = v_org
     AND NOT EXISTS (SELECT 1 FROM platform.associations x WHERE x.target_type='seo_map_topic' AND x.target_id=v_into
                       AND x.source_type=platform.associations.source_type AND x.source_id=platform.associations.source_id AND x.role=platform.associations.role);
  GET DIAGNOSTICS n = ROW_COUNT; v_assoc := v_assoc + n;
  UPDATE platform.associations SET deleted_at = now()
   WHERE target_type='seo_map_topic' AND target_id = ANY(v_from) AND organization_id = v_org AND deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; v_dup := v_dup + n;

  UPDATE plan.node SET topic_id = v_into WHERE topic_id = ANY(v_from) AND organization_id = v_org;
  GET DIAGNOSTICS v_nodes = ROW_COUNT;
  UPDATE seo.site_keyword_value SET topic_id = v_into WHERE topic_id = ANY(v_from) AND organization_id = v_org;
  GET DIAGNOSTICS v_kw = ROW_COUNT;

  UPDATE seo.map_topic SET parent_id = v_into WHERE parent_id = ANY(v_from) AND map_id = p_map_id AND deleted_at IS NULL AND id <> v_into;
  GET DIAGNOSTICS v_children = ROW_COUNT;

  UPDATE seo.map_topic SET status = 'retired' WHERE id = ANY(v_from) AND map_id = p_map_id;

  RETURN jsonb_build_object('ok', true, 'into', p_into_slug, 'retired', to_jsonb(p_from_slugs),
                            'associations_moved', v_assoc, 'associations_dropped_as_duplicate', v_dup,
                            'planned_pages_moved', v_nodes, 'keywords_moved', v_kw, 'children_reparented', v_children);
END $function$
;
