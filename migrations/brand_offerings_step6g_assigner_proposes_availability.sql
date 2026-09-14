-- Brand-offerings cutover, step 6g: an agent never makes an offering available
-- on a site. It proposes it (D2, explicit availability).
--
-- Plan of record: docs/db_rebuild/proposals/brand-offerings-cutover.md.
--
-- The defect: when the Offering assigner (aidream topic assigner) or the site
-- valuer placed a keyword on, or valued, an offering the site had not selected,
-- aidream called seo.fn_site_offering_for_topic, which ADOPTED the offering into
-- the brand and INSERTED a web.site_offering row. D2 says absence of that row
-- is the site's decision; no agent may reverse it silently. (Live census
-- 2026-09-14 before this file: 0 site_offering and 0 brand_offering rows carry
-- the helper's `adopted_through = 'legacy topic writer'` marker, so no silent
-- availability write has landed yet and nothing needs to be undone.)
--
-- 1. seo.fn_site_available_offering_for_template(site, template) - service
--    read: this site's brand offering adopted from that template, ONLY when the
--    site offers it right now. Never inserts. (Every product/service seo.topic
--    id is also its web.offering_template id: 409 of 409 live, checked below.)
-- 2. seo.propose_site_offering_from_template(...) - service writer: one
--    pending `keyword_meaning:offering` proposal per (site, template) in the ONE
--    approval queue (platform.assists, surface matrx-user/keyword-meaning-review,
--    the exact action shape seo.keyword_meaning_suggest writes), addressed to
--    the site's owner. Repeated runs merge their keywords into the pending row;
--    a proposal a person already approved or rejected is never re-opened
--    (P12). It carries templateId, so Approve replays
--    web.adopt_offering_template (copy-on-adopt, D6), then places the carried
--    keywords through seo.gsc_set_keyword_offering and sets worth through
--    seo.set_site_offering_value - the ordinary human writers.
-- 3. seo.fn_site_offering_for_topic is no longer called by any agent path; it
--    remains only under the legacy human topic RPCs until they are retired.

-- Guard the identity this file relies on.
DO $do$
DECLARE v_missing bigint;
BEGIN
  SELECT count(*) INTO v_missing
  FROM seo.topic t
  WHERE t.deleted_at IS NULL AND t.node_type IN ('product', 'service')
    AND NOT EXISTS (SELECT 1 FROM web.offering_template ot WHERE ot.id = t.id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'offering_template_identity_broken: % live product/service topics have no template with the same id', v_missing;
  END IF;
END
$do$;

-- 1. ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION seo.fn_site_available_offering_for_template(p_site_id uuid, p_template_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = seo, web, pg_temp
AS $function$
  SELECT bo.id
  FROM web.site s
  JOIN web.brand_offering bo
    ON bo.brand_id = s.brand_id AND bo.template_id = p_template_id
   AND bo.status = 'active' AND bo.deleted_at IS NULL
  JOIN web.site_offering so
    ON so.site_id = s.id AND so.brand_offering_id = bo.id
   AND so.status = 'active' AND so.deleted_at IS NULL
  WHERE s.id = p_site_id AND s.deleted_at IS NULL
  ORDER BY bo.created_at
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION seo.fn_site_available_offering_for_template(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seo.fn_site_available_offering_for_template(uuid, uuid) TO service_role;
COMMENT ON FUNCTION seo.fn_site_available_offering_for_template(uuid, uuid) IS
  'Service read (brand-offerings cutover D2): this site''s brand offering adopted from the template, only when the site offers it now. NULL means the site does not offer it; the caller proposes it through seo.propose_site_offering_from_template and never makes it available itself.';

-- 2. ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION seo.propose_site_offering_from_template(
  p_site_id uuid,
  p_template_id uuid,
  p_keyword_ids uuid[] DEFAULT '{}'::uuid[],
  p_value_add numeric DEFAULT NULL,
  p_agent_name text DEFAULT 'Offering assigner',
  p_reasoning text DEFAULT NULL,
  p_provenance jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(assist_id uuid, status text, keyword_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, platform, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_site      record;
  v_template  web.offering_template%ROWTYPE;
  v_dedupe    text;
  v_existing  record;
  v_ids       uuid[];
  v_phrases   jsonb;
  v_count     integer;
  v_value     numeric;
  v_proposal  jsonb;
  v_title     text;
  v_body      text;
  v_id        uuid;
  v_agent     text := COALESCE(NULLIF(btrim(COALESCE(p_agent_name, '')), ''), 'Offering assigner');
BEGIN
  SELECT s.id, s.organization_id, s.brand_id, s.created_by, COALESCE(s.name, s.domain) AS label
    INTO v_site
  FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_site.id IS NULL THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  IF v_site.brand_id IS NULL THEN
    RAISE EXCEPTION 'offering_site_has_no_brand: give this site a brand before proposing offerings for it';
  END IF;
  IF v_site.created_by IS NULL THEN
    RAISE EXCEPTION 'seo_suggest_no_addressee: site % has no owner to approve this', p_site_id;
  END IF;

  SELECT * INTO v_template FROM web.offering_template ot
  WHERE ot.id = p_template_id AND ot.status = 'active' AND ot.deleted_at IS NULL;
  IF v_template.id IS NULL THEN
    RAISE EXCEPTION 'offering_template_not_found: % is not an active offering template', p_template_id USING ERRCODE = 'P0002';
  END IF;

  -- Already offered: there is nothing to propose; the caller places directly.
  IF seo.fn_site_available_offering_for_template(p_site_id, p_template_id) IS NOT NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'already_available'::text, 0;
    RETURN;
  END IF;

  v_dedupe := 'seo.keyword_meaning:' || p_site_id::text || ':offering-template:' || p_template_id::text;

  SELECT a.id, a.status, a.action INTO v_existing
  FROM platform.assists a
  WHERE a.dedupe_key = v_dedupe AND a.deleted_at IS NULL
  ORDER BY (a.status = 'pending') DESC, a.created_at DESC
  LIMIT 1;

  -- P12: a person already ruled on this exact proposal; never re-open it.
  IF v_existing.id IS NOT NULL AND v_existing.status <> 'pending' THEN
    RETURN QUERY SELECT v_existing.id, 'already_decided'::text, 0;
    RETURN;
  END IF;

  -- The carried keywords: the pending row's plus this run's, live keywords only.
  SELECT COALESCE(array_agg(DISTINCT k.id), '{}'::uuid[]) INTO v_ids
  FROM seo.keyword k
  WHERE k.deleted_at IS NULL
    AND k.id IN (
      SELECT unnest(COALESCE(p_keyword_ids, '{}'::uuid[]))
      UNION
      SELECT x::uuid FROM jsonb_array_elements_text(
        COALESCE(v_existing.action -> 'proposal' -> 'keywordIds', '[]'::jsonb)) AS t(x)
    );
  v_count := cardinality(v_ids);
  SELECT COALESCE(jsonb_agg(phrase), '[]'::jsonb) INTO v_phrases
  FROM (SELECT k.phrase FROM seo.keyword k WHERE k.id = ANY(v_ids) ORDER BY k.phrase LIMIT 5) s;

  -- A worth the valuer gave wins over none; a later one replaces an earlier one.
  v_value := COALESCE(p_value_add, (v_existing.action -> 'proposal' ->> 'valueAdd')::numeric);

  v_proposal := jsonb_build_object(
    'proposal',       'offering',
    'name',           v_template.name,
    'offeringKind',   v_template.kind,
    'description',    v_template.description,
    'aliases',        COALESCE(v_template.aliases, '[]'::jsonb),
    'valueAdd',       v_value,
    'templateId',     v_template.id,
    'keywordIds',     to_jsonb(v_ids),
    'keywordCount',   v_count,
    'keywordPhrases', v_phrases
  );
  v_title := format('Offer the %s "%s" on %s', v_template.kind, v_template.name, v_site.label);
  v_body := CASE WHEN v_count > 0
    THEN format('The %s placed %s keyword%s on "%s", but this site does not offer it. Nothing was placed and it was not added. Approve to offer it here and place those keywords on it.',
                v_agent, v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END, v_template.name)
    ELSE format('The %s valued "%s", but this site does not offer it. Nothing was added. Approve to offer it here.',
                v_agent, v_template.name)
  END;

  IF v_existing.id IS NOT NULL THEN
    UPDATE platform.assists a
       SET title       = v_title,
           body        = v_body,
           reasoning   = COALESCE(p_reasoning, a.reasoning),
           action      = jsonb_set(jsonb_set(a.action, '{proposal}', v_proposal),
                                   '{payloadHash}', to_jsonb(md5(v_proposal::text))),
           occurrences = a.occurrences + 1,
           expires_at  = now() + interval '30 days',
           updated_at  = now()
     WHERE a.id = v_existing.id;
    RETURN QUERY SELECT v_existing.id, 'already_pending'::text, v_count;
    RETURN;
  END IF;

  INSERT INTO platform.assists
    (user_id, entity_type, entity_id, surface_name, source_kind, source_key,
     title, body, reasoning, confidence, action, dedupe_key, expires_at,
     priority, organization_id, evidence, first_seen_at)
  VALUES
    (v_site.created_by, 'web_site', p_site_id,
     'matrx-user/keyword-meaning-review', 'agent', 'seo.keyword_meaning.offering',
     v_title, v_body, p_reasoning, NULL,
     jsonb_build_object(
       'kind',        'apply_keyword_meaning',
       'siteId',      p_site_id,
       'siteLabel',   v_site.label,
       'proposal',    v_proposal,
       'provenance',  COALESCE(p_provenance, '{}'::jsonb)
                        || jsonb_build_object('agentName', v_agent,
                                              'proposedByAgent', true,
                                              'addressedTo', v_site.created_by),
       'payloadHash', md5(v_proposal::text)
     ),
     v_dedupe, now() + interval '30 days',
     0, v_site.organization_id, NULL, now())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, 'created'::text, v_count;
END
$function$;

REVOKE ALL ON FUNCTION seo.propose_site_offering_from_template(uuid, uuid, uuid[], numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seo.propose_site_offering_from_template(uuid, uuid, uuid[], numeric, text, text, jsonb) TO service_role;
COMMENT ON FUNCTION seo.propose_site_offering_from_template(uuid, uuid, uuid[], numeric, text, text, jsonb) IS
  'Service writer (brand-offerings cutover D2): an agent that wants an offering the site does not offer PROPOSES it here - one pending keyword_meaning:offering row per (site, template) in the one approval queue, keywords merged across runs, never re-opened once a person ruled. It never adopts an offering or writes web.site_offering.';

DO $do$
BEGIN
  IF has_function_privilege('authenticated', 'seo.propose_site_offering_from_template(uuid,uuid,uuid[],numeric,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'seo.fn_site_available_offering_for_template(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'offering_proposal_service_only: the proposal writer and availability read are service-role only';
  END IF;
END
$do$;
