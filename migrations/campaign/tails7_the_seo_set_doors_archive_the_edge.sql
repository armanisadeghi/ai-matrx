-- chair-step: it replaces five live client doors in `seo`. Additive in substance — five
--   CREATE OR REPLACE, no CREATE, no DROP, no REVOKE, no schema change, no new grant — and
--   every body it overwrites is named by a `-- based-on:` line below. It cannot be gated on
--   `custom/system_enabled`: `platform.associations` is a primitive under every feature and
--   these doors have nothing to do with the record store's switch.
-- based-on: seo.set_site_map(uuid, uuid) 93ad9fce30dd83d66571f12079da85b4dcc785bd1b68508b9744213a69e9c1b0
-- based-on: seo.set_page_intents(uuid, jsonb, text) ba95575e0588348939292f4caf5768a7b1c988a9c5c2b9f27fefc9fcb401dfda
-- based-on: seo.set_page_map_facet(uuid, text, text, text) fe33ab282078de04249db51f9ee8529f4bc182a412acd65999bba070455cbe48
-- based-on: seo.set_map_topic_facet(uuid, text, text, text, text) d96bd5263b37d3eba7adfe3a32464b4f3a6a2a0572d6a1dc59309fe3f4d4a9a0
-- based-on: seo.set_page_map_topics(uuid, jsonb, text) 1afb8468aa724e8e914e536a2be9c7acefcff73690ec7590f563c82db53301c3
--
-- TAILS-7 — THE SEO SET-DOORS ARCHIVE THE EDGE TOO. FIVE OF THE EIGHT, AND THE THREE THAT
-- MUST NOT, WITH THE REASON EACH.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- WHERE THIS COMES FROM
-- ════════════════════════════════════════════════════════════════════════════════════════
-- `migrations/campaign/tails5a_a_removal_archives_the_edge.sql` converted the six REMOVAL
-- doors onto `platform.assoc_unset` and named, in its own header, the remainder of the class
-- it had not read: eight `seo.*` set-doors that still ran `DELETE FROM platform.associations`.
-- This file is that remainder, read door by door. It is the whole population; after it, the
-- only functions on this database that destroy an association are the mirrors, the syncs and
-- the collectors, every one of them named and reasoned in tails5a.
--
-- The owner law is: ARCHIVE, NEVER DELETE. The judgement it needs is not "is this a DELETE"
-- but "is this edge being UNMADE, or has its meaning just been MOVED somewhere else". The
-- five below unmake; the three at the bottom move.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE FIVE THAT ARCHIVE NOW
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Each of these takes a link OFF a row on purpose, and the row it takes it off survives. A
-- person moves a site to another topical map, changes a page's intent, clears a facet, or a
-- mapper re-runs its coverage. Every one of those is a withdrawal, and every one of them was
-- destroying the edge: its id, its `created_by`, the day it was first made and its whole
-- history line, so putting the same link back minted a stranger that had never been anywhere.
--
--   seo.set_site_map          web_site --uses--> seo_topical_map            (1 edge per site)
--   seo.set_page_intents      web_page --intent--> seo_map_topic            (1 edge per page)
--   seo.set_page_map_facet    web_page --facet--> seo_map_facet_value       (1 per row+facet)
--   seo.set_map_topic_facet   seo_map_topic --facet--> seo_map_facet_value  (1 per row+facet)
--   seo.set_page_map_topics   web_page --covers--> seo_map_topic            (per-source clear)
--
-- Every one of them now calls `platform.assoc_unset` — THE one writer that unmakes an edge —
-- and none of their authority decisions changed by a character. The withdrawal is stamped
-- with the row the link was taken off (`deleted_via_type`/`deleted_via_id`), the way the six
-- doors tails5a converted stamp theirs.
--
-- WHY A LOOP AND NOT A SET-SHAPED SIBLING. `assoc_unset` names one edge, which is what makes
-- it the one place that knows what unmaking means. Four of these five clear AT MOST ONE edge
-- per call (a site has one map; a page has one intent; `associations_one_facet_value_per_row`
-- makes one value per row-and-facet a fact), and the fifth clears one page's coverage from one
-- source — a handful of rows. A second, predicate-shaped primitive would buy nothing here and
-- would be a second definition of the same verb.
--
-- 🚨 THE PART THAT WOULD HAVE BEEN EASY TO GET WRONG, AND IT IS NOT THE DELETE.
-- `platform.revive_tombstoned_association` is a BEFORE INSERT trigger: when the arriving key
-- already exists as a tombstone it revives that row IN PLACE and RETURNS NULL, so the INSERT
-- never happens. Two consequences, and both bite exactly the doors in this file, because each
-- of them clears and then re-inserts the SAME key in the SAME call:
--
--   (a) `INSERT … RETURNING` yields ZERO ROWS on the revive path although the write landed.
--       `seo.set_page_map_topics` read its answer that way (`RETURNING true INTO v_wrote`),
--       so a mechanical DELETE→unset swap would have made it report every topic it had just
--       re-stated as one it had LEFT ALONE for somebody else's row — a door lying about its
--       own effect, silently, on 5,575 live coverage edges. That arm is rewritten to read the
--       row back instead. The atomic rank guard on the conflict is untouched, so concurrency
--       is still decided by the database and not by a racy pre-read.
--   (b) the revive deliberately does NOT carry `created_by` (a revive is not a creation). On
--       these four doors the payload NAMES the source that wrote it, and 0806 already ruled
--       for coverage that the winning writer becomes the row's author — so a row whose payload
--       says `human` over a `created_by` naming last month's mapper disagrees with itself.
--       Each converted door stamps the author after its write, on both paths.
--
-- And one fact that makes the facet doors safe: `associations_one_facet_value_per_row` is
-- PARTIAL on `deleted_at IS NULL`, so a withdrawn value never blocks the new one.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE THREE THAT DO NOT, AND WHY — PER DOOR
-- ════════════════════════════════════════════════════════════════════════════════════════
-- `seo.merge_map_topics`, `seo._tm_reject_topics`, `seo._tm_remove_topics`. These are not
-- removals at all. Each is a MOVE: it re-points every edge of the topics being merged away
-- onto the surviving topic with `UPDATE platform.associations SET source_id = v_target` /
-- `SET target_id = v_target`, guarded by `NOT EXISTS (…)`, and only THEN destroys what is
-- left — which is, by construction, exactly the edges whose equivalent the survivor already
-- holds. The meaning of those rows was carried a statement earlier; nothing was unmade, so
-- there is nothing to put back.
--
-- Tombstoning them would be worse than useless and in one place actively wrong:
--   · The `NOT EXISTS` guards on the re-pointing UPDATEs count TOMBSTONES as well as live
--     rows (they carry no `deleted_at` filter, deliberately — `associations_unique` is a FULL
--     unique index with NULLS NOT DISTINCT, so a tombstone on the target key really would
--     collide). A withdrawal left on a from-topic key therefore changes which rows a LATER
--     statement in the same loop is allowed to move, and `merge_map_topics` re-points on
--     source AND on target in one pass.
--   · The rows it would archive are duplicates of rows that still exist. An archive whose
--     entries are copies of live rows is not history; it is noise that the revive trigger can
--     bring back stale — the same hazard tails5a named for the mirrors.
--   · The topic itself is retired or soft-deleted by these very doors. THAT is where the
--     archive of a merge lives, and it is intact.
--
-- So the population is closed and stated: five converted here, three reasoned and left, the
-- mirrors/syncs and the collectors reasoned and left by tails5a.
--
-- Inverse: migrations/inverse/tails7_the_seo_set_doors_archive_the_edge_down.sql
-- Red twin: scripts/campaign-tests/tails7_seo_archive_red.sql
-- Green suite: scripts/campaign-tests/tails7_seo_archive_green.sql

set lock_timeout = '4s';

-- ======================================================================================
-- 1. seo.set_site_map — which topical map a site uses
-- ======================================================================================
CREATE OR REPLACE FUNCTION seo.set_site_map(p_site_id uuid, p_map_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_site_brand uuid; v_site_org uuid; v_old uuid;
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
  -- TAILS-7: ARCHIVED, NOT DESTROYED. Which map a site uses is a person's own
  -- deliberate choice, and moving a site from one map to another and back used to
  -- destroy the first edge outright: a new row, a new id, no created_by, no day it
  -- was first chosen. It is withdrawn now, so putting the site back on its old map
  -- revives THE SAME edge (platform.revive_tombstoned_association) with its history.
  -- The loop is at most one row: there is one `uses` edge per site.
  FOR v_old IN
    SELECT a.target_id FROM platform.associations a
     WHERE a.source_type='web_site' AND a.source_id=p_site_id
       AND a.target_type='seo_topical_map' AND a.role='uses' AND a.deleted_at IS NULL
  LOOP
    PERFORM platform.assoc_unset('web_site', p_site_id, 'seo_topical_map', v_old, 'uses',
                                 'web_site', p_site_id);
  END LOOP;
  INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role)
  VALUES ('web_site', p_site_id, 'seo_topical_map', p_map_id, v_site_org, 'uses');
  RETURN jsonb_build_object('ok', true, 'site_id', p_site_id, 'map_id', p_map_id);
END $function$;

-- ======================================================================================
-- 2. seo.set_page_intents — what a page is FOR
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
        v_cur_src text; v_cur_state text; v_actor uuid; v_old uuid;
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
      -- TAILS-7: ARCHIVED, NOT DESTROYED. One intent per page — replaced, and the
      -- one it replaces is WITHDRAWN rather than destroyed. Moving a page's intent
      -- to another topic and back now keeps one edge with one history instead of
      -- minting a stranger each time. At most one row.
      FOR v_old IN
        SELECT a.target_id FROM platform.associations a
         WHERE a.source_type='web_page' AND a.source_id = v_pid
           AND a.target_type='seo_map_topic' AND a.role='intent' AND a.deleted_at IS NULL
      LOOP
        PERFORM platform.assoc_unset('web_page', v_pid, 'seo_map_topic', v_old, 'intent',
                                     'web_page', v_pid);
      END LOOP;

      v_payload := jsonb_strip_nulls(jsonb_build_object(
        'disposition', v_disp,
        'into_page_id', v_into_page,
        'into_node_id', v_into_node,
        'note', NULLIF(left(COALESCE(it->>'note',''), 300), ''),
        'state', v_state,
        'source', p_source));
      INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, payload_kind, payload, created_by)
      VALUES ('web_page', v_pid, 'seo_map_topic', v_tid, v_org, 'intent', 'map_page_intent', v_payload, v_actor);
      -- 🚨 THE REVIVE PATH DOES NOT CARRY `created_by`, DELIBERATELY: a revive is not
      -- a creation (platform.revive_tombstoned_association says so in its own body).
      -- On THIS door the author moves with the content — the payload names the source
      -- that wrote it, so an intent whose payload says `human` and whose created_by
      -- still names last month's mapper is a row disagreeing with itself. Stamped for
      -- both paths, and it is a no-op on the ordinary insert.
      UPDATE platform.associations
         SET created_by = v_actor
       WHERE source_type='web_page' AND source_id = v_pid AND target_type='seo_map_topic'
         AND target_id = v_tid AND role='intent' AND deleted_at IS NULL
         AND created_by IS DISTINCT FROM v_actor;

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
-- 3. seo.set_page_map_facet — a facet value on a page
-- ======================================================================================
CREATE OR REPLACE FUNCTION seo.set_page_map_facet(p_page_id uuid, p_facet_key text, p_value_slug text, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_org uuid; v_site uuid; v_brand uuid; v_fid uuid; v_vid uuid; v_applies text; v_old uuid;
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

  -- TAILS-7: ARCHIVED, NOT DESTROYED. `p_value_slug IS NULL` on this door literally
  -- MEANS "a person clears this facet" — the plainest case of a removal there is, and
  -- it used to destroy the edge: its id, who set it, and the day it was first set. It
  -- is withdrawn now, so setting the facet back to the value it held revives THE SAME
  -- edge instead of minting a stranger. `associations_one_facet_value_per_row` is
  -- partial on `deleted_at IS NULL`, so a tombstoned value never blocks a new one.
  FOR v_old IN
    SELECT a.target_id FROM platform.associations a
      JOIN seo.map_facet_value v ON v.id = a.target_id
     WHERE a.source_type='web_page' AND a.source_id=p_page_id
       AND a.target_type='seo_map_facet_value' AND a.role='facet'
       AND a.deleted_at IS NULL AND v.facet_id = v_fid
  LOOP
    PERFORM platform.assoc_unset('web_page', p_page_id, 'seo_map_facet_value', v_old, 'facet',
                                 'web_page', p_page_id);
  END LOOP;
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
  -- 🚨 THE REVIVE PATH DOES NOT CARRY `created_by`, deliberately (a revive is not a
  -- creation). Here the payload names the source that set the value, so leaving the
  -- author on whoever set it first makes the row disagree with itself. Stamped for
  -- both paths; a no-op on the ordinary insert. It is INSIDE the BEGIN block so a
  -- concurrent writer's unique_violation is still answered by the handler below.
  UPDATE platform.associations
     SET created_by = v_actor
   WHERE source_type='web_page' AND source_id=p_page_id AND target_type='seo_map_facet_value'
     AND target_id = v_vid AND role='facet' AND deleted_at IS NULL
     AND created_by IS DISTINCT FROM v_actor;
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
-- 4. seo.set_map_topic_facet — a facet value on a topic
-- ======================================================================================
CREATE OR REPLACE FUNCTION seo.set_map_topic_facet(p_map_id uuid, p_slug text, p_facet_key text, p_value_slug text, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_tid uuid; v_fid uuid; v_vid uuid; v_applies text; v_held text; v_held_slug text; v_actor uuid; v_old uuid;
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

  -- TAILS-7: ARCHIVED, NOT DESTROYED. `p_value_slug IS NULL` on this door literally
  -- MEANS "a person clears this facet" — the plainest case of a removal there is, and
  -- it used to destroy the edge: its id, who set it, and the day it was first set. It
  -- is withdrawn now, so setting the facet back to the value it held revives THE SAME
  -- edge instead of minting a stranger. `associations_one_facet_value_per_row` is
  -- partial on `deleted_at IS NULL`, so a tombstoned value never blocks a new one.
  FOR v_old IN
    SELECT a.target_id FROM platform.associations a
      JOIN seo.map_facet_value v ON v.id = a.target_id
     WHERE a.source_type='seo_map_topic' AND a.source_id=v_tid
       AND a.target_type='seo_map_facet_value' AND a.role='facet'
       AND a.deleted_at IS NULL AND v.facet_id = v_fid
  LOOP
    PERFORM platform.assoc_unset('seo_map_topic', v_tid, 'seo_map_facet_value', v_old, 'facet',
                                 'seo_map_topic', v_tid);
  END LOOP;
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
  -- 🚨 THE REVIVE PATH DOES NOT CARRY `created_by`, deliberately (a revive is not a
  -- creation). Here the payload names the source that set the value, so leaving the
  -- author on whoever set it first makes the row disagree with itself. Stamped for
  -- both paths; a no-op on the ordinary insert. It is INSIDE the BEGIN block so a
  -- concurrent writer's unique_violation is still answered by the handler below.
  UPDATE platform.associations
     SET created_by = v_actor
   WHERE source_type='seo_map_topic' AND source_id=v_tid AND target_type='seo_map_facet_value'
     AND target_id = v_vid AND role='facet' AND deleted_at IS NULL
     AND created_by IS DISTINCT FROM v_actor;
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
-- 5. seo.set_page_map_topics — one page's coverage, per source
-- ======================================================================================
CREATE OR REPLACE FUNCTION seo.set_page_map_topics(p_page_id uuid, p_topics jsonb, p_source text DEFAULT 'mapper'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_org uuid; v_site uuid; v_map uuid; r jsonb; v_tid uuid; v_inserted int := 0; v_removed int := 0; v_missing text[] := '{}';
        v_held text; v_kept jsonb := '[]'::jsonb; v_actor uuid; v_old uuid;
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

  -- TAILS-7: ARCHIVED, NOT DESTROYED. This clear is per-source and wholesale: it is how
  -- a re-run of the mapper replaces its own coverage. Destroying those rows meant a topic
  -- dropped from one run and put back by the next came back as a brand-new edge with no
  -- created_by, no first-covered date and no history — and a person's `human` row, cleared
  -- and re-stated, lost who stated it. Withdrawn now, so the next run REVIVES the same
  -- edges in place and the ones it drops stay on the record as withdrawn.
  FOR v_old IN
    SELECT a.target_id FROM platform.associations a
     WHERE a.source_type='web_page' AND a.source_id=p_page_id AND a.target_type='seo_map_topic'
       AND a.role='covers' AND a.payload_kind='map_topic_coverage'
       AND a.payload->>'source' = p_source AND a.deleted_at IS NULL
  LOOP
    v_removed := v_removed + platform.assoc_unset('web_page', p_page_id, 'seo_map_topic', v_old,
                                                  'covers', 'web_page', p_page_id);
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(p_topics) LOOP
    -- ROUND 22: the coverage target must be a LIVE topic. A retired or rejected
    -- slug now comes back in `unknown_slugs` exactly like an invented one —
    -- same shape, same bytes, nothing new to tell them apart.
    v_tid := seo._tm_live_topic_id(v_map, r->>'slug');
    IF v_tid IS NULL THEN v_missing := v_missing || (r->>'slug'); CONTINUE; END IF;

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
      WHERE seo._tm_source_rank(a.payload->>'source') <= seo._tm_source_rank(EXCLUDED.payload->>'source');

    -- 🚨 TAILS-7: THE WRITE IS JUDGED BY READING THE ROW BACK, NOT BY `RETURNING`.
    -- This arm used to end `RETURNING true INTO v_wrote`, and that is exactly what a
    -- tombstone breaks. `platform.revive_tombstoned_association` is a BEFORE INSERT
    -- trigger that revives the tombstone IN PLACE and returns NULL, so the INSERT is
    -- skipped and `INSERT … RETURNING` yields ZERO ROWS although the write landed. Left
    -- as it was, every topic this door had just withdrawn and immediately re-stated
    -- would have been counted in `kept_existing` and reported to the caller as a write
    -- somebody else's row beat — a door lying about its own effect. The rank guard on
    -- the conflict above is UNCHANGED, so two concurrent writers are still decided
    -- atomically by the database; what changed is only how this body learns the answer.
    SELECT x.payload->>'source' INTO v_held FROM platform.associations x
     WHERE x.source_type='web_page' AND x.source_id=p_page_id AND x.target_type='seo_map_topic'
       AND x.target_id=v_tid AND x.role='covers' AND x.deleted_at IS NULL;
    IF v_held IS NOT DISTINCT FROM p_source THEN
      v_inserted := v_inserted + 1;
      -- 0806 says the WINNING writer becomes the row's author, and the revive path does
      -- not carry `created_by` (a revive is not a creation). Stamped for both paths so
      -- content and author still move together; a no-op on the ordinary insert.
      UPDATE platform.associations
         SET created_by = v_actor
       WHERE source_type='web_page' AND source_id=p_page_id AND target_type='seo_map_topic'
         AND target_id=v_tid AND role='covers' AND deleted_at IS NULL
         AND created_by IS DISTINCT FROM v_actor;
    ELSE
      -- NOT AN ERROR AND NOT SILENCE: the caller is told whose row it left alone.
      v_kept := v_kept || jsonb_build_object('slug', r->>'slug', 'kept_existing', v_held);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'page_id', p_page_id, 'map_id', v_map, 'covers', v_inserted, 'replaced', v_removed,
                            'unknown_slugs', to_jsonb(v_missing), 'kept_existing', v_kept);
END $function$;

