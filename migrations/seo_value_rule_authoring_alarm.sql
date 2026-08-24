-- ============================================================================
-- VALUE-RULE AUTHORING: COLLISION-SAFE, AND IT SCREAMS WHEN IT IS INERT
-- (2026-08-24, same day as and directly on top of seo_value_rule_sync_meaning)
--
-- That migration closed the hole the geo fix closed for service areas: a
-- trigger on seo.keyword_class_rule now mints the value, the matcher and the
-- worth whenever a rule is saved. It is live. This migration finishes it.
--
-- ── DEFECT 1 (live, reproduced): saving a facet rule ERRORS ─────────────────
-- A facet-shape rule (match_facet + match_facet_value + value_multiplier)
-- hangs its worth on a SHARED value, and seo.site_value_worth carries
-- `svw_site_value_uniq` on (site_id, value_id) WHERE deleted_at IS NULL. C1
-- already minted worth rows on those shared values with only a prose note, and
-- §4 of the previous migration could not claim them (it claimed only rows on
-- rule-OWNED values). So the new trigger's INSERT hits the unique index:
--
--   seo.fn_value_rule_sync_meaning('846cf8f6-…')  -- "Certification diligence"
--     → 23505 duplicate key value violates unique constraint "svw_site_value_uniq"
--
-- Probed live on Data Destruction, Inc. in a rolled-back subtransaction. The
-- trigger fires AFTER INSERT OR UPDATE, so this is not a silent skip — the
-- user's save FAILS. Three rules on that site are in this state today, and the
-- same collision is reachable for any two rules that score the same value.
-- The morning's fix turned "authoring silently mints nothing" into "authoring
-- errors out", which is louder but not better.
--
-- THE FIX: mint by CLAIM, never by blind insert. Two helpers own the natural
-- keys of the two tables. At a key that is already occupied:
--   • unowned (C1's rows) → claim it, stamp our rule_id, update it in place
--   • ours                → update in place
--   • another LIVE rule's → do not fight: leave it, report `conflict`, and let
--                           the alarm say plainly that two rules score the same
--                           value and which one is winning
-- A rule that changes its pattern moves its matcher instead of duplicating it,
-- and a soft-deleted row this rule owns is revived rather than twinned.
--
-- ── DEFECT 2 (live): the backfill was never run ─────────────────────────────
-- §4 of the previous migration backfilled the OWNERSHIP LINK onto C1's rows but
-- never called the sync for every rule, so rules authored between C1 and the
-- trigger have no meaning at all. Live count before this migration:
--   site 0610ed33 (i8-places-proof)  22 rules → 0 matchers, 0 worth
--   site 38eff4c9 (Data Destruction) 22 rules → 19 matchers, 19 worth (3 facet
--                                                rules unclaimed, see defect 1)
-- §6 below runs the sync over every rule, idempotently.
--
-- ── THE BACK-LINK QUESTION, DECIDED ────────────────────────────────────────
-- A class-rule matcher hangs off the SHARED platform value traffic_class:<c>,
-- so unlike a geo value it carries no identity of its own and needs a back-link
-- to the rule that minted it. The choice was a `rule_id` column or metadata.
-- It is metadata->>'rule_id', indexed on both tables (partial, WHERE the key is
-- present) — that shipped this morning and 21+21 rows already carry it.
--
-- Why that is also the right answer and not merely the incumbent one:
-- seo.dimension_value_matcher's id columns (place_id, fact_value_id,
-- condition_rule_id) are all TARGETS — each one names what a matcher of that
-- `kind` matches, and `dvm_target_check` enforces exactly one of them per kind.
-- Rule ownership is not a target: it is provenance, orthogonal to kind, present
-- on class and qualifier matchers alike. A fourth id column would sit outside
-- that CHECK and read like a fifth kind to everyone who meets the table next.
--
-- The one thing a column would have bought is referential integrity, and §2b
-- buys it instead: an AFTER DELETE trigger retires what a hard-deleted rule
-- owned, which is the ON DELETE clause the metadata link cannot declare.
--
-- ── THE ALARM ──────────────────────────────────────────────────────────────
-- Modelled on seo.gsc_geo_area_health / gsc_geo_area_reconnect:
--   seo.gsc_value_rule_health(site)    — one honest state per live rule
--   seo.gsc_value_rule_reconnect(site) — the one-click fix, bounded scope
--   seo.gsc_site_meaning_health        — learns the `disconnected rules` line
-- A rule that changes no score must say so on the Rulebook where it was typed.
--
-- 🚨 Every CREATE OR REPLACE here was written against the LIVE
-- pg_get_functiondef, not against the copy in migrations/.
-- Idempotent. Safe to re-run.
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
-- ============================================================================

-- ── 1. CLAIM, NEVER BLIND-INSERT ────────────────────────────────────────────
-- Both helpers are plain (invoker-rights) and are only ever called from the
-- SECURITY DEFINER sync below, the same way C1's seo._ensure_value is.

CREATE OR REPLACE FUNCTION seo._rule_claim_worth(
  p_rule_id uuid, p_shape text, p_site_id uuid, p_org uuid, p_value_id uuid,
  p_multiplier numeric, p_notes text, p_pack_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_id uuid; v_owner text; v_effect text; v_amount numeric;
BEGIN
  IF p_value_id IS NULL THEN RETURN 'unresolved'; END IF;

  v_effect := CASE WHEN p_multiplier = 0 THEN 'never' ELSE 'scale' END;
  v_amount := CASE WHEN p_multiplier = 0 THEN NULL
                   ELSE LEAST(5, GREATEST(0.05, p_multiplier)) END;

  -- The natural key of this table: one live worth per (site, value).
  SELECT w.id, w.metadata->>'rule_id' INTO v_id, v_owner
    FROM seo.site_value_worth w
   WHERE w.site_id = p_site_id AND w.value_id = p_value_id AND w.deleted_at IS NULL;

  IF v_id IS NOT NULL THEN
    -- Occupied by a different rule that is still alive: two rules scoring the
    -- same value is a real editorial conflict, not something to resolve by
    -- overwriting. The incumbent keeps the row; the alarm names both.
    IF v_owner IS NOT NULL AND v_owner <> p_rule_id::text
       AND EXISTS (SELECT 1 FROM seo.keyword_class_rule o
                    WHERE o.id = v_owner::uuid AND o.deleted_at IS NULL) THEN
      RETURN 'conflict';
    END IF;
    UPDATE seo.site_value_worth
       SET effect = v_effect, amount = v_amount, notes = p_notes,
           metadata = COALESCE(metadata, '{}'::jsonb)
                      || jsonb_build_object('rule_id', p_rule_id::text, 'rule_shape', p_shape),
           updated_at = now()
     WHERE id = v_id;
    RETURN CASE WHEN v_owner IS NULL THEN 'claimed' ELSE 'updated' END;
  END IF;

  -- Nothing live there. Revive one this rule retired earlier rather than
  -- growing a second row every time a rule is archived and restored.
  SELECT w.id INTO v_id
    FROM seo.site_value_worth w
   WHERE w.site_id = p_site_id AND w.value_id = p_value_id AND w.deleted_at IS NOT NULL
     AND w.metadata->>'rule_id' = p_rule_id::text
   ORDER BY w.updated_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE seo.site_value_worth
       SET effect = v_effect, amount = v_amount, notes = p_notes,
           metadata = COALESCE(metadata, '{}'::jsonb)
                      || jsonb_build_object('rule_id', p_rule_id::text, 'rule_shape', p_shape),
           deleted_at = NULL, updated_at = now()
     WHERE id = v_id;
    RETURN 'revived';
  END IF;

  INSERT INTO seo.site_value_worth
    (site_id, organization_id, value_id, effect, amount, origin, pack_id, notes, metadata)
  VALUES (p_site_id, p_org, p_value_id, v_effect, v_amount,
          CASE WHEN p_pack_id IS NOT NULL THEN 'pack' ELSE 'human' END,
          p_pack_id, p_notes,
          jsonb_build_object('rule_id', p_rule_id::text, 'rule_shape', p_shape));
  RETURN 'inserted';
END $fn$;

COMMENT ON FUNCTION seo._rule_claim_worth(uuid, text, uuid, uuid, uuid, numeric, text, uuid) IS
  'Puts a value rule''s worth on (site, value) without ever colliding with svw_site_value_uniq: claims an unowned row (C1 left many), updates its own, revives one it retired, inserts only when the key is free, and reports `conflict` rather than overwriting another live rule''s row.';

CREATE OR REPLACE FUNCTION seo._rule_claim_matcher(
  p_rule_id uuid, p_shape text, p_site_id uuid, p_org uuid, p_value_id uuid,
  p_kind text, p_pattern text, p_enabled boolean, p_pack_id uuid, p_notes text)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_mine uuid; v_target uuid; v_owner text; v_pattern text := lower(btrim(p_pattern));
BEGIN
  IF p_value_id IS NULL OR NULLIF(v_pattern, '') IS NULL THEN RETURN 'unresolved'; END IF;

  -- What this rule already owns for this shape (its pattern may have changed).
  SELECT dm.id INTO v_mine
    FROM seo.dimension_value_matcher dm
   WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL
     AND dm.metadata->>'rule_id' = p_rule_id::text
     AND dm.metadata->>'rule_shape' = p_shape
   ORDER BY dm.created_at LIMIT 1;

  -- What already sits at the identity dvm_identity_uniq protects.
  SELECT dm.id, dm.metadata->>'rule_id' INTO v_target, v_owner
    FROM seo.dimension_value_matcher dm
   WHERE dm.site_id = p_site_id AND dm.value_id = p_value_id AND dm.deleted_at IS NULL
     AND dm.kind = p_kind AND lower(dm.pattern) = v_pattern;

  IF v_target IS NOT NULL AND v_target IS DISTINCT FROM v_mine THEN
    IF v_owner IS NOT NULL AND v_owner <> p_rule_id::text
       AND EXISTS (SELECT 1 FROM seo.keyword_class_rule o
                    WHERE o.id = v_owner::uuid AND o.deleted_at IS NULL) THEN
      RETURN 'conflict';
    END IF;
    -- Claim the occupant and retire the stale row this rule used to own, so a
    -- renamed / re-patterned rule moves rather than twinning.
    UPDATE seo.dimension_value_matcher
       SET enabled = p_enabled, notes = p_notes,
           metadata = COALESCE(metadata, '{}'::jsonb)
                      || jsonb_build_object('rule_id', p_rule_id::text, 'rule_shape', p_shape),
           updated_at = now()
     WHERE id = v_target;
    IF v_mine IS NOT NULL THEN
      UPDATE seo.dimension_value_matcher SET deleted_at = now(), updated_at = now()
       WHERE id = v_mine;
    END IF;
    RETURN CASE WHEN v_owner IS NULL THEN 'claimed' ELSE 'updated' END;
  END IF;

  IF v_mine IS NOT NULL THEN
    UPDATE seo.dimension_value_matcher
       SET value_id = p_value_id, kind = p_kind, pattern = v_pattern,
           enabled = p_enabled, notes = p_notes, updated_at = now()
     WHERE id = v_mine;
    RETURN 'updated';
  END IF;

  SELECT dm.id INTO v_mine
    FROM seo.dimension_value_matcher dm
   WHERE dm.site_id = p_site_id AND dm.deleted_at IS NOT NULL
     AND dm.metadata->>'rule_id' = p_rule_id::text
     AND dm.metadata->>'rule_shape' = p_shape
   ORDER BY dm.updated_at DESC LIMIT 1;

  IF v_mine IS NOT NULL THEN
    UPDATE seo.dimension_value_matcher
       SET value_id = p_value_id, kind = p_kind, pattern = v_pattern,
           enabled = p_enabled, notes = p_notes, deleted_at = NULL, updated_at = now()
     WHERE id = v_mine;
    RETURN 'revived';
  END IF;

  INSERT INTO seo.dimension_value_matcher
    (site_id, organization_id, value_id, kind, pattern, enabled, origin, pack_id, notes, metadata)
  VALUES (p_site_id, p_org, p_value_id, p_kind, v_pattern, p_enabled,
          CASE WHEN p_pack_id IS NOT NULL THEN 'pack' ELSE 'human' END,
          p_pack_id, p_notes,
          jsonb_build_object('rule_id', p_rule_id::text, 'rule_shape', p_shape));
  RETURN 'inserted';
END $fn$;

COMMENT ON FUNCTION seo._rule_claim_matcher(uuid, text, uuid, uuid, uuid, text, text, boolean, uuid, text) IS
  'Puts a value rule''s matcher on a value without ever colliding with dvm_identity_uniq. Same claim ladder as seo._rule_claim_worth, plus: a rule that changes its pattern moves its own matcher instead of leaving a duplicate behind.';

-- ── 2. THE SYNC, rewritten onto the claim helpers ───────────────────────────
-- Same three shapes, same enabled ruling (class rules mint enabled = auto_apply
-- after C1 took a site from 917 money keywords to 31,715 in one pass; value
-- rules mint live because createValueRule hardcodes auto_apply false), same
-- identity-not-label lookup so a rename renames. What is new is that every
-- write goes through a claim, and the result reports conflicts instead of
-- raising 23505 in a user's face.
CREATE OR REPLACE FUNCTION seo.fn_value_rule_sync_meaning(p_rule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  r record;
  v_org uuid; v_qual_dim uuid; v_val uuid; v_class_val uuid; v_facet_val uuid;
  v_slug text; v_outcome text;
  v_matchers int := 0; v_worth int := 0; v_retired int := 0; v_conflicts int := 0;
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
    v_outcome := seo._rule_claim_matcher(
      p_rule_id, 'class', r.site_id, v_org, v_class_val,
      COALESCE(r.match_kind, 'contains'), r.pattern,
      r.auto_apply,                      -- the C1 ruling, in one place
      r.pack_id, 'from class rule "' || r.name || '"');
    IF v_outcome = 'conflict' THEN v_conflicts := v_conflicts + 1;
    ELSIF v_outcome <> 'unresolved' THEN v_matchers := v_matchers + 1; END IF;
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

    v_outcome := seo._rule_claim_matcher(
      p_rule_id, 'qualifier', r.site_id, v_org, v_val,
      COALESCE(r.match_kind, 'contains'), r.pattern, true,
      r.pack_id, 'from value rule "' || r.name || '"');
    IF v_outcome = 'conflict' THEN v_conflicts := v_conflicts + 1;
    ELSIF v_outcome <> 'unresolved' THEN v_matchers := v_matchers + 1; END IF;

    v_outcome := seo._rule_claim_worth(
      p_rule_id, 'qualifier', r.site_id, v_org, v_val, r.value_multiplier,
      COALESCE(r.notes, 'from value rule "' || r.name || '"'), r.pack_id);
    IF v_outcome = 'conflict' THEN v_conflicts := v_conflicts + 1;
    ELSIF v_outcome <> 'unresolved' THEN v_worth := v_worth + 1; END IF;
  END IF;

  -- ── SHAPE 3 — multiplier on an existing facet value → worth only ─────────
  -- The AI stamps the facet; this rule only says what that value is worth here.
  -- Its worth sits on a SHARED value, which is exactly where the 23505 lived.
  IF r.value_multiplier IS NOT NULL
     AND r.match_facet IS NOT NULL AND r.match_facet_value IS NOT NULL THEN
    SELECT id INTO v_facet_val FROM platform.categories
     WHERE dimension = 'seo_facet'
       AND slug = r.match_facet || ':' || r.match_facet_value
       AND deleted_at IS NULL;
    v_outcome := seo._rule_claim_worth(
      p_rule_id, 'facet', r.site_id, v_org, v_facet_val, r.value_multiplier,
      COALESCE(r.notes, 'from value rule "' || r.name || '"'), r.pack_id);
    IF v_outcome = 'conflict' THEN v_conflicts := v_conflicts + 1;
    ELSIF v_outcome <> 'unresolved' THEN v_worth := v_worth + 1; END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'rule_id', p_rule_id, 'site_id', r.site_id,
                            'value_id', v_val, 'matchers', v_matchers,
                            'worth', v_worth, 'conflicts', v_conflicts);
END $fn$;

-- ── 2b. The integrity a metadata back-link cannot declare ───────────────────
-- A soft delete goes through the sync above (the AFTER UPDATE trigger). A HARD
-- delete would leave the matcher and worth rows pointing at a rule that no
-- longer exists — the one thing an ON DELETE clause on a real column would have
-- handled. This is that clause.
CREATE OR REPLACE FUNCTION seo.keyword_class_rule_retire_meaning_tg()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.site_id IS NULL THEN RETURN NULL; END IF;
  UPDATE seo.dimension_value_matcher SET deleted_at = now(), updated_at = now()
   WHERE site_id = OLD.site_id AND deleted_at IS NULL
     AND metadata->>'rule_id' = OLD.id::text;
  UPDATE seo.site_value_worth SET deleted_at = now(), updated_at = now()
   WHERE site_id = OLD.site_id AND deleted_at IS NULL
     AND metadata->>'rule_id' = OLD.id::text;
  UPDATE platform.categories SET deleted_at = now(), updated_at = now()
   WHERE dimension = 'seo_facet' AND deleted_at IS NULL
     AND metadata->>'rule_id' = OLD.id::text;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS keyword_class_rule_retire_meaning ON seo.keyword_class_rule;
CREATE TRIGGER keyword_class_rule_retire_meaning
AFTER DELETE ON seo.keyword_class_rule
FOR EACH ROW EXECUTE FUNCTION seo.keyword_class_rule_retire_meaning_tg();

-- ── 3. THE ALARM — does this rule actually change a score? ──────────────────
CREATE OR REPLACE FUNCTION seo.gsc_value_rule_health(p_site_id uuid)
RETURNS TABLE(rule_id uuid, name text, is_class boolean, is_qualifier boolean,
              is_facet boolean, target_class text, pattern text,
              value_multiplier numeric, auto_apply boolean, value_id uuid,
              matchers bigint, enabled_matchers bigint, worth bigint,
              stamps bigint, conflict_rule text, state text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'web', 'pg_temp'
AS $fn$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  RETURN QUERY
  WITH r AS (
    SELECT k.id, k.name, k.target_class, k.pattern, k.value_multiplier,
           k.auto_apply, k.match_facet, k.match_facet_value,
           (k.target_class IS NOT NULL AND NULLIF(btrim(k.pattern), '') IS NOT NULL
            AND k.target_class IN ('money','educational','brand','mismatch')) AS is_class,
           (k.value_multiplier IS NOT NULL AND NULLIF(btrim(k.pattern), '') IS NOT NULL) AS is_qual,
           (k.value_multiplier IS NOT NULL AND k.match_facet IS NOT NULL
            AND k.match_facet_value IS NOT NULL) AS is_facet
      FROM seo.keyword_class_rule k
     WHERE k.site_id = p_site_id AND k.deleted_at IS NULL
  ), v AS (
    SELECT r.*,
           (SELECT c.id FROM platform.categories c
             WHERE c.dimension = 'seo_facet' AND c.deleted_at IS NULL
               AND c.metadata->>'rule_id' = r.id::text LIMIT 1) AS own_value,
           CASE WHEN r.is_facet THEN
             (SELECT c.id FROM platform.categories c
               WHERE c.dimension = 'seo_facet' AND c.deleted_at IS NULL
                 AND c.slug = r.match_facet || ':' || r.match_facet_value LIMIT 1)
           END AS facet_value
      FROM r
  ), counted AS (
    SELECT v.*,
           (SELECT count(*) FROM seo.dimension_value_matcher dm
             WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL
               AND dm.metadata->>'rule_id' = v.id::text) AS n_matchers,
           -- Counted for the CLASS shape alone. A rule is very often both a
           -- class rule and a qualifier rule, and its qualifier matcher is
           -- always live; counting them together would let one live matcher
           -- hide a classification half that is switched off.
           (SELECT count(*) FROM seo.dimension_value_matcher dm
             WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.enabled
               AND dm.metadata->>'rule_id' = v.id::text
               AND dm.metadata->>'rule_shape' = 'class') AS n_enabled,
           (SELECT count(*) FROM seo.site_value_worth w
             WHERE w.site_id = p_site_id AND w.deleted_at IS NULL
               AND w.metadata->>'rule_id' = v.id::text) AS n_worth,
           (SELECT count(DISTINCT kf.keyword_id) FROM seo.keyword_facet kf
             WHERE kf.deleted_at IS NULL
               AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
               AND (kf.matcher_id IN (SELECT dm.id FROM seo.dimension_value_matcher dm
                                       WHERE dm.site_id = p_site_id
                                         AND dm.metadata->>'rule_id' = v.id::text)
                 OR kf.category_id = v.own_value
                 OR kf.category_id = v.facet_value)) AS n_stamps,
           -- Another LIVE rule already owns the worth on the value this rule
           -- wants. Never silent: the reader is told which rule is winning.
           (SELECT o.name FROM seo.site_value_worth w
              JOIN seo.keyword_class_rule o ON o.id = (w.metadata->>'rule_id')::uuid
             WHERE w.site_id = p_site_id AND w.deleted_at IS NULL
               AND w.value_id = COALESCE(v.facet_value, v.own_value)
               AND o.deleted_at IS NULL AND o.id <> v.id LIMIT 1) AS conflict_name
      FROM v
  )
  SELECT c.id, c.name, c.is_class, c.is_qual, c.is_facet, c.target_class, c.pattern,
         c.value_multiplier, c.auto_apply, COALESCE(c.own_value, c.facet_value),
         c.n_matchers, c.n_enabled, c.n_worth, c.n_stamps, c.conflict_name,
         CASE
           -- Nothing mintable on the row at all.
           WHEN NOT (c.is_class OR c.is_qual OR c.is_facet) THEN 'empty'
           -- A facet rule naming a value that does not exist scores nothing and
           -- never will until the dimension carries that value.
           WHEN c.is_facet AND c.facet_value IS NULL AND NOT c.is_qual THEN 'unresolved'
           -- Another rule holds the worth on this value; this one is inert but
           -- for an honest reason, so it is not lumped in with `disconnected`.
           WHEN c.conflict_name IS NOT NULL AND c.n_worth = 0 THEN 'shadowed'
           -- THE C2 CLASS: the rule is complete and mints nothing.
           WHEN (c.is_class OR c.is_qual) AND c.n_matchers = 0 THEN 'disconnected'
           WHEN (c.is_qual OR c.is_facet) AND c.n_worth = 0 THEN 'disconnected'
           -- Deliberately held back, not broken: a class rule that is not
           -- auto_apply mints its matcher disabled by the C1 ruling. Decided on
           -- the CLASS matcher alone, so a dual-shape rule still reports that
           -- its classification half is waiting even while its multiplier bites.
           WHEN c.is_class AND NOT c.auto_apply AND c.n_enabled = 0 THEN 'held'
           WHEN c.n_stamps = 0 THEN 'no_hits'
           ELSE 'live'
         END
    FROM counted c
   ORDER BY c.name;
END $fn$;

REVOKE ALL ON FUNCTION seo.gsc_value_rule_health(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_value_rule_health(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION seo.gsc_value_rule_health(uuid) IS
  'Per value rule: does it actually change a score? empty = nothing mintable on the row; unresolved = it names a dimension value that does not exist; shadowed = another live rule already scores that value; disconnected = complete and mints nothing, the C2 regression class; held = a class rule waiting on auto_apply; no_hits = wired, nothing matched yet; live = scoring. Fix for disconnected is seo.gsc_value_rule_reconnect.';

-- ── 4. The one-click fix behind the alarm ───────────────────────────────────
-- Bounded like the geo one: the engine's default scope is a sequential scan of
-- seo.search_performance_daily (measured 37s on a live site), so this hands it
-- exactly the keywords this site's RULE matchers can reach, plus everything
-- already carrying one of their stamps so removals still happen.
CREATE OR REPLACE FUNCTION seo.gsc_value_rule_reconnect(p_site_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  x record; v_rules int := 0; v_conflicts int := 0; v_res jsonb; v_ids uuid[]; v_one jsonb;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  FOR x IN SELECT id FROM seo.keyword_class_rule WHERE site_id = p_site_id LOOP
    v_one := seo.fn_value_rule_sync_meaning(x.id);
    v_rules := v_rules + 1;
    v_conflicts := v_conflicts + COALESCE((v_one->>'conflicts')::int, 0);
  END LOOP;

  SELECT array_agg(DISTINCT y.kw) INTO v_ids FROM (
    SELECT k.id AS kw
      FROM seo.keyword k
      JOIN seo.dimension_value_matcher dm
        ON dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.enabled
       AND dm.metadata ? 'rule_id' AND dm.pattern IS NOT NULL
       AND ((dm.kind = 'contains'    AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(dm.pattern) || '%')
         OR (dm.kind = 'exact'       AND k.normalized_phrase = dm.pattern)
         OR (dm.kind = 'starts_with' AND k.normalized_phrase LIKE seo.gsc_perf_like_escape(dm.pattern) || '%')
         OR (dm.kind = 'ends_with'   AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(dm.pattern))
         OR (dm.kind = 'word'        AND k.normalized_phrase ~ ('\m' || dm.pattern || '\M')))
     WHERE k.deleted_at IS NULL
    UNION
    SELECT kf.keyword_id
      FROM seo.keyword_facet kf
     WHERE kf.site_id = p_site_id AND kf.deleted_at IS NULL
       AND kf.matcher_id IN (SELECT dm.id FROM seo.dimension_value_matcher dm
                              WHERE dm.site_id = p_site_id AND dm.metadata ? 'rule_id')
  ) y WHERE y.kw IS NOT NULL;

  v_res := seo.fn_evaluate_matchers_internal(p_site_id, COALESCE(v_ids, '{}'::uuid[]));
  RETURN jsonb_build_object('rules_synced', v_rules, 'conflicts', v_conflicts) || v_res;
END $fn$;

REVOKE ALL ON FUNCTION seo.gsc_value_rule_reconnect(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_value_rule_reconnect(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION seo.gsc_value_rule_reconnect(uuid) IS
  'Re-mints every value rule''s meaning for a site and re-runs the matcher engine over exactly the keywords those rules can reach. The one-click fix behind the "this rule changes no score" alarm.';

-- ── 5. Meaning health learns the disconnected-RULES line ────────────────────
-- Replaced from the LIVE body (verified with pg_get_functiondef), not from the
-- copy in migrations/. The only change is the new `rules` branch.
CREATE OR REPLACE FUNCTION seo.gsc_site_meaning_health(p_site_id uuid)
 RETURNS TABLE(area text, severity text, headline text, detail text, count_value bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'pg_temp'
AS $function$
DECLARE
  v_geo_total bigint; v_geo_inert bigint; v_geo_disconnected bigint;
  v_rules bigint; v_facet_rules bigint; v_rules_disconnected bigint;
  v_topics bigint; v_kw_on_tree bigint;
  v_dims_not_ready bigint; v_dims_no_abstain bigint;
  v_bands_site bigint;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  -- An area is finished when it names gazetteer places OR typed words (I3);
  -- only an area with neither is a shell that matches nothing.
  SELECT count(*),
         count(*) FILTER (WHERE COALESCE(jsonb_array_length(g.match_tokens), 0) = 0
                            AND COALESCE(array_length(g.place_ids, 1), 0) = 0)
    INTO v_geo_total, v_geo_inert
  FROM seo.site_geo_area g WHERE g.site_id = p_site_id AND g.deleted_at IS NULL;

  -- …and an area that is FULL and still has no matchers is worse: it looks
  -- finished on every screen and changes no score at all. That is exactly the
  -- state C2 left every site in, so it gets its own line and never hides
  -- inside the "no places yet" count.
  SELECT count(*) INTO v_geo_disconnected
  FROM seo.gsc_geo_area_health(p_site_id) h WHERE h.state = 'disconnected';

  SELECT count(*), count(*) FILTER (WHERE r.match_facet IS NOT NULL)
    INTO v_rules, v_facet_rules
  FROM seo.keyword_class_rule r
  WHERE r.site_id = p_site_id AND r.deleted_at IS NULL AND r.value_multiplier IS NOT NULL;

  -- The rules half of the same silence (2026-08-24): a rule that is complete on
  -- the screen and mints no matcher and no worth.
  SELECT count(*) INTO v_rules_disconnected
  FROM seo.gsc_value_rule_health(p_site_id) h WHERE h.state = 'disconnected';

  SELECT count(*) INTO v_topics
  FROM seo.site_topic_value t WHERE t.site_id = p_site_id AND t.deleted_at IS NULL;

  SELECT count(DISTINCT kt.keyword_id) INTO v_kw_on_tree
  FROM seo.keyword_topic kt WHERE kt.is_primary AND kt.deleted_at IS NULL;

  SELECT count(*) INTO v_bands_site
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'value_band'
    AND sv.active AND sv.deleted_at IS NULL;

  SELECT count(*) FILTER (WHERE NOT r.is_ready),
         count(*) FILTER (WHERE r.is_ready AND NOT r.can_abstain)
    INTO v_dims_not_ready, v_dims_no_abstain
  FROM platform.categories c
  CROSS JOIN LATERAL seo.facet_dimension_readiness(c.id) r
  WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND (COALESCE(c.metadata->>'scope','platform') = 'platform'
         OR (c.metadata->>'site_id')::uuid = p_site_id);

  IF v_geo_disconnected > 0 THEN
    RETURN QUERY SELECT 'geo', 'inert',
      format('%s service area%s full of places but not connected to scoring',
             v_geo_disconnected, CASE WHEN v_geo_disconnected = 1 THEN '' ELSE 's' END),
      'The places are named, but nothing links them to your value tiers, so these areas change no score at all — the worst state a setting can be in, because every screen shows them as finished. Open the Rulebook and reconnect them; it takes one click and nothing you typed is lost.',
      v_geo_disconnected;
  END IF;

  -- Geo areas that were labelled but never given the places they stand for.
  IF v_geo_inert > 0 THEN
    RETURN QUERY SELECT 'geo', 'inert',
      format('%s of your %s service areas match nothing', v_geo_inert, v_geo_total),
      'They have a name and a band but no places in them — no picked place, no typed name — so no keyword has ever matched one. Until you say which towns, cities or regions each stands for, geography counts for nothing in your value tiers.',
      v_geo_inert;
  ELSIF v_geo_total = 0 THEN
    RETURN QUERY SELECT 'geo', 'gap',
      'No service areas yet',
      'Nothing tells the system which places are worth your money. Add your ideal area and the ones you will accept, and "near me in the wrong city" stops counting as a win.',
      0::bigint;
  ELSIF v_geo_disconnected = 0 THEN
    RETURN QUERY SELECT 'geo', 'ok',
      format('%s service areas, all with places in them', v_geo_total),
      'Every area names the places it stands for, so location counts in the value of every search that mentions one. When several areas match the same search the lowest multiplier wins — a place you never serve beats a place you love.',
      v_geo_total;
  END IF;

  -- Rules. The inert line comes FIRST and is never folded into the count of
  -- rules you have: a rule that changes nothing is worse than a missing one,
  -- because the screen already told you it was written.
  IF v_rules_disconnected > 0 THEN
    RETURN QUERY SELECT 'rules', 'inert',
      format('%s value rule%s written but not connected to scoring',
             v_rules_disconnected, CASE WHEN v_rules_disconnected = 1 THEN '' ELSE 's' END),
      'The words and the multipliers are typed, but nothing links them to your value tiers, so these rules change no score at all. Open the Rulebook and reconnect them; it takes one click and nothing you typed is lost.',
      v_rules_disconnected;
  END IF;

  IF v_rules = 0 THEN
    RETURN QUERY SELECT 'rules', 'gap',
      'No value rules yet',
      'This is where a word changes what a keyword is worth — "free" pulling value down, "certified" pushing it up. Without any, every keyword leans entirely on its topic.',
      0::bigint;
  ELSIF v_rules_disconnected = 0 THEN
    RETURN QUERY SELECT 'rules', 'ok',
      format('%s value rules, %s of them reading a dimension', v_rules, v_facet_rules),
      'Rules that read a dimension only fire on keywords the classifier has actually looked at.',
      v_rules;
  END IF;

  -- The tree.
  IF v_topics = 0 THEN
    RETURN QUERY SELECT 'topics', 'gap',
      'No topic is worth anything yet',
      'Nothing has been ruled as something you sell, so no keyword can be traced to money. This is the first thing to fill in.',
      0::bigint;
  ELSE
    RETURN QUERY SELECT 'topics', 'ok',
      format('%s topics carry a worth for this site', v_topics),
      format('%s keywords across the platform have a primary topic. The topic tree is shared; what each topic is WORTH is yours. Only keywords on the tree can be traced up to something you sell — everything else is honestly unvalued. The topics screen reports this site''s own split.', v_kw_on_tree),
      v_topics;
  END IF;

  -- Dimensions.
  IF v_dims_not_ready > 0 THEN
    RETURN QUERY SELECT 'dimensions', 'inert',
      format('%s dimensions are not being applied', v_dims_not_ready),
      'A dimension needs at least two real choices. With only one, the AI would be forced to stamp it on everything, so it is held back until you add another.',
      v_dims_not_ready;
  END IF;
  IF v_dims_no_abstain > 0 THEN
    RETURN QUERY SELECT 'dimensions', 'gap',
      format('%s dimensions cannot say "not clear"', v_dims_no_abstain),
      'On these the AI must pick a value even when the words do not say — so some answers are guesses that look like facts.',
      v_dims_no_abstain;
  END IF;

  -- Bands.
  IF v_bands_site = 0 THEN
    RETURN QUERY SELECT 'bands', 'gap',
      'Using the platform''s starter tiers',
      'The tier names and thresholds are still ours, not yours. Rename them in your language and the whole page relabels.',
      0::bigint;
  END IF;
END;
$function$;

-- ── 6. BACKFILL — every rule on every site, idempotently ────────────────────
-- The previous migration backfilled the ownership LINK but never ran the sync,
-- so rules authored between C1 and the trigger still mint nothing. This is the
-- loop the geo fix ended with, and it is now safe to run because §1 claims
-- instead of colliding.
DO $do$
DECLARE x record;
BEGIN
  FOR x IN SELECT id FROM seo.keyword_class_rule WHERE site_id IS NOT NULL ORDER BY created_at LOOP
    PERFORM seo.fn_value_rule_sync_meaning(x.id);
  END LOOP;
END $do$;
