-- KI-034 — a proposal is addressed to someone who can actually act on it.
--
-- Rule (Arman, 2026-08-25): a human with edit access to the site approves
-- suggestions in their own scope, including their own corrections; anything an
-- AGENT proposes goes to the owner of the thing being changed.
--
-- aidream calls this RPC `acting_as_user`, so the caller's identity alone cannot
-- tell an agent from a person — origin is decided by the provenance the tool
-- layer already stamps (`toolCallId` / `runId` / `agentName`).
--
-- `seo.fn_is_site_editor` is the SAME predicate `gsc_assert_site_editor` raises
-- on, extracted so the two can never drift; the assert now calls it.

CREATE OR REPLACE FUNCTION seo.fn_is_site_editor(p_site_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_created_by uuid;
BEGIN
  SELECT s.created_by INTO v_created_by
  FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN public.is_platform_admin()
      OR v_created_by = (SELECT auth.uid())
      OR iam.has_access('web_site', p_site_id, 'editor'::public.permission_level);
END;
$fn$;

REVOKE ALL ON FUNCTION seo.fn_is_site_editor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.fn_is_site_editor(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION seo.gsc_assert_site_editor(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  IF seo.fn_is_site_editor(p_site_id) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'gsc_site_edit_denied: no editor access to site %', p_site_id
    USING ERRCODE = '42501';
END;
$fn$;

CREATE OR REPLACE FUNCTION seo.keyword_meaning_suggest(p_site_id uuid, p_proposal jsonb, p_title text, p_body text DEFAULT NULL::text, p_reasoning text DEFAULT NULL::text, p_confidence real DEFAULT NULL::real, p_evidence jsonb DEFAULT NULL::jsonb, p_provenance jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(assist_id uuid, status text, dedupe_key text, payload_hash text, addressee uuid, proposal jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_site      record;
  v_kind      text := p_proposal ->> 'proposal';
  v_p         jsonb := p_proposal;
  v_hash      text;
  v_dedupe    text;
  v_existing  record;
  v_action    jsonb;
  v_id        uuid;
  v_source    text;
  v_dim       record;
  v_val       record;
  v_fact      record;
  v_label     text;
  v_ids       uuid[];
  v_phrases   jsonb;
  v_by_agent  boolean;
  v_addressee uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_suggest_unauthenticated';
  END IF;
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF v_kind IS NULL OR v_kind NOT IN ('matcher','worth','stamp','guideline_edit') THEN
    RAISE EXCEPTION 'seo_suggest_bad_proposal: proposal must be matcher | worth | stamp | guideline_edit (got %)', COALESCE(v_kind,'null');
  END IF;
  IF NULLIF(btrim(COALESCE(p_title,'')),'') IS NULL THEN
    RAISE EXCEPTION 'seo_suggest_title_required: say in one line what you are proposing';
  END IF;

  SELECT s.id AS id, s.organization_id AS organization_id, s.created_by AS created_by,
         COALESCE(s.name, s.domain) AS label
    INTO v_site
    FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_site.id IS NULL THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  -- KI-034 — WHO IS ASKED TO APPROVE THIS.
  -- An agent's proposal always goes to the owner of the thing being changed.
  -- A person's own proposal goes to that person, provided they may edit the
  -- site. Before this every proposal was addressed to the site owner, so an
  -- agency employee who corrected a keyword was told to approve it in a queue
  -- they could not open — their own work was invisible to them.
  -- Agent origin is read off the provenance the tool layer stamps (tool call,
  -- run, agent name); a person acting in the product carries none of those.
  v_by_agent := COALESCE(p_provenance, '{}'::jsonb) ?| ARRAY['toolCallId','runId','agentName'];
  v_addressee := CASE
    WHEN v_by_agent THEN v_site.created_by
    WHEN seo.fn_is_site_editor(p_site_id) THEN v_uid
    ELSE v_site.created_by
  END;
  IF v_addressee IS NULL THEN
    RAISE EXCEPTION 'seo_suggest_no_addressee: site % has no owner to approve this', p_site_id;
  END IF;

  IF v_kind IN ('matcher','worth','stamp') THEN
    SELECT d.id AS id, d.slug AS slug, d.name AS label,
           COALESCE(d.metadata->>'scope','platform') AS scope,
           (d.metadata->>'site_id')::uuid AS dim_site_id
      INTO v_dim
    FROM platform.categories d
    WHERE d.dimension = 'seo_facet' AND d.parent_id IS NULL AND d.deleted_at IS NULL
      AND d.slug = (v_p ->> 'dimensionSlug');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_suggest_unknown_dimension: there is no dimension named "%"', COALESCE(v_p ->> 'dimensionSlug','(none)');
    END IF;
    IF v_dim.scope = 'site' AND v_dim.dim_site_id IS DISTINCT FROM p_site_id THEN
      RAISE EXCEPTION 'seo_suggest_forbidden: "%" belongs to another site', v_dim.slug;
    END IF;

    SELECT v.id AS id, v.name AS label
      INTO v_val
    FROM platform.categories v
    WHERE v.parent_id = v_dim.id AND v.deleted_at IS NULL
      AND v.slug = v_dim.slug || ':' || (v_p ->> 'valueSlug');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_suggest_unknown_value: "%" is not a value of "%". Propose it on the dimension first.', COALESCE(v_p ->> 'valueSlug','(none)'), v_dim.slug;
    END IF;

    v_p := v_p || jsonb_build_object(
      'valueId',        v_val.id,
      'dimensionSlug',  v_dim.slug,
      'dimensionLabel', v_dim.label,
      'valueSlug',      v_p ->> 'valueSlug',
      'valueLabel',     v_val.label
    );
  END IF;

  IF v_kind = 'matcher' THEN
    IF (v_p ->> 'matcherKind') = 'place' AND (v_p ->> 'placeId') IS NOT NULL THEN
      SELECT g.name INTO v_label FROM seo.geo_place g
       WHERE g.id = (v_p ->> 'placeId')::uuid AND g.deleted_at IS NULL;
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'seo_suggest_unknown_place: % is not a place in the gazetteer', v_p ->> 'placeId';
      END IF;
      v_p := v_p || jsonb_build_object('placeLabel', v_label);
    ELSIF (v_p ->> 'matcherKind') = 'fact' THEN
      SELECT v.id AS id, d.name || ' -> ' || v.name AS label
        INTO v_fact
      FROM platform.categories v
      JOIN platform.categories d ON d.id = v.parent_id AND d.deleted_at IS NULL
      WHERE v.deleted_at IS NULL AND v.dimension = 'seo_facet'
        AND d.slug = (v_p ->> 'factDimensionSlug')
        AND v.slug = (v_p ->> 'factDimensionSlug') || ':' || (v_p ->> 'factValueSlug');
      IF NOT FOUND THEN
        RAISE EXCEPTION 'seo_suggest_unknown_fact: "%:%" is not a dimension value', COALESCE(v_p ->> 'factDimensionSlug','(none)'), COALESCE(v_p ->> 'factValueSlug','(none)');
      END IF;
      v_p := v_p || jsonb_build_object('factValueId', v_fact.id, 'factLabel', v_fact.label);
    ELSIF (v_p ->> 'matcherKind') = 'condition' AND (v_p ->> 'conditionRuleId') IS NOT NULL THEN
      SELECT r.name INTO v_label FROM seo.gsc_dig_rule r
       WHERE r.id = (v_p ->> 'conditionRuleId')::uuid AND r.deleted_at IS NULL;
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'seo_suggest_unknown_condition: % is not a Dig Here rule', v_p ->> 'conditionRuleId';
      END IF;
      v_p := v_p || jsonb_build_object('conditionLabel', v_label);
    END IF;
  END IF;

  IF v_kind = 'stamp' THEN
    SELECT array_agg(x::uuid) INTO v_ids
      FROM jsonb_array_elements_text(COALESCE(v_p -> 'keywordIds','[]'::jsonb)) AS t(x);
    IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION 'gsc_no_keywords: choose at least one keyword';
    END IF;
    SELECT jsonb_agg(k.phrase ORDER BY k.phrase) INTO v_phrases
      FROM seo.keyword k WHERE k.id = ANY(v_ids) AND k.deleted_at IS NULL;
    IF v_phrases IS NULL THEN
      RAISE EXCEPTION 'seo_suggest_unknown_keywords: none of those keyword ids exist';
    END IF;
    v_p := v_p || jsonb_build_object('keywordPhrases', v_phrases);
  END IF;

  IF v_kind = 'guideline_edit' THEN
    v_p := v_p || jsonb_build_object(
      'baseVersion',
      COALESCE((SELECT (s.settings -> 'kw_guidelines' ->> 'version')::int
                  FROM web.site s WHERE s.id = p_site_id), 0)
    );
    IF NULLIF(btrim(COALESCE(v_p ->> 'proposedText','')),'') IS NULL THEN
      RAISE EXCEPTION 'seo_suggest_empty_guidelines: send the FULL proposed document, not a patch';
    END IF;
  END IF;

  v_hash   := md5(v_p::text);
  v_dedupe := 'seo.keyword_meaning:' || p_site_id::text || ':' || v_hash;
  v_source := 'seo.keyword_meaning.' || v_kind;

  SELECT a.id AS id, a.status AS status INTO v_existing
    FROM platform.assists a
   WHERE a.dedupe_key = v_dedupe AND a.deleted_at IS NULL
   ORDER BY (a.status = 'pending') DESC, a.created_at DESC
   LIMIT 1;

  IF v_existing.id IS NOT NULL AND v_existing.status IN ('accepted','dismissed') THEN
    RETURN QUERY SELECT v_existing.id, 'already_decided'::text, v_dedupe, v_hash, v_addressee, v_p;
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL AND v_existing.status = 'pending' THEN
    UPDATE platform.assists a
       SET title       = p_title,
           body        = p_body,
           reasoning   = p_reasoning,
           confidence  = p_confidence,
           evidence    = p_evidence,
           occurrences = a.occurrences + 1,
           updated_at  = now()
     WHERE a.id = v_existing.id;
    RETURN QUERY SELECT v_existing.id, 'already_pending'::text, v_dedupe, v_hash, v_addressee, v_p;
    RETURN;
  END IF;

  v_action := jsonb_build_object(
    'kind',        'apply_keyword_meaning',
    'siteId',      p_site_id,
    'siteLabel',   v_site.label,
    'proposal',    v_p,
    'provenance',  COALESCE(p_provenance, '{}'::jsonb)
                     || jsonb_build_object('proposedBy', v_uid,
                                           'proposedByAgent', v_by_agent,
                                           'addressedTo', v_addressee),
    'payloadHash', v_hash
  );

  INSERT INTO platform.assists
    (user_id, entity_type, entity_id, surface_name, source_kind, source_key,
     title, body, reasoning, confidence, action, dedupe_key, expires_at,
     priority, organization_id, evidence, first_seen_at)
  VALUES
    (v_addressee, 'web_site', p_site_id,
     'matrx-user/keyword-meaning-review', 'agent', v_source,
     p_title, p_body, p_reasoning, p_confidence, v_action, v_dedupe,
     now() + interval '30 days',
     0, v_site.organization_id, p_evidence, now())
  RETURNING assists.id INTO v_id;

  RETURN QUERY SELECT v_id, 'created'::text, v_dedupe, v_hash, v_addressee, v_p;
END;
$function$;
