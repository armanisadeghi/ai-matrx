-- ============================================================================
-- AUTHORING A VALUE RULE MINTED NOTHING (2026-08-24)
--
-- The geo half of this hole was closed 2026-08-24: `seo.site_geo_area` got a
-- trigger (`site_geo_area_sync_meaning`) that mints the value, the matchers and
-- the worth whenever a service area is saved. The RULES half was left open, and
-- ADOPTION-SWEEP.md recorded it as a landmine with zero instances so far.
--
-- Verified live before writing this: `seo.keyword_class_rule` carries nine
-- triggers and NONE of them syncs meaning, while `seo.site_geo_area` carries
-- `site_geo_area_sync_meaning`. `data-class-rules.ts` (`createValueRule` /
-- `updateValueRule`) writes the row and nothing else. So a rule authored today
-- mints no value, no matcher and no worth, and the C2 resolver — which reads
-- STAMPS only — never sees it. The rule sits in the UI looking authored and
-- changes nothing, forever.
--
-- The 46 existing site rules work only because C1's one-off migration block
-- (§5b of seo_stamp_system_c1.sql) minted their meaning by hand. A live check
-- found no site rule created or updated since C1 — the only reason this has not
-- bitten anyone yet. It would have bitten the moment Arman used the rules UI,
-- and human-authored rules are the whole point of the determinism he asked for:
-- "when a human sets rules, those are rules."
--
-- This is C1 §5b turned into a trigger, the same shape as the geo fix.
--
-- ── THE THREE RULE SHAPES (a single rule row may be more than one) ──────────
--   1. class rule    target_class + pattern
--                    → matcher on the SHARED platform value traffic_class:<c>
--   2. qualifier rule value_multiplier + pattern
--                    → a rule-OWNED value under the site's Qualifiers
--                      dimension + its matcher + a `scale` worth row
--   3. facet rule    value_multiplier + match_facet + match_facet_value
--                    → a `scale` worth row on an existing SHARED value
--
-- ── enabled: WHY CLASS RULES ARE GATED AND VALUE RULES ARE NOT ─────────────
-- C1 shipped every class rule as enabled and instantly reclassified a site from
-- 917 money keywords to 31,715. The ruling that came out of that incident is
-- that a class rule which is not `auto_apply` must not silently reclassify, so
-- its matcher is minted DISABLED and turning `auto_apply` on turns it live.
-- Value rules are different and are minted live: `createValueRule` hardcodes
-- `auto_apply: false`, so gating them on that column would mean this fix
-- changed nothing at all. Confirmed against the live data — every existing
-- value-rule matcher is enabled, and no enabled matcher traces to a
-- never-applied class rule (0 live stamps).
--
-- ── OWNERSHIP, SO ARCHIVING IS EXACT ───────────────────────────────────────
-- Shapes 1 and 3 hang off values that OTHER rules and the pickers also use, so
-- archiving a rule must never delete the value — only the rows that rule minted.
-- C1 left only a prose back-link (notes = 'from class rule "<name>"'), which
-- breaks the moment a rule is renamed. Every row this function mints carries
-- `metadata->>'rule_id'`, and §4 backfills that onto C1's rows by matching the
-- prose link once, while the names still agree.
-- ============================================================================

-- ── 1. THE SYNC ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seo.fn_value_rule_sync_meaning(p_rule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  r record;
  v_org uuid; v_qual_dim uuid; v_val uuid; v_class_val uuid; v_facet_val uuid;
  v_slug text; v_mult numeric;
  v_matchers int := 0; v_worth int := 0; v_retired int := 0;
BEGIN
  SELECT * INTO r FROM seo.keyword_class_rule WHERE id = p_rule_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_such_rule');
  END IF;

  -- Pack TEMPLATES (site_id IS NULL) are catalogue entries, not a site's own
  -- rules. Adopting a pack is what mints a site's meaning; a template itself
  -- has no site to mint into.
  IF r.site_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'pack_template');
  END IF;

  SELECT COALESCE(r.organization_id, s.organization_id) INTO v_org
    FROM web.site s WHERE s.id = r.site_id;

  -- The rule's own value is found by IDENTITY, never by its label, so renaming
  -- a rule renames its value instead of minting a second one.
  SELECT c.id INTO v_val FROM platform.categories c
   WHERE c.dimension = 'seo_facet' AND c.metadata->>'rule_id' = p_rule_id::text
   ORDER BY c.deleted_at NULLS FIRST, c.created_at LIMIT 1;

  -- ── ARCHIVED RULE → retire its meaning instead of orphaning it ───────────
  IF r.deleted_at IS NOT NULL THEN
    WITH gone AS (
      UPDATE seo.dimension_value_matcher SET deleted_at = now(), updated_at = now()
       WHERE site_id = r.site_id AND deleted_at IS NULL
         AND metadata->>'rule_id' = p_rule_id::text
      RETURNING 1) SELECT count(*) INTO v_retired FROM gone;
    UPDATE seo.site_value_worth SET deleted_at = now(), updated_at = now()
     WHERE site_id = r.site_id AND deleted_at IS NULL
       AND metadata->>'rule_id' = p_rule_id::text;
    -- Only a value this rule OWNS is retired. A shared value (traffic_class:*,
    -- or a facet another rule scores) keeps living; we only removed our rows.
    IF v_val IS NOT NULL THEN
      UPDATE seo.keyword_facet SET deleted_at = now(), updated_at = now()
       WHERE category_id = v_val AND deleted_at IS NULL
         AND source = 'matcher' AND NOT pinned;
      UPDATE platform.categories SET deleted_at = now(), updated_at = now()
       WHERE id = v_val AND deleted_at IS NULL;
    END IF;
    RETURN jsonb_build_object('ok', true, 'archived', true,
                              'rule_id', p_rule_id, 'retired', v_retired);
  END IF;

  -- ── SHAPE 1 — class rule → matcher on the shared traffic_class value ─────
  IF r.target_class IS NOT NULL AND NULLIF(btrim(r.pattern), '') IS NOT NULL
     AND r.target_class IN ('money', 'educational', 'brand', 'mismatch') THEN
    SELECT id INTO v_class_val FROM platform.categories
     WHERE dimension = 'seo_facet'
       AND slug = 'traffic_class:' || r.target_class
       AND deleted_at IS NULL;
    IF v_class_val IS NOT NULL THEN
      UPDATE seo.dimension_value_matcher
         SET kind = COALESCE(r.match_kind, 'contains'),
             pattern = lower(btrim(r.pattern)),
             enabled = r.auto_apply,          -- the C1 ruling, in one place
             notes = 'from class rule "' || r.name || '"',
             deleted_at = NULL, updated_at = now()
       WHERE site_id = r.site_id AND value_id = v_class_val
         AND metadata->>'rule_id' = p_rule_id::text;
      IF NOT FOUND THEN
        INSERT INTO seo.dimension_value_matcher
          (site_id, organization_id, value_id, kind, pattern, enabled, origin, pack_id, notes, metadata)
        VALUES (r.site_id, v_org, v_class_val, COALESCE(r.match_kind, 'contains'),
                lower(btrim(r.pattern)), r.auto_apply,
                CASE WHEN r.pack_id IS NOT NULL THEN 'pack' ELSE 'human' END,
                r.pack_id, 'from class rule "' || r.name || '"',
                jsonb_build_object('rule_id', p_rule_id::text, 'rule_shape', 'class'));
      END IF;
      v_matchers := v_matchers + 1;
    END IF;
  ELSE
    -- The rule stopped being a class rule: retire only that matcher.
    UPDATE seo.dimension_value_matcher SET deleted_at = now(), updated_at = now()
     WHERE site_id = r.site_id AND deleted_at IS NULL
       AND metadata->>'rule_id' = p_rule_id::text
       AND metadata->>'rule_shape' = 'class';
  END IF;

  -- ── SHAPE 2 — phrase + multiplier → a rule-owned Qualifiers value ────────
  IF r.value_multiplier IS NOT NULL AND NULLIF(btrim(r.pattern), '') IS NOT NULL THEN
    v_qual_dim := seo._ensure_site_dimension(
      r.site_id, 'qualifiers', 'Qualifiers',
      'Words in a search that change what it is worth to this business (free, cheap, certified, emergency…).',
      'intrinsic');
    IF v_val IS NULL THEN
      v_slug := COALESCE(NULLIF(seo._slugify(r.name), ''), 'rule_' || left(p_rule_id::text, 8));
      v_val := seo._ensure_value(v_qual_dim, v_slug, r.name,
        jsonb_build_object('rule_id', p_rule_id::text, 'description', r.description));
    ELSE
      -- Rename / restore. The slug never moves — only the label follows.
      UPDATE platform.categories
         SET name = r.name, parent_id = v_qual_dim, deleted_at = NULL,
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || jsonb_build_object('rule_id', p_rule_id::text,
                                              'description', r.description),
             updated_at = now()
       WHERE id = v_val
         AND (name IS DISTINCT FROM r.name
              OR parent_id IS DISTINCT FROM v_qual_dim
              OR deleted_at IS NOT NULL);
    END IF;

    UPDATE seo.dimension_value_matcher
       SET kind = COALESCE(r.match_kind, 'contains'),
           pattern = lower(btrim(r.pattern)),
           notes = 'from value rule "' || r.name || '"',
           deleted_at = NULL, updated_at = now()
     WHERE site_id = r.site_id AND value_id = v_val
       AND metadata->>'rule_id' = p_rule_id::text;
    IF NOT FOUND THEN
      INSERT INTO seo.dimension_value_matcher
        (site_id, organization_id, value_id, kind, pattern, enabled, origin, pack_id, notes, metadata)
      VALUES (r.site_id, v_org, v_val, COALESCE(r.match_kind, 'contains'),
              lower(btrim(r.pattern)), true,
              CASE WHEN r.pack_id IS NOT NULL THEN 'pack' ELSE 'human' END,
              r.pack_id, 'from value rule "' || r.name || '"',
              jsonb_build_object('rule_id', p_rule_id::text, 'rule_shape', 'qualifier'));
    END IF;
    v_matchers := v_matchers + 1;

    v_mult := LEAST(5, GREATEST(0.05, r.value_multiplier));
    UPDATE seo.site_value_worth
       SET effect = CASE WHEN r.value_multiplier = 0 THEN 'never' ELSE 'scale' END,
           amount = CASE WHEN r.value_multiplier = 0 THEN NULL ELSE v_mult END,
           notes = COALESCE(r.notes, 'from value rule "' || r.name || '"'),
           deleted_at = NULL, updated_at = now()
     WHERE site_id = r.site_id AND value_id = v_val
       AND metadata->>'rule_id' = p_rule_id::text;
    IF NOT FOUND THEN
      INSERT INTO seo.site_value_worth
        (site_id, organization_id, value_id, effect, amount, origin, pack_id, notes, metadata)
      VALUES (r.site_id, v_org, v_val,
              CASE WHEN r.value_multiplier = 0 THEN 'never' ELSE 'scale' END,
              CASE WHEN r.value_multiplier = 0 THEN NULL ELSE v_mult END,
              CASE WHEN r.pack_id IS NOT NULL THEN 'pack' ELSE 'human' END,
              r.pack_id, COALESCE(r.notes, 'from value rule "' || r.name || '"'),
              jsonb_build_object('rule_id', p_rule_id::text, 'rule_shape', 'qualifier'));
    END IF;
    v_worth := v_worth + 1;
  END IF;

  -- ── SHAPE 3 — multiplier on an existing facet value → worth only ─────────
  IF r.value_multiplier IS NOT NULL
     AND r.match_facet IS NOT NULL AND r.match_facet_value IS NOT NULL THEN
    SELECT id INTO v_facet_val FROM platform.categories
     WHERE dimension = 'seo_facet'
       AND slug = r.match_facet || ':' || r.match_facet_value
       AND deleted_at IS NULL;
    IF v_facet_val IS NOT NULL THEN
      v_mult := LEAST(5, GREATEST(0.05, r.value_multiplier));
      UPDATE seo.site_value_worth
         SET effect = CASE WHEN r.value_multiplier = 0 THEN 'never' ELSE 'scale' END,
             amount = CASE WHEN r.value_multiplier = 0 THEN NULL ELSE v_mult END,
             notes = COALESCE(r.notes, 'from value rule "' || r.name || '"'),
             deleted_at = NULL, updated_at = now()
       WHERE site_id = r.site_id AND value_id = v_facet_val
         AND metadata->>'rule_id' = p_rule_id::text;
      IF NOT FOUND THEN
        INSERT INTO seo.site_value_worth
          (site_id, organization_id, value_id, effect, amount, origin, pack_id, notes, metadata)
        VALUES (r.site_id, v_org, v_facet_val,
                CASE WHEN r.value_multiplier = 0 THEN 'never' ELSE 'scale' END,
                CASE WHEN r.value_multiplier = 0 THEN NULL ELSE v_mult END,
                CASE WHEN r.pack_id IS NOT NULL THEN 'pack' ELSE 'human' END,
                r.pack_id, COALESCE(r.notes, 'from value rule "' || r.name || '"'),
                jsonb_build_object('rule_id', p_rule_id::text, 'rule_shape', 'facet'));
      END IF;
      v_worth := v_worth + 1;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'rule_id', p_rule_id, 'site_id', r.site_id,
                            'value_id', v_val, 'matchers', v_matchers, 'worth', v_worth);
END $fn$;

-- ── 2. THE TRIGGER ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seo.keyword_class_rule_sync_meaning_tg()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  PERFORM seo.fn_value_rule_sync_meaning(NEW.id);
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS keyword_class_rule_sync_meaning ON seo.keyword_class_rule;
CREATE TRIGGER keyword_class_rule_sync_meaning
AFTER INSERT OR UPDATE ON seo.keyword_class_rule
FOR EACH ROW EXECUTE FUNCTION seo.keyword_class_rule_sync_meaning_tg();

-- ── 3. INDEXES for the ownership lookups the function does on every save ────
CREATE INDEX IF NOT EXISTS dimension_value_matcher_rule_idx
  ON seo.dimension_value_matcher ((metadata->>'rule_id'))
  WHERE metadata ? 'rule_id';
CREATE INDEX IF NOT EXISTS site_value_worth_rule_idx
  ON seo.site_value_worth ((metadata->>'rule_id'))
  WHERE metadata ? 'rule_id';

-- ── 4. BACKFILL the ownership link onto C1's rows ───────────────────────────
-- C1 left only the prose link. Claim it now, while rule names still match the
-- notes it wrote; after any rename this becomes unrecoverable. Idempotent, and
-- it never claims a row another rule already owns.
UPDATE seo.dimension_value_matcher dm
   SET metadata = COALESCE(dm.metadata, '{}'::jsonb)
                  || jsonb_build_object('rule_id', r.id::text,
                                        'rule_shape',
                                        CASE WHEN dm.notes LIKE 'from class rule %'
                                             THEN 'class' ELSE 'qualifier' END)
  FROM seo.keyword_class_rule r
 WHERE r.site_id = dm.site_id
   AND r.deleted_at IS NULL
   AND dm.deleted_at IS NULL
   AND NOT (dm.metadata ? 'rule_id')
   AND dm.notes IN ('from class rule "' || r.name || '"',
                    'from value rule "' || r.name || '"');

UPDATE seo.site_value_worth w
   SET metadata = COALESCE(w.metadata, '{}'::jsonb)
                  || jsonb_build_object('rule_id', r.id::text, 'rule_shape', 'qualifier')
  FROM platform.categories c, seo.keyword_class_rule r
 WHERE c.id = w.value_id
   AND c.metadata->>'rule_id' = r.id::text
   AND r.deleted_at IS NULL
   AND w.deleted_at IS NULL
   AND NOT (w.metadata ? 'rule_id');
