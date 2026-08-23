-- ============================================================================
-- Keyword Intelligence Convergence — C9: agent SUGGESTION → human APPROVAL
--
-- P12 (VISION.md § Determinism, Arman 2026-08-22): "an agent can make all the
-- suggestions they want, but when the system runs again the next day, the new
-- agent is not going to see the suggestions that have not been approved."
--
-- THE RULE this migration exists to make structurally true: **nothing an agent
-- proposes is visible to any agent run until a human approves it.** A proposal
-- is a `platform.assists` row and NOTHING ELSE — it never touches
-- `seo.dimension_value_matcher`, `seo.site_value_worth`, `seo.keyword_facet`,
-- or `web.site.settings.kw_guidelines`. Approval REPLAYS the proposal through
-- the ordinary human write paths; there is no second writer anywhere.
--
-- Three objects:
--   1. seo.dimension_matcher_upsert  — THE matcher write path (human + approval)
--   2. seo.site_value_worth_upsert   — THE worth write path   (human + approval)
--   3. seo.keyword_meaning_suggest   — THE suggestion door (writes ONE assist row)
--
-- (1) and (2) did not exist: C1 created the tables, and the only writers were
-- the C1 migration itself. They are created HERE as the canonical human path so
-- the Dimensions editor (C4) and this approval flow share one door — approval
-- through a private writer would be exactly the parallel-writer defect.
--
-- Idempotent. Ledgered in public._schema_migrations by the standard applier.
-- SoR: /systems/marketing/seo/seo-keywords/value-system.md § Suggestions
-- Project: /projects/keyword-intelligence-convergence/PLAN.md (C9)
-- ============================================================================

-- ── 1. THE matcher write path ───────────────────────────────────────────────
-- One matcher row per (site, value, kind, target). Re-proposing the same
-- matcher is an update, never a duplicate: the engine would otherwise stamp
-- the same keyword twice from two identical rules and the receipt would lie.
CREATE OR REPLACE FUNCTION seo.dimension_matcher_upsert(
  p_site_id           uuid,
  p_value_id          uuid,
  p_kind              text,
  p_pattern           text    DEFAULT NULL,
  p_place_id          uuid    DEFAULT NULL,
  p_fact_value_id     uuid    DEFAULT NULL,
  p_condition_rule_id uuid    DEFAULT NULL,
  p_origin            text    DEFAULT 'human',
  p_notes             text    DEFAULT NULL,
  p_enabled           boolean DEFAULT true
)
RETURNS TABLE(
  id uuid, site_id uuid, value_id uuid, kind text, pattern text,
  place_id uuid, fact_value_id uuid, condition_rule_id uuid,
  enabled boolean, origin text, notes text, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'web', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_org  uuid;
  v_dim  record;
  v_text text := NULLIF(btrim(COALESCE(p_pattern, '')), '');
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_matcher_unauthenticated';
  END IF;
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  SELECT s.organization_id INTO v_org FROM web.site s
   WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;

  IF p_origin NOT IN ('human','pack','agent','migration') THEN
    RAISE EXCEPTION 'seo_matcher_bad_origin: %', p_origin;
  END IF;

  -- The value must be a real VALUE of a seo_facet dimension, and a site
  -- dimension's values only accept matchers from their own site.
  SELECT v.id AS value_id,
         d.id AS dimension_id,
         d.slug AS dimension_slug,
         COALESCE(d.metadata->>'scope','platform') AS scope,
         (d.metadata->>'site_id')::uuid AS dim_site_id
    INTO v_dim
  FROM platform.categories v
  JOIN platform.categories d ON d.id = v.parent_id AND d.deleted_at IS NULL
  WHERE v.id = p_value_id AND v.deleted_at IS NULL AND v.dimension = 'seo_facet';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_matcher_unknown_value: % is not a value of any keyword dimension', p_value_id;
  END IF;
  IF v_dim.scope = 'site' AND v_dim.dim_site_id IS DISTINCT FROM p_site_id THEN
    RAISE EXCEPTION 'seo_matcher_forbidden: "%" belongs to another site', v_dim.dimension_slug;
  END IF;

  -- Find the live twin (the dvm_target_check constraint guarantees exactly one
  -- target column is populated, so this comparison is total).
  SELECT m.id INTO v_id
    FROM seo.dimension_value_matcher m
   WHERE m.deleted_at IS NULL
     AND m.site_id = p_site_id
     AND m.value_id = p_value_id
     AND m.kind = p_kind
     AND m.pattern IS NOT DISTINCT FROM v_text
     AND m.place_id IS NOT DISTINCT FROM p_place_id
     AND m.fact_value_id IS NOT DISTINCT FROM p_fact_value_id
     AND m.condition_rule_id IS NOT DISTINCT FROM p_condition_rule_id
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO seo.dimension_value_matcher
      (site_id, value_id, kind, pattern, place_id, fact_value_id, condition_rule_id,
       enabled, origin, notes, organization_id, created_by, updated_by)
    VALUES
      (p_site_id, p_value_id, p_kind, v_text, p_place_id, p_fact_value_id, p_condition_rule_id,
       COALESCE(p_enabled, true), p_origin, NULLIF(btrim(COALESCE(p_notes,'')),''),
       v_org, v_uid, v_uid)
    RETURNING dimension_value_matcher.id INTO v_id;
  ELSE
    UPDATE seo.dimension_value_matcher m
       SET enabled    = COALESCE(p_enabled, m.enabled),
           notes      = COALESCE(NULLIF(btrim(COALESCE(p_notes,'')),''), m.notes),
           origin     = p_origin,
           updated_by = v_uid,
           updated_at = now()
     WHERE m.id = v_id;
  END IF;

  RETURN QUERY
  SELECT m.id, m.site_id, m.value_id, m.kind, m.pattern, m.place_id,
         m.fact_value_id, m.condition_rule_id, m.enabled, m.origin, m.notes, m.created_at
    FROM seo.dimension_value_matcher m WHERE m.id = v_id;
END;
$function$;

COMMENT ON FUNCTION seo.dimension_matcher_upsert(uuid,uuid,text,text,uuid,uuid,uuid,text,text,boolean) IS
  'THE write path for seo.dimension_value_matcher (P19). Idempotent on (site, value, kind, target) so re-adding a matcher never double-stamps. Used by the Dimensions editor AND by keyword-meaning suggestion approval — approval never opens a second writer.';

REVOKE ALL ON FUNCTION seo.dimension_matcher_upsert(uuid,uuid,text,text,uuid,uuid,uuid,text,text,boolean) FROM public;
GRANT EXECUTE ON FUNCTION seo.dimension_matcher_upsert(uuid,uuid,text,text,uuid,uuid,uuid,text,text,boolean) TO authenticated, service_role;

-- Retiring a matcher is the same door, in reverse.
CREATE OR REPLACE FUNCTION seo.dimension_matcher_delete(p_matcher_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'seo', 'web', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_site uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_matcher_unauthenticated';
  END IF;
  SELECT m.site_id INTO v_site FROM seo.dimension_value_matcher m
   WHERE m.id = p_matcher_id AND m.deleted_at IS NULL;
  IF v_site IS NULL THEN
    RETURN false;
  END IF;
  PERFORM seo.gsc_assert_site_editor(v_site);
  UPDATE seo.dimension_value_matcher m
     SET deleted_at = now(), updated_by = v_uid, updated_at = now()
   WHERE m.id = p_matcher_id AND m.deleted_at IS NULL;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION seo.dimension_matcher_delete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION seo.dimension_matcher_delete(uuid) TO authenticated, service_role;

-- ── 2. THE worth write path ─────────────────────────────────────────────────
-- One worth row per (site, value) — enforced by svw_site_value_uniq. `effect
-- = 'clear'` removes the row entirely: most values carry NO worth at all (P17,
-- "affects nothing, identifies" is the default), so "no row" must be reachable.
CREATE OR REPLACE FUNCTION seo.site_value_worth_upsert(
  p_site_id  uuid,
  p_value_id uuid,
  p_effect   text,
  p_amount   numeric DEFAULT NULL,
  p_origin   text    DEFAULT 'human',
  p_notes    text    DEFAULT NULL
)
RETURNS TABLE(
  id uuid, site_id uuid, value_id uuid, effect text, amount numeric,
  origin text, notes text, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'web', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_org    uuid;
  v_dim    record;
  v_id     uuid;
  v_amount numeric;
  v_notes  text := NULLIF(btrim(COALESCE(p_notes,'')),'');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_worth_unauthenticated';
  END IF;
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  SELECT s.organization_id INTO v_org FROM web.site s
   WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;

  IF p_effect NOT IN ('add','scale','never','clear') THEN
    RAISE EXCEPTION 'seo_worth_bad_effect: % (add | scale | never | clear)', p_effect;
  END IF;
  IF p_origin NOT IN ('human','pack','agent','migration') THEN
    RAISE EXCEPTION 'seo_worth_bad_origin: %', p_origin;
  END IF;

  SELECT v.id AS id,
         d.slug AS dimension_slug,
         COALESCE(d.metadata->>'scope','platform') AS scope,
         (d.metadata->>'site_id')::uuid AS dim_site_id
    INTO v_dim
  FROM platform.categories v
  JOIN platform.categories d ON d.id = v.parent_id AND d.deleted_at IS NULL
  WHERE v.id = p_value_id AND v.deleted_at IS NULL AND v.dimension = 'seo_facet';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_worth_unknown_value: % is not a value of any keyword dimension', p_value_id;
  END IF;
  IF v_dim.scope = 'site' AND v_dim.dim_site_id IS DISTINCT FROM p_site_id THEN
    RAISE EXCEPTION 'seo_worth_forbidden: "%" belongs to another site', v_dim.dimension_slug;
  END IF;

  IF p_effect = 'clear' THEN
    UPDATE seo.site_value_worth w
       SET deleted_at = now(), updated_by = v_uid, updated_at = now()
     WHERE w.site_id = p_site_id AND w.value_id = p_value_id AND w.deleted_at IS NULL;
    RETURN;
  END IF;

  v_amount := CASE WHEN p_effect = 'never' THEN NULL ELSE p_amount END;

  -- Explicit find-then-write, NOT `ON CONFLICT (site_id, value_id)`: this
  -- function's RETURNS TABLE out-params are named after the very columns the
  -- conflict target names, and PL/pgSQL resolves that to "column reference
  -- site_id is ambiguous" AT RUN TIME — the function creates cleanly and then
  -- fails on the first real call (found live, 2026-08-23, by the first batch
  -- approval). svw_site_value_uniq still guarantees one row per (site, value).
  SELECT w.id INTO v_id
    FROM seo.site_value_worth w
   WHERE w.site_id = p_site_id AND w.value_id = p_value_id AND w.deleted_at IS NULL
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO seo.site_value_worth AS w
      (site_id, value_id, effect, amount, origin, notes, organization_id, created_by, updated_by)
    VALUES
      (p_site_id, p_value_id, p_effect, v_amount, p_origin, v_notes, v_org, v_uid, v_uid)
    RETURNING w.id INTO v_id;
  ELSE
    UPDATE seo.site_value_worth w
       SET effect     = p_effect,
           amount     = v_amount,
           origin     = p_origin,
           notes      = COALESCE(v_notes, w.notes),
           updated_by = v_uid,
           updated_at = now()
     WHERE w.id = v_id;
  END IF;

  RETURN QUERY
  SELECT w.id, w.site_id, w.value_id, w.effect, w.amount, w.origin, w.notes, w.updated_at
    FROM seo.site_value_worth w WHERE w.id = v_id;
END;
$function$;

COMMENT ON FUNCTION seo.site_value_worth_upsert(uuid,uuid,text,numeric,text,text) IS
  'THE write path for seo.site_value_worth (P18). effect = add | scale | never | clear (clear removes the row — no worth is the default, P17). Used by the Dimensions editor AND by keyword-meaning suggestion approval.';

REVOKE ALL ON FUNCTION seo.site_value_worth_upsert(uuid,uuid,text,numeric,text,text) FROM public;
GRANT EXECUTE ON FUNCTION seo.site_value_worth_upsert(uuid,uuid,text,numeric,text,text) TO authenticated, service_role;

-- ── 3. THE suggestion door ──────────────────────────────────────────────────
-- Every agent proposal about keyword MEANING lands here and nowhere else. The
-- row it writes is an ordinary `platform.assists` row, so it inherits the whole
-- primitive for free: the canonical chip/card, quiet windows, the producer
-- policy gate, dedupe, durable dismissal with a reason, `/assists` triage.
--
-- Two refusals carry the law:
--   * a payload a human already DECIDED (approved or rejected) is refused —
--     "a rejected suggestion is never re-proposed verbatim", the same rule the
--     rejected keyword edges use, keyed on the payload hash;
--   * a payload already PENDING is refreshed, never stacked.
-- The proposal arrives carrying SLUGS — an agent names a dimension and a value
-- in words, never a uuid. Enrichment fills in the ids and the human labels
-- BEFORE hashing, so the stored payload is canonical, the review card never
-- renders an opaque id, and the same proposal always produces the same hash.
DROP FUNCTION IF EXISTS seo.keyword_meaning_suggest(uuid,jsonb,text,text,text,real,jsonb,jsonb);

CREATE OR REPLACE FUNCTION seo.keyword_meaning_suggest(
  p_site_id    uuid,
  p_proposal   jsonb,
  p_title      text,
  p_body       text    DEFAULT NULL,
  p_reasoning  text    DEFAULT NULL,
  p_confidence real    DEFAULT NULL,
  p_evidence   jsonb   DEFAULT NULL,
  p_provenance jsonb   DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  assist_id uuid, status text, dedupe_key text, payload_hash text,
  addressee uuid, proposal jsonb
)
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
  IF v_site.created_by IS NULL THEN
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
    RETURN QUERY SELECT v_existing.id, 'already_decided'::text, v_dedupe, v_hash, v_site.created_by, v_p;
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
    RETURN QUERY SELECT v_existing.id, 'already_pending'::text, v_dedupe, v_hash, v_site.created_by, v_p;
    RETURN;
  END IF;

  v_action := jsonb_build_object(
    'kind',        'apply_keyword_meaning',
    'siteId',      p_site_id,
    'siteLabel',   v_site.label,
    'proposal',    v_p,
    'provenance',  COALESCE(p_provenance, '{}'::jsonb) || jsonb_build_object('proposedBy', v_uid),
    'payloadHash', v_hash
  );

  INSERT INTO platform.assists
    (user_id, entity_type, entity_id, surface_name, source_kind, source_key,
     title, body, reasoning, confidence, action, dedupe_key, expires_at,
     priority, organization_id, evidence, first_seen_at)
  VALUES
    (v_site.created_by, 'web_site', p_site_id,
     'matrx-user/keyword-meaning-review', 'agent', v_source,
     p_title, p_body, p_reasoning, p_confidence, v_action, v_dedupe,
     now() + interval '30 days',
     0, v_site.organization_id, p_evidence, now())
  RETURNING assists.id INTO v_id;

  RETURN QUERY SELECT v_id, 'created'::text, v_dedupe, v_hash, v_site.created_by, v_p;
END;
$function$;

COMMENT ON FUNCTION seo.keyword_meaning_suggest(uuid,jsonb,text,text,text,real,jsonb,jsonb) IS
  'THE one door for an agent-proposed change to keyword MEANING (P12/C9). Writes exactly one platform.assists row and NOTHING else - the matcher/worth/stamp/guidelines tables are untouched until a human approves, which is what makes an unapproved suggestion invisible to the next agent run. Enriches slugs into ids + human labels before hashing, so the review card never shows a uuid. Refuses a payload a human already decided (dedupe by md5 of the canonical proposal); refreshes one already pending.';

REVOKE ALL ON FUNCTION seo.keyword_meaning_suggest(uuid,jsonb,text,text,text,real,jsonb,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION seo.keyword_meaning_suggest(uuid,jsonb,text,text,text,real,jsonb,jsonb) TO authenticated, service_role;

-- ── 4. The producer policy (fails closed without it) ────────────────────────
-- `private.enforce_assist_admission` refuses an unregistered source, so the
-- tool would silently produce nothing without this row.
--
-- max_pending_per_user = 40, deliberately far above the ambient default of 3:
-- this is a REVIEW QUEUE on a workbench, not a dock chip — the dock still shows
-- at most one per source family (presentation-cycle.ts), so a full queue never
-- floods the corner. Starting value chosen 2026-08-23; review by 2026-11-23
-- against the real accept/reject ratio on DDI (limits-are-knobs).
--
-- 🚨 presentation_enabled = TRUE, and this producer is (as of 2026-08-23) the
-- only one. `platform.list_my_presentable_assists` filters on it, so a producer
-- with presentation off renders NOWHERE — not in the dock, not in a page strip.
-- Every other row is off pending the Chip Rescue audit. This one is on because
-- an approval queue that renders nothing is not a quiet feature, it is a broken
-- one: a proposal nobody can see can never be approved or rejected, and the
-- agent keeps re-proposing into a void. It meets the rubric those rows are
-- judged against — accepting completes a small, named, reversible domain write.
INSERT INTO platform.assist_producer_policy
  (source_pattern, match_kind, display_name, feature_key, disposition,
   audit_status, production_enabled, presentation_enabled, cost_class,
   max_pending_per_user, max_presented_per_cycle, rationale)
VALUES
  ('seo.keyword_meaning.', 'prefix',
   'Keyword meaning suggestions', 'seo', 'assist',
   'approved', true, true, 'agent',
   40, 1,
   'P12: an agent may only SUGGEST a change to keyword meaning. Accepting replays the proposal through the ordinary human write path (matcher upsert / worth upsert / gsc_set_keyword_class / keyword_facet_set / gsc_set_site_kw_guidelines), so every acceptance completes a real, reversible domain write. Rejection records a reason and the payload hash is never re-proposed.')
ON CONFLICT (source_pattern, match_kind) DO UPDATE
  SET display_name       = EXCLUDED.display_name,
      feature_key        = EXCLUDED.feature_key,
      disposition        = EXCLUDED.disposition,
      audit_status       = EXCLUDED.audit_status,
      production_enabled = EXCLUDED.production_enabled,
      presentation_enabled = EXCLUDED.presentation_enabled,
      cost_class         = EXCLUDED.cost_class,
      rationale          = EXCLUDED.rationale,
      max_pending_per_user = GREATEST(platform.assist_producer_policy.max_pending_per_user,
                                      EXCLUDED.max_pending_per_user);
