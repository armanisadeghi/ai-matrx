-- INVERSE of migrations/campaign/tails7_the_seo_set_doors_archive_the_edge.sql.
--
-- It restores the five `seo` set-doors to the bodies that ran `DELETE FROM
-- platform.associations` — the shape in which moving a site to another topical map, changing
-- a page's intent, clearing a facet or re-running a page's coverage DESTROYED the edge, so
-- the same link put back afterwards was a different object with no id, no author and no
-- history in common with the one that had been there.
--
-- `platform.assoc_unset` is LEFT STANDING on purpose: it is tails5a's primitive, six other
-- doors call it, and an inverse undoes a BEHAVIOUR rather than taking the ground away. That
-- is the shape `pnpm check:inverses-leave-the-ground-standing` clause (d) exists to refuse.
-- ground-standing-ok: d
--
-- With this applied, `scripts/campaign-tests/tails7_seo_archive_green.sql` fails at its first
-- clause — the site's old map edge is GONE rather than withdrawn — which is what makes the
-- red-then-green a measurement rather than a claim.
--
-- chair-step: it replaces five live client doors in `seo`.
--
-- The `-- based-on:` lines below name the bodies the UP-FILE wrote, which are this file's
-- inputs: an inverse that ran against anything else would be undoing something it never saw.
-- based-on: seo.set_site_map(uuid, uuid) 3164af5ad068c5458cc294e9ddb19fed330483f4150cb3b6577ef4d8cce58461
-- based-on: seo.set_page_intents(uuid, jsonb, text) 325f99b8a1f0a6e4f5e286d495c0fc259fc90f1aef0f0dacf3f6b13cf32625f8
-- based-on: seo.set_page_map_facet(uuid, text, text, text) a487c6ceab0e8d5f79ba242905c252200a8668eb426624e286ce0343448a02bc
-- based-on: seo.set_map_topic_facet(uuid, text, text, text, text) a1a7a39d59d8966ad86a206315a33ab53bd27e518c9b877a2c9daf6945ab64e7
-- based-on: seo.set_page_map_topics(uuid, jsonb, text) 8f4592dfb20269979d755b3d1348e5d2eb5b2e339fa514dd7c0bbe05df6dc509
--

set lock_timeout = '4s';

-- ======================================================================================
-- restore seo.set_site_map(uuid, uuid)
-- ======================================================================================
CREATE OR REPLACE FUNCTION seo.set_site_map(p_site_id uuid, p_map_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_site_brand uuid; v_site_org uuid;
BEGIN
  IF p_site_id IS NULL THEN RAISE EXCEPTION 'set_site_map: p_site_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'set_site_map: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  PERFORM seo._tm_site(p_site_id, 'editor'::public.permission_level, 'set_site_map_denied');
  SELECT s.brand_id, s.organization_id INTO v_site_brand, v_site_org
    FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_site_brand IS DISTINCT FROM v_map.brand_id THEN
    RAISE EXCEPTION 'set_site_map: site brand % does not match map brand %', v_site_brand, v_map.brand_id USING ERRCODE='23514';
  END IF;
  DELETE FROM platform.associations WHERE source_type='web_site' AND source_id=p_site_id AND target_type='seo_topical_map' AND role='uses';
  INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role)
  VALUES ('web_site', p_site_id, 'seo_topical_map', p_map_id, v_site_org, 'uses');
  RETURN jsonb_build_object('ok', true, 'site_id', p_site_id, 'map_id', p_map_id);
END $function$;

-- ======================================================================================
-- restore seo.set_page_intents(uuid, jsonb, text)
-- ======================================================================================
CREATE OR REPLACE FUNCTION seo.set_page_intents(p_site_id uuid, p_items jsonb, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE it jsonb; v_map uuid; v_org uuid; v_pid uuid; v_tid uuid; v_slug text; v_disp text; v_state text;
        v_into_page uuid; v_into_node uuid; v_ref jsonb; v_payload jsonb; v_node record;
        v_results jsonb := '[]'::jsonb; v_ok int := 0; v_fail int := 0; v_kept int := 0;
        v_cur_src text; v_cur_state text; v_actor uuid;
BEGIN
  IF p_site_id IS NULL THEN RAISE EXCEPTION 'set_page_intents: p_site_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_items IS NULL THEN RAISE EXCEPTION 'set_page_intents: p_items is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'set_page_intents: p_source is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source NOT IN ('mapper','human','agent') THEN
    RAISE EXCEPTION 'p_source must be mapper|human|agent' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'p_items must be a JSON array' USING ERRCODE='22023'; END IF;
  PERFORM seo._tm_site(p_site_id, 'viewer'::public.permission_level, 'set_page_intents_denied');

  -- 🚨 A `human` INTENT WITH NOBODY BEHIND IT IS NOT WRITABLE (0797). `source='human'`
  -- is the top of the precedence ladder: it outranks every robot and it locks the page
  -- against them. A write claiming that rank with no authenticated person is an
  -- unattributable veto, and the census that found this showed every map edge on the
  -- platform carrying created_by NULL — including both `human` ones.
  v_actor := auth.uid();
  IF p_source = 'human' AND v_actor IS NULL THEN
    RAISE EXCEPTION 'set_page_intents: source=human requires an authenticated caller — an intent that outranks every agent must name the person who wrote it' USING ERRCODE='42501';
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  v_map := seo.site_map_id(p_site_id);
  IF v_map IS NULL THEN
    RAISE EXCEPTION 'site % uses no topical map (call seo.set_site_map first)', p_site_id USING ERRCODE='P0002';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      v_into_page := NULL; v_into_node := NULL; v_tid := NULL;

      -- 1. ACCESS, before anything exists. Editor on the site is editor on its
      --    pages; the check is per item so a partial batch is impossible to fake.
      IF NOT (public.is_platform_admin()
              OR iam.has_access('web_site', p_site_id, 'editor'::public.permission_level)) THEN
        RAISE EXCEPTION 'set_page_intents_denied' USING ERRCODE='42501';
      END IF;

      -- 2. The page, constrained to p_site_id.
      IF NULLIF(it->>'page_id', '') IS NOT NULL THEN
        SELECT p.id INTO v_pid FROM web.page p
         WHERE p.id = (it->>'page_id')::uuid AND p.site_id = p_site_id AND p.deleted_at IS NULL;
      ELSIF NULLIF(it->>'url', '') IS NOT NULL THEN
        SELECT p.id INTO v_pid FROM web.page p
         WHERE p.site_id = p_site_id AND p.url = it->>'url' AND p.deleted_at IS NULL LIMIT 1;
      ELSE
        RAISE EXCEPTION 'item must carry page_id or url' USING ERRCODE='22023';
      END IF;
      IF v_pid IS NULL THEN RAISE EXCEPTION 'set_page_intents_denied' USING ERRCODE='42501'; END IF;

      -- 3. The disposition and the state.
      v_disp := NULLIF(it->>'disposition', '');
      IF v_disp IS NULL THEN RAISE EXCEPTION 'item must carry a disposition' USING ERRCODE='22023'; END IF;
      IF v_disp NOT IN ('keep','move','merge','redirect','rewrite','delete') THEN
        RAISE EXCEPTION 'disposition must be keep|move|merge|redirect|rewrite|delete' USING ERRCODE='22023';
      END IF;
      v_state := COALESCE(NULLIF(it->>'state', ''), 'proposed');
      IF v_state NOT IN ('proposed','accepted','done') THEN
        RAISE EXCEPTION 'state must be proposed|accepted|done' USING ERRCODE='22023';
      END IF;

      -- 4. The destination. merge and redirect need exactly one; the others none.
      IF NULLIF(it->>'into_page_id','') IS NOT NULL THEN v_into_page := (it->>'into_page_id')::uuid; END IF;
      IF NULLIF(it->>'into_node_id','') IS NOT NULL THEN v_into_node := (it->>'into_node_id')::uuid; END IF;
      IF v_disp IN ('merge','redirect') THEN
        IF (v_into_page IS NULL) = (v_into_node IS NULL) THEN
          RAISE EXCEPTION '% needs exactly one of into_page_id or into_node_id', v_disp USING ERRCODE='22023';
        END IF;
      ELSIF v_into_page IS NOT NULL OR v_into_node IS NOT NULL THEN
        RAISE EXCEPTION '% takes no destination; into_page_id and into_node_id are for merge and redirect', v_disp USING ERRCODE='22023';
      END IF;

      IF v_into_page IS NOT NULL THEN
        v_ref := platform.resolve_entity_ref('web_page', v_into_page);
        IF v_ref IS NULL OR v_ref ? 'forbidden' OR v_ref ? 'missing' OR v_ref ? 'unregistered'
           OR NOT EXISTS (SELECT 1 FROM web.page p WHERE p.id = v_into_page AND p.deleted_at IS NULL
                            AND p.organization_id = v_org) THEN
          RAISE EXCEPTION 'set_page_intents_denied' USING ERRCODE='42501';
        END IF;
      END IF;
      IF v_into_node IS NOT NULL THEN
        v_ref := platform.resolve_entity_ref('plan_node', v_into_node);
        SELECT n.id, n.organization_id, n.topic_id INTO v_node
          FROM plan.node n WHERE n.id = v_into_node AND n.deleted_at IS NULL;
        IF v_ref IS NULL OR v_ref ? 'forbidden' OR v_ref ? 'missing' OR v_ref ? 'unregistered'
           OR v_node.id IS NULL OR v_node.organization_id <> v_org
           OR v_node.topic_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM seo.map_topic t WHERE t.id = v_node.topic_id AND t.map_id = v_map) THEN
          RAISE EXCEPTION 'set_page_intents_denied' USING ERRCODE='42501';
        END IF;
      END IF;

      -- 5. The topic. Optional for keep/rewrite/delete, which read it off the
      --    page's own coverage; required for the three that MOVE the page.
      v_slug := NULLIF(it->>'topic_slug', '');
      IF v_slug IS NOT NULL THEN
        v_tid := seo._tm_live_topic_id(v_map, v_slug);
        IF v_tid IS NULL THEN
          RAISE EXCEPTION 'topic % not found in this site''s map', v_slug USING ERRCODE='P0002';
        END IF;
      ELSIF v_disp IN ('move','merge','redirect') THEN
        RAISE EXCEPTION 'topic_slug is required for %: it names the topic the page is going to', v_disp USING ERRCODE='22023';
      ELSE
        SELECT a.target_id INTO v_tid
          FROM platform.associations a
        -- ROUND 22, RESTORED: only `rejected` used to be excluded, so a RETIRED topic
        -- was a legal destination — and every reader hides it, so the page went where
        -- nobody could see it. LIVE means proposed|active.
          JOIN seo.map_topic t ON t.id = a.target_id AND t.map_id = v_map AND t.deleted_at IS NULL
                              AND t.status IN ('proposed','active')
         WHERE a.source_type='web_page' AND a.source_id = v_pid AND a.target_type='seo_map_topic'
           AND a.role='covers' AND a.deleted_at IS NULL
         ORDER BY COALESCE((a.payload->>'confidence')::int, 0) DESC, a.created_at, a.id
         LIMIT 1;
        IF v_tid IS NULL THEN
          RAISE EXCEPTION 'topic_slug is required: this page covers no topic in this map, so there is nothing to derive it from' USING ERRCODE='22023';
        END IF;
      END IF;

      -- 5b. PRECEDENCE (round 23): an intent a higher source holds, or one a person has
      --     accepted or signed off, is never replaced by a lower source. Reported, never
      --     silent, and the held row is not touched at all.
      -- ROUND 23, RESTORED: reset PER ITEM. Without it a page with no intent of its
      -- own inherits the PREVIOUS item's holder inside the same call, and the
      -- precedence test below then 'keeps' a page nobody holds.
      v_cur_src := NULL; v_cur_state := NULL;
      SELECT a.payload->>'source', a.payload->>'state' INTO v_cur_src, v_cur_state
        FROM platform.associations a
       WHERE a.source_type='web_page' AND a.source_id = v_pid AND a.target_type='seo_map_topic'
         AND a.role='intent' AND a.deleted_at IS NULL
       ORDER BY a.created_at DESC, a.id DESC LIMIT 1;
      IF v_cur_src IS NOT NULL AND p_source <> 'human'
         AND (seo._tm_source_rank(v_cur_src) > seo._tm_source_rank(p_source)
              OR COALESCE(v_cur_state,'') IN ('accepted','done')) THEN
        v_results := v_results || jsonb_strip_nulls(jsonb_build_object(
          'ok', true, 'page_id', v_pid, 'url', it->>'url',
          'kept_existing', jsonb_build_object('source', v_cur_src, 'state', v_cur_state)));
        v_kept := v_kept + 1;
        CONTINUE;
      END IF;

      -- ONE intent per page — replace, never accumulate.
      DELETE FROM platform.associations
       WHERE source_type='web_page' AND source_id = v_pid AND target_type='seo_map_topic' AND role='intent';

      v_payload := jsonb_strip_nulls(jsonb_build_object(
        'disposition', v_disp,
        'into_page_id', v_into_page,
        'into_node_id', v_into_node,
        'note', NULLIF(left(COALESCE(it->>'note',''), 300), ''),
        'state', v_state,
        'source', p_source));
      INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, payload_kind, payload, created_by)
      VALUES ('web_page', v_pid, 'seo_map_topic', v_tid, v_org, 'intent', 'map_page_intent', v_payload, v_actor);

      v_results := v_results || jsonb_strip_nulls(jsonb_build_object('ok', true, 'page_id', v_pid, 'url', it->>'url'));
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_results := v_results || jsonb_strip_nulls(jsonb_build_object(
        'ok', false, 'page_id', it->>'page_id', 'url', it->>'url', 'error', SQLERRM));
      v_fail := v_fail + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', v_fail = 0, 'map_id', v_map, 'set', v_ok, 'kept', v_kept, 'failed', v_fail, 'results', v_results);
END $function$;

-- ======================================================================================
-- restore seo.set_page_map_facet(uuid, text, text, text)
-- ======================================================================================
CREATE OR REPLACE FUNCTION seo.set_page_map_facet(p_page_id uuid, p_facet_key text, p_value_slug text, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_org uuid; v_site uuid; v_brand uuid; v_fid uuid; v_vid uuid; v_applies text;
        v_held text; v_held_slug text; v_actor uuid;
BEGIN
  IF p_page_id IS NULL THEN RAISE EXCEPTION 'set_page_map_facet: p_page_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_facet_key IS NULL THEN RAISE EXCEPTION 'set_page_map_facet: p_facet_key is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'set_page_map_facet: p_source is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source NOT IN ('mapper','human','agent') THEN RAISE EXCEPTION 'p_source must be mapper|human|agent' USING ERRCODE='22023'; END IF;
  v_actor := (SELECT auth.uid());
  -- ROUND 27: `human` is the rank no robot may overrule, so it has to be a human.
  IF p_source = 'human' AND v_actor IS NULL THEN
    RAISE EXCEPTION 'set_page_map_facet: source ''human'' requires an authenticated caller — there is no auth.uid() on this connection, so no person is making this decision and nothing may claim the rank that outranks every robot'
      USING ERRCODE='42501';
  END IF;
  SELECT p.organization_id, p.site_id INTO v_org, v_site FROM web.page p WHERE p.id = p_page_id AND p.deleted_at IS NULL;
  IF NOT (public.is_platform_admin() OR (v_org IS NOT NULL AND iam.has_access('web_site', v_site, 'editor'))) THEN
    RAISE EXCEPTION 'page_facet_denied' USING ERRCODE='42501';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'page % not found', p_page_id USING ERRCODE='P0002'; END IF;
  SELECT s.brand_id INTO v_brand FROM web.site s WHERE s.id = v_site;
  SELECT DISTINCT facet_id, applies_to INTO v_fid, v_applies FROM seo._tm_visible_facet_values(v_org, v_brand) WHERE facet_key = p_facet_key LIMIT 1;
  IF v_fid IS NULL THEN
    SELECT id, applies_to INTO v_fid, v_applies FROM seo.map_facet WHERE key = p_facet_key AND deleted_at IS NULL
       AND (organization_id = v_org OR organization_id IN (SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable)) LIMIT 1;
  END IF;
  IF v_fid IS NULL THEN RAISE EXCEPTION 'facet % not found', p_facet_key USING ERRCODE='P0002'; END IF;
  IF v_applies = 'topic' THEN RAISE EXCEPTION 'facet % applies to topics only', p_facet_key USING ERRCODE='23514'; END IF;

  -- ROUND 27: THE HIGHEST-RANKED EDGE, NOT THE NEWEST. The DELETE below clears every
  -- edge of this facet, so ranking against one of them let a person's older value be
  -- destroyed under a robot's newer one while the call answered ok.
  v_held := NULL; v_held_slug := NULL;
  SELECT a.payload->>'source', v.slug INTO v_held, v_held_slug
    FROM platform.associations a
    JOIN seo.map_facet_value v ON v.id = a.target_id AND v.facet_id = v_fid
   WHERE a.source_type='web_page' AND a.source_id=p_page_id
     AND a.target_type='seo_map_facet_value' AND a.role='facet' AND a.deleted_at IS NULL
   ORDER BY seo._tm_source_rank(a.payload->>'source') DESC, a.created_at DESC, a.id DESC
   LIMIT 1;
  IF v_held IS NOT NULL AND p_source <> 'human'
     AND seo._tm_source_rank(v_held) > seo._tm_source_rank(p_source) THEN
    RETURN jsonb_build_object('ok', true, 'page_id', p_page_id, 'facet', p_facet_key,
                              'kept_existing', jsonb_build_object('source', v_held, 'value', v_held_slug));
  END IF;

  DELETE FROM platform.associations a USING seo.map_facet_value v
   WHERE a.source_type='web_page' AND a.source_id=p_page_id AND a.target_type='seo_map_facet_value' AND a.role='facet'
     AND v.id = a.target_id AND v.facet_id = v_fid;
  -- p_value_slug NULL MEANS clear this facet on the page.
  IF p_value_slug IS NULL THEN RETURN jsonb_build_object('ok', true, 'cleared', p_facet_key, 'source', p_source); END IF;
  SELECT value_id INTO v_vid FROM seo._tm_visible_facet_values(v_org, v_brand)
   WHERE facet_key = p_facet_key AND slug = p_value_slug ORDER BY (brand_id IS NOT NULL) DESC LIMIT 1;
  IF v_vid IS NULL THEN RAISE EXCEPTION 'facet value %/% not visible to this brand', p_facet_key, p_value_slug USING ERRCODE='P0002'; END IF;
  -- ROUND 28: the unique index associations_one_facet_value_per_row (0809) now makes one
  -- value per (row, facet) a FACT. Inside one call the DELETE above always precedes this
  -- INSERT, so the only way to collide is another writer landing on the same row and
  -- facet between the two — and a 23505 is a database word no client may ever be shown.
  -- The collision is answered exactly as a lost rank test is: the edge that won is read
  -- back and the caller is told whose value stands.
  BEGIN
  INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, payload_kind, payload, created_by)
  VALUES ('web_page', p_page_id, 'seo_map_facet_value', v_vid, v_org, 'facet', 'map_facet_assignment',
          jsonb_build_object('source', p_source, 'facet', p_facet_key), v_actor);
  EXCEPTION WHEN unique_violation THEN
    SELECT a.payload->>'source', v.slug INTO v_held, v_held_slug
      FROM platform.associations a
      JOIN seo.map_facet_value v ON v.id = a.target_id
     WHERE a.source_type='web_page' AND a.source_id=p_page_id
       AND a.target_type='seo_map_facet_value' AND a.role='facet' AND a.deleted_at IS NULL
       AND a.payload->>'facet' = p_facet_key
     ORDER BY seo._tm_source_rank(a.payload->>'source') DESC, a.created_at DESC, a.id DESC
     LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'page_id', p_page_id, 'facet', p_facet_key,
                              'kept_existing', jsonb_build_object('source', v_held, 'value', v_held_slug,
                                                                  'reason', 'another writer landed on this row and facet at the same moment'));
  END;
  RETURN jsonb_build_object('ok', true, 'page_id', p_page_id, 'facet', p_facet_key, 'value', p_value_slug, 'source', p_source);
END $function$;

-- ======================================================================================
-- restore seo.set_map_topic_facet(uuid, text, text, text, text)
-- ======================================================================================
CREATE OR REPLACE FUNCTION seo.set_map_topic_facet(p_map_id uuid, p_slug text, p_facet_key text, p_value_slug text, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_tid uuid; v_fid uuid; v_vid uuid; v_applies text; v_held text; v_held_slug text; v_actor uuid;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'set_map_topic_facet: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_slug IS NULL THEN RAISE EXCEPTION 'set_map_topic_facet: p_slug is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_facet_key IS NULL THEN RAISE EXCEPTION 'set_map_topic_facet: p_facet_key is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'set_map_topic_facet: p_source is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source NOT IN ('mapper','human','agent') THEN RAISE EXCEPTION 'p_source must be mapper|human|agent' USING ERRCODE='22023'; END IF;
  v_actor := (SELECT auth.uid());
  IF p_source = 'human' AND v_actor IS NULL THEN
    RAISE EXCEPTION 'set_map_topic_facet: source ''human'' requires an authenticated caller — there is no auth.uid() on this connection, so no person is making this decision and nothing may claim the rank that outranks every robot'
      USING ERRCODE='42501';
  END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  v_tid := seo._tm_topic_id(p_map_id, p_slug);
  IF v_tid IS NULL THEN RAISE EXCEPTION 'topic % not found in map %', p_slug, p_map_id USING ERRCODE='P0002'; END IF;
  SELECT DISTINCT facet_id, applies_to INTO v_fid, v_applies FROM seo._tm_visible_facet_values(v_map.organization_id, v_map.brand_id) WHERE facet_key = p_facet_key LIMIT 1;
  IF v_fid IS NULL THEN
    SELECT id, applies_to INTO v_fid, v_applies FROM seo.map_facet WHERE key = p_facet_key AND deleted_at IS NULL
       AND (organization_id = v_map.organization_id OR organization_id IN (SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable)) LIMIT 1;
  END IF;
  IF v_fid IS NULL THEN RAISE EXCEPTION 'facet % not found', p_facet_key USING ERRCODE='P0002'; END IF;
  IF v_applies = 'page' THEN RAISE EXCEPTION 'facet % applies to pages only', p_facet_key USING ERRCODE='23514'; END IF;

  v_held := NULL; v_held_slug := NULL;
  SELECT a.payload->>'source', v.slug INTO v_held, v_held_slug
    FROM platform.associations a
    JOIN seo.map_facet_value v ON v.id = a.target_id AND v.facet_id = v_fid
   WHERE a.source_type='seo_map_topic' AND a.source_id=v_tid
     AND a.target_type='seo_map_facet_value' AND a.role='facet' AND a.deleted_at IS NULL
   ORDER BY seo._tm_source_rank(a.payload->>'source') DESC, a.created_at DESC, a.id DESC
   LIMIT 1;
  IF v_held IS NOT NULL AND p_source <> 'human'
     AND seo._tm_source_rank(v_held) > seo._tm_source_rank(p_source) THEN
    RETURN jsonb_build_object('ok', true, 'topic', p_slug, 'facet', p_facet_key,
                              'kept_existing', jsonb_build_object('source', v_held, 'value', v_held_slug));
  END IF;

  DELETE FROM platform.associations a USING seo.map_facet_value v
   WHERE a.source_type='seo_map_topic' AND a.source_id=v_tid AND a.target_type='seo_map_facet_value' AND a.role='facet'
     AND v.id = a.target_id AND v.facet_id = v_fid;
  IF p_value_slug IS NULL THEN RETURN jsonb_build_object('ok', true, 'cleared', p_facet_key, 'source', p_source); END IF;
  SELECT value_id INTO v_vid FROM seo._tm_visible_facet_values(v_map.organization_id, v_map.brand_id)
   WHERE facet_key = p_facet_key AND slug = p_value_slug ORDER BY (brand_id IS NOT NULL) DESC LIMIT 1;
  IF v_vid IS NULL THEN RAISE EXCEPTION 'facet value %/% not visible to this map', p_facet_key, p_value_slug USING ERRCODE='P0002'; END IF;
  -- ROUND 28: the unique index associations_one_facet_value_per_row (0809) now makes one
  -- value per (row, facet) a FACT. Inside one call the DELETE above always precedes this
  -- INSERT, so the only way to collide is another writer landing on the same row and
  -- facet between the two — and a 23505 is a database word no client may ever be shown.
  -- The collision is answered exactly as a lost rank test is: the edge that won is read
  -- back and the caller is told whose value stands.
  BEGIN
  INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, payload_kind, payload, created_by)
  VALUES ('seo_map_topic', v_tid, 'seo_map_facet_value', v_vid, v_map.organization_id, 'facet', 'map_facet_assignment',
          jsonb_build_object('source', p_source, 'facet', p_facet_key), v_actor);
  EXCEPTION WHEN unique_violation THEN
    SELECT a.payload->>'source', v.slug INTO v_held, v_held_slug
      FROM platform.associations a
      JOIN seo.map_facet_value v ON v.id = a.target_id
     WHERE a.source_type='seo_map_topic' AND a.source_id=v_tid
       AND a.target_type='seo_map_facet_value' AND a.role='facet' AND a.deleted_at IS NULL
       AND a.payload->>'facet' = p_facet_key
     ORDER BY seo._tm_source_rank(a.payload->>'source') DESC, a.created_at DESC, a.id DESC
     LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'topic', p_slug, 'facet', p_facet_key,
                              'kept_existing', jsonb_build_object('source', v_held, 'value', v_held_slug,
                                                                  'reason', 'another writer landed on this row and facet at the same moment'));
  END;
  RETURN jsonb_build_object('ok', true, 'topic', p_slug, 'facet', p_facet_key, 'value', p_value_slug, 'source', p_source);
END $function$;

-- ======================================================================================
-- restore seo.set_page_map_topics(uuid, jsonb, text)
-- ======================================================================================
CREATE OR REPLACE FUNCTION seo.set_page_map_topics(p_page_id uuid, p_topics jsonb, p_source text DEFAULT 'mapper'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_org uuid; v_site uuid; v_map uuid; r jsonb; v_tid uuid; v_inserted int := 0; v_removed int := 0; v_missing text[] := '{}';
        v_wrote boolean; v_held text; v_kept jsonb := '[]'::jsonb; v_actor uuid;
BEGIN
  IF p_page_id IS NULL THEN RAISE EXCEPTION 'set_page_map_topics: p_page_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  -- ROUND 17 (A): a NULL here used to skip the array check below and reach the
  -- DELETE, wiping this source's coverage and answering ok. Clearing is `[]`.
  IF p_topics IS NULL THEN
    RAISE EXCEPTION 'set_page_map_topics: p_topics is required (got NULL); pass [] to clear this source''s coverage' USING ERRCODE='22023';
  END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'set_page_map_topics: p_source is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source NOT IN ('mapper','human','agent') THEN RAISE EXCEPTION 'p_source must be mapper|human|agent' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_topics) <> 'array' THEN RAISE EXCEPTION 'p_topics must be a JSON array' USING ERRCODE='22023'; END IF;

  -- 🚨 A `human` COVERAGE EDGE WITH NOBODY BEHIND IT IS NOT WRITABLE, exactly as for
  -- intents. `human` is the top of round 23's precedence ladder: it outranks every
  -- robot and locks the pair against them, so a write claiming that rank with no
  -- authenticated person is an unattributable veto.
  v_actor := auth.uid();
  IF p_source = 'human' AND v_actor IS NULL THEN
    RAISE EXCEPTION 'set_page_map_topics: source=human requires an authenticated caller — an edge that outranks every agent must name the person who wrote it' USING ERRCODE='42501';
  END IF;
  SELECT p.organization_id, p.site_id INTO v_org, v_site FROM web.page p WHERE p.id = p_page_id AND p.deleted_at IS NULL;
  IF NOT (public.is_platform_admin() OR (v_org IS NOT NULL AND iam.has_access('web_site', v_site, 'editor'))) THEN
    RAISE EXCEPTION 'set_page_map_topics_denied' USING ERRCODE='42501';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'page % not found', p_page_id USING ERRCODE='P0002'; END IF;
  v_map := seo.site_map_id(v_site);
  IF v_map IS NULL THEN RAISE EXCEPTION 'site % uses no topical map (call seo.set_site_map first)', v_site USING ERRCODE='P0002'; END IF;

  DELETE FROM platform.associations
   WHERE source_type='web_page' AND source_id=p_page_id AND target_type='seo_map_topic' AND role='covers'
     AND payload_kind='map_topic_coverage' AND payload->>'source' = p_source;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  FOR r IN SELECT * FROM jsonb_array_elements(p_topics) LOOP
    -- ROUND 22: the coverage target must be a LIVE topic. A retired or rejected
    -- slug now comes back in `unknown_slugs` exactly like an invented one —
    -- same shape, same bytes, nothing new to tell them apart.
    v_tid := seo._tm_live_topic_id(v_map, r->>'slug');
    IF v_tid IS NULL THEN v_missing := v_missing || (r->>'slug'); CONTINUE; END IF;
    v_wrote := NULL;
    -- ROUND 23. THE DELETE ABOVE IS PER-SOURCE; THIS UPSERT WAS NOT. There is one
    -- row per (page, topic, covers) — `source` lives in the payload, not in the
    -- key — so a mapper or agent write to a pair a HUMAN already held fell
    -- through to DO UPDATE and silently rewrote the person's confidence, reason
    -- and source. The per-source delete looked like a lock and was not one.
    -- human > agent > mapper, and an unsourced legacy row ranks below all three.
    INSERT INTO platform.associations AS a (source_type, source_id, target_type, target_id, organization_id, role, payload_kind, payload, created_by)
    VALUES ('web_page', p_page_id, 'seo_map_topic', v_tid, v_org, 'covers', 'map_topic_coverage',
            jsonb_build_object('confidence', LEAST(100, GREATEST(0, COALESCE((r->>'confidence')::int, 50))),
                               'source', p_source,
                               'reason', left(COALESCE(r->>'reason',''), 300)), v_actor)
    ON CONFLICT (source_type, source_id, target_type, target_id, role) DO UPDATE
      -- 0806: the WINNING writer becomes the row's author. platform.associations has
      -- no updated_by, and this upsert replaces the payload AND the source wholesale,
      -- so leaving created_by on whoever inserted first means a person who overrules
      -- the mapper still names nobody — which is the common case, because the mapper
      -- writes first. The row's content and its author move together or the column
      -- is decorative.
      SET payload_kind = EXCLUDED.payload_kind, payload = EXCLUDED.payload,
          created_by = EXCLUDED.created_by
      WHERE seo._tm_source_rank(a.payload->>'source') <= seo._tm_source_rank(EXCLUDED.payload->>'source')
    RETURNING true INTO v_wrote;
    IF v_wrote IS TRUE THEN
      v_inserted := v_inserted + 1;
    ELSE
      -- NOT AN ERROR AND NOT SILENCE: the caller is told whose row it left alone.
      SELECT x.payload->>'source' INTO v_held FROM platform.associations x
       WHERE x.source_type='web_page' AND x.source_id=p_page_id AND x.target_type='seo_map_topic'
         AND x.target_id=v_tid AND x.role='covers';
      v_kept := v_kept || jsonb_build_object('slug', r->>'slug', 'kept_existing', v_held);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'page_id', p_page_id, 'map_id', v_map, 'covers', v_inserted, 'replaced', v_removed,
                            'unknown_slugs', to_jsonb(v_missing), 'kept_existing', v_kept);
END $function$;

