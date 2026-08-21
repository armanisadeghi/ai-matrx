-- Preserve the canonical clear-ruling behavior in the generated Supabase
-- contract: omitting p_value_tier means NULL, which clears the override.
CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_value(
  p_site_id uuid,
  p_keyword_ids uuid[],
  p_value_tier text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS TABLE (keyword_id uuid, value_band text, value_source text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_org uuid;
  v_valid boolean;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords';
  END IF;

  IF p_value_tier IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM seo.site_vocabulary sv
      WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'value_band'
        AND sv.active AND sv.deleted_at IS NULL AND sv.value = p_value_tier
      UNION ALL
      SELECT 1 FROM platform.categories c
      WHERE c.dimension = 'seo_value_band' AND c.deleted_at IS NULL AND c.slug = p_value_tier
        AND NOT EXISTS (SELECT 1 FROM seo.site_vocabulary sv2
          WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'value_band'
            AND sv2.active AND sv2.deleted_at IS NULL)
    ) INTO v_valid;
    IF NOT v_valid THEN
      RAISE EXCEPTION 'gsc_unknown_value_band: % is not in this site''s value-band vocabulary', p_value_tier;
    END IF;
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  INSERT INTO seo.site_keyword_value AS skv
    (organization_id, site_id, keyword_id, value_tier, notes, metadata)
  SELECT v_org, p_site_id, kid, p_value_tier,
         CASE WHEN p_notes IS NOT NULL AND btrim(p_notes) <> '' THEN p_notes END,
         jsonb_build_object('valuation', jsonb_build_object(
           'origin', 'human', 'applied_at', now()))
  FROM unnest(p_keyword_ids) AS kid
  ON CONFLICT (site_id, keyword_id)
  DO UPDATE SET
    value_tier = EXCLUDED.value_tier,
    notes = COALESCE(EXCLUDED.notes, skv.notes),
    metadata = skv.metadata || EXCLUDED.metadata,
    updated_at = now();

  RETURN QUERY
  SELECT vm.keyword_id, vm.value_band, vm.value_source
  FROM seo.keyword_value_map(p_site_id) vm
  WHERE vm.keyword_id = ANY (p_keyword_ids);
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_set_keyword_value(uuid,uuid[],text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_set_keyword_value(uuid,uuid[],text,text) TO authenticated, service_role;
