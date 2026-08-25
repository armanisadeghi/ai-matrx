-- KI-044 — AUTONOMY MODES, on the settings ladder.
--
-- Policy: /policies/human-in-the-loop-autonomy-modes.md. Every AI-driven
-- capability runs in exactly one of four modes:
--   1 auto_platform  AI finds by platform rules and applies automatically
--   2 auto_org       AI finds by the organization's rules and applies automatically
--   3 review_timeout AI finds; a human may review; applies after a set wait
--   4 review_required AI finds; nothing applies until a human reviews
--
-- The mode is a SETTING, so it uses the ladder exactly like every other setting
-- (/policies/settings-ladder.md): platform → organization → brand → site,
-- nearest wins, stored in the same settings columns under `ai_autonomy`.
--
-- `enforced` on the registry row is the honest part: it says whether the
-- running code actually consults this setting yet. A control that silently
-- governs nothing is worse than no control, so the UI reads this flag and says
-- so rather than implying power it does not have.

CREATE TABLE IF NOT EXISTS seo.ai_capability (
  slug            text PRIMARY KEY,
  label           text NOT NULL,
  description     text NOT NULL,
  default_mode    text NOT NULL CHECK (default_mode IN ('auto_platform','auto_org','review_timeout','review_required')),
  default_timeout_hours int,
  enforced        boolean NOT NULL DEFAULT false,
  enforcement_note text,
  position        int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE seo.ai_capability IS
  'The AI steps in Keyword Intelligence, each declaring the autonomy mode it runs in by default (KI-044). Platform-owned reference data: read by everyone, written by migrations and platform admins.';

ALTER TABLE seo.ai_capability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_capability_read ON seo.ai_capability;
CREATE POLICY ai_capability_read ON seo.ai_capability FOR SELECT TO authenticated USING (true);
GRANT SELECT ON seo.ai_capability TO authenticated, service_role;

INSERT INTO seo.ai_capability (slug, label, description, default_mode, default_timeout_hours, enforced, enforcement_note, position) VALUES
  ('keyword_classifier', 'Reading what a keyword is',
   'Works out the universal facts about a keyword — who is searching, how ready they are to buy, what qualifiers colour it. Applies to the shared keyword dictionary, identically for everyone.',
   'auto_platform', NULL, false,
   'Runs automatically on the nightly pass; it does not consult this setting yet.', 10),
  ('topic_assigner', 'Placing keywords under your offerings',
   'Decides which of your offerings a keyword belongs to. Confident placements apply; unsure ones already wait for you as proposals.',
   'auto_platform', NULL, false,
   'Runs automatically, and already holds low-confidence placements for review; it does not consult this setting yet.', 20),
  ('place_detection', 'Recognizing places in keywords',
   'Spots cities, states and "near me" wording using the platform gazetteer. Deterministic — the same words always give the same answer.',
   'auto_platform', NULL, false,
   'Deterministic and applied on demand; it does not consult this setting yet.', 30),
  ('matcher_engine', 'Applying your own rules',
   'Runs the matchers you wrote over your keywords and stamps what they catch. Deterministic, and it never touches a keyword you ruled by hand.',
   'auto_platform', NULL, false,
   'Deterministic and applied when you run it; it does not consult this setting yet.', 40),
  ('meaning_suggestions', 'Agent suggestions about meaning',
   'When an agent thinks a rule, a worth or a ruling should change, it proposes rather than acts. Nothing a pending suggestion says reaches any other agent.',
   'review_required', 72, true,
   'Enforced: suggestions are written as proposals and change nothing until a person approves them.', 50)
ON CONFLICT (slug) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description,
      default_mode = EXCLUDED.default_mode, default_timeout_hours = EXCLUDED.default_timeout_hours,
      enforced = EXCLUDED.enforced, enforcement_note = EXCLUDED.enforcement_note,
      position = EXCLUDED.position, updated_at = now();

-- ── the ladder read: what mode applies, and which tier said so ───────────────
CREATE OR REPLACE FUNCTION seo.fn_ai_autonomy(p_site_id uuid, p_capability text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  WITH cap AS (SELECT * FROM seo.ai_capability WHERE slug = p_capability),
  rungs AS (
    SELECT 'site' AS scope, 1 AS ord, s.settings->'ai_autonomy'->p_capability AS v
      FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL
    UNION ALL
    SELECT 'brand', 2, b.settings->'ai_autonomy'->p_capability
      FROM web.site s JOIN web.brand b ON b.id = s.brand_id AND b.deleted_at IS NULL
     WHERE s.id = p_site_id AND s.deleted_at IS NULL
    UNION ALL
    SELECT 'org', 3, o.settings->'ai_autonomy'->p_capability
      FROM web.site s JOIN iam.organizations o ON o.id = s.organization_id
     WHERE s.id = p_site_id AND s.deleted_at IS NULL
    UNION ALL
    SELECT 'platform', 4, k.value->p_capability
      FROM platform.feature_knob k
     WHERE k.feature = 'seo.ai_autonomy' AND k.key = 'modes'
  ),
  hit AS (
    SELECT scope, v FROM rungs
     WHERE v IS NOT NULL AND v ? 'mode' ORDER BY ord LIMIT 1
  )
  SELECT jsonb_build_object(
    'capability', p_capability,
    'mode', COALESCE((SELECT v->>'mode' FROM hit), (SELECT default_mode FROM cap)),
    'timeout_hours', COALESCE((SELECT (v->>'timeout_hours')::int FROM hit), (SELECT default_timeout_hours FROM cap)),
    'source', COALESCE((SELECT scope FROM hit), 'platform_default'),
    'enforced', COALESCE((SELECT enforced FROM cap), false),
    'enforcement_note', (SELECT enforcement_note FROM cap));
$fn$;

REVOKE ALL ON FUNCTION seo.fn_ai_autonomy(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.fn_ai_autonomy(uuid, text) TO authenticated, service_role;

-- ── what one editor screen renders, at any rung ─────────────────────────────
CREATE OR REPLACE FUNCTION seo.ai_autonomy_scope(p_scope text, p_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_own jsonb := '{}'::jsonb;
  v_inherited jsonb := '{}'::jsonb;
  v_label text;
  v_parent jsonb;
BEGIN
  IF p_scope NOT IN ('platform','org','brand','site') THEN
    RAISE EXCEPTION 'seo_autonomy_bad_scope: scope must be platform, org, brand or site (got %)', COALESCE(p_scope,'null');
  END IF;
  IF p_scope <> 'platform' AND p_id IS NULL THEN
    RAISE EXCEPTION 'seo_autonomy_id_required: % needs an id', p_scope;
  END IF;

  IF p_scope = 'platform' THEN
    v_label := 'Platform defaults';
    SELECT COALESCE(k.value,'{}'::jsonb) INTO v_own FROM platform.feature_knob k
     WHERE k.feature='seo.ai_autonomy' AND k.key='modes';
  ELSIF p_scope = 'org' THEN
    SELECT o.name, COALESCE(o.settings->'ai_autonomy','{}'::jsonb) INTO v_label, v_own
      FROM iam.organizations o WHERE o.id = p_id;
    v_parent := jsonb_build_object('scope','platform','label','Platform defaults');
  ELSIF p_scope = 'brand' THEN
    SELECT b.name, COALESCE(b.settings->'ai_autonomy','{}'::jsonb) INTO v_label, v_own
      FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    v_parent := (SELECT jsonb_build_object('scope','org','id',o.id,'label',o.name)
                   FROM web.brand b JOIN iam.organizations o ON o.id=b.organization_id WHERE b.id = p_id);
  ELSE
    SELECT COALESCE(s.name, s.domain), COALESCE(s.settings->'ai_autonomy','{}'::jsonb) INTO v_label, v_own
      FROM web.site s WHERE s.id = p_id AND s.deleted_at IS NULL;
    v_parent := (SELECT jsonb_build_object('scope','brand','id',b.id,'label',b.name)
                   FROM web.site s JOIN web.brand b ON b.id=s.brand_id WHERE s.id = p_id);
  END IF;

  RETURN jsonb_build_object(
    'scope', p_scope, 'id', p_id, 'label', v_label,
    'parent', v_parent,
    'may_edit', seo.fn_value_settings_may_edit(p_scope, p_id),
    'capabilities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'slug', c.slug, 'label', c.label, 'description', c.description,
        'default_mode', c.default_mode, 'default_timeout_hours', c.default_timeout_hours,
        'enforced', c.enforced, 'enforcement_note', c.enforcement_note,
        'own_mode', v_own->c.slug->>'mode',
        'own_timeout_hours', (v_own->c.slug->>'timeout_hours')::int,
        -- For a site the ladder can be resolved exactly; above it, the honest
        -- answer is the tier's own value or the platform default.
        'effective', CASE WHEN p_scope = 'site' THEN seo.fn_ai_autonomy(p_id, c.slug)
                          ELSE jsonb_build_object('mode', COALESCE(v_own->c.slug->>'mode', c.default_mode),
                                                  'source', CASE WHEN v_own ? c.slug THEN p_scope ELSE 'platform_default' END) END
      ) ORDER BY c.position), '[]'::jsonb)
      FROM seo.ai_capability c));
END;
$fn$;

REVOKE ALL ON FUNCTION seo.ai_autonomy_scope(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.ai_autonomy_scope(text, uuid) TO authenticated, service_role;

-- ── the ONE write, every tier ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seo.set_ai_autonomy(
  p_scope text, p_id uuid DEFAULT NULL, p_capability text DEFAULT NULL,
  p_mode text DEFAULT NULL, p_timeout_hours int DEFAULT NULL, p_clear boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $fn$
DECLARE v_all jsonb; v_entry jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM seo.ai_capability WHERE slug = p_capability) THEN
    RAISE EXCEPTION 'seo_autonomy_unknown_capability: there is no AI step named "%"', COALESCE(p_capability,'null');
  END IF;
  IF NOT seo.fn_value_settings_may_edit(p_scope, p_id) THEN
    RAISE EXCEPTION 'seo_autonomy_denied: you do not have permission to change these settings' USING ERRCODE='42501';
  END IF;
  IF NOT p_clear AND (p_mode IS NULL OR p_mode NOT IN ('auto_platform','auto_org','review_timeout','review_required')) THEN
    RAISE EXCEPTION 'seo_autonomy_bad_mode: choose one of auto_platform, auto_org, review_timeout, review_required';
  END IF;
  IF NOT p_clear AND p_mode = 'review_timeout' AND COALESCE(p_timeout_hours,0) <= 0 THEN
    RAISE EXCEPTION 'seo_autonomy_needs_timeout: "review then apply" needs how long to wait';
  END IF;

  IF p_scope = 'platform' THEN
    SELECT COALESCE(k.value,'{}'::jsonb) INTO v_all FROM platform.feature_knob k
     WHERE k.feature='seo.ai_autonomy' AND k.key='modes';
    v_all := COALESCE(v_all,'{}'::jsonb);
    IF p_clear THEN
      RAISE EXCEPTION 'seo_autonomy_platform_is_the_floor: the platform tier has nothing above it — change the mode instead of clearing it';
    END IF;
    v_entry := jsonb_strip_nulls(jsonb_build_object('mode', p_mode, 'timeout_hours', p_timeout_hours));
    v_all := v_all || jsonb_build_object(p_capability, v_entry);
    INSERT INTO platform.feature_knob (feature, key, value, default_value, value_type, label, description, set_by, basis, review_due)
    VALUES ('seo.ai_autonomy','modes', v_all, '{}'::jsonb, 'json',
            'AI autonomy modes', 'Which of the four human-in-the-loop modes each Keyword Intelligence AI step runs in by default (KI-044).',
            'human', 'Set by a platform admin in the admin settings screen.', (now() + interval '90 days')::date)
    ON CONFLICT (feature, key) DO UPDATE SET value = v_all, updated_at = now(), updated_by = (SELECT auth.uid()), set_by='human';
  ELSE
    IF p_scope = 'org' THEN
      SELECT COALESCE(o.settings->'ai_autonomy','{}'::jsonb) INTO v_all FROM iam.organizations o WHERE o.id = p_id;
    ELSIF p_scope = 'brand' THEN
      SELECT COALESCE(b.settings->'ai_autonomy','{}'::jsonb) INTO v_all FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    ELSE
      SELECT COALESCE(s.settings->'ai_autonomy','{}'::jsonb) INTO v_all FROM web.site s WHERE s.id = p_id AND s.deleted_at IS NULL;
    END IF;
    IF v_all IS NULL THEN
      RAISE EXCEPTION 'seo_autonomy_scope_not_found: no % with id %', p_scope, p_id USING ERRCODE='P0002';
    END IF;
    IF p_clear THEN
      v_all := v_all - p_capability;
    ELSE
      v_all := v_all || jsonb_build_object(p_capability,
        jsonb_strip_nulls(jsonb_build_object('mode', p_mode, 'timeout_hours', p_timeout_hours)));
    END IF;

    IF p_scope = 'org' THEN
      UPDATE iam.organizations o SET settings = CASE WHEN v_all = '{}'::jsonb
        THEN COALESCE(o.settings,'{}'::jsonb) - 'ai_autonomy'
        ELSE COALESCE(o.settings,'{}'::jsonb) || jsonb_build_object('ai_autonomy', v_all) END
       WHERE o.id = p_id;
    ELSIF p_scope = 'brand' THEN
      UPDATE web.brand b SET settings = CASE WHEN v_all = '{}'::jsonb
        THEN COALESCE(b.settings,'{}'::jsonb) - 'ai_autonomy'
        ELSE COALESCE(b.settings,'{}'::jsonb) || jsonb_build_object('ai_autonomy', v_all) END,
        updated_at = now(), updated_by = (SELECT auth.uid())
       WHERE b.id = p_id AND b.deleted_at IS NULL;
    ELSE
      UPDATE web.site s SET settings = CASE WHEN v_all = '{}'::jsonb
        THEN COALESCE(s.settings,'{}'::jsonb) - 'ai_autonomy'
        ELSE COALESCE(s.settings,'{}'::jsonb) || jsonb_build_object('ai_autonomy', v_all) END,
        updated_at = now(), updated_by = (SELECT auth.uid())
       WHERE s.id = p_id AND s.deleted_at IS NULL;
    END IF;
  END IF;

  RETURN seo.ai_autonomy_scope(p_scope, p_id);
END;
$fn$;

REVOKE ALL ON FUNCTION seo.set_ai_autonomy(text, uuid, text, text, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.set_ai_autonomy(text, uuid, text, text, int, boolean) TO authenticated, service_role;
