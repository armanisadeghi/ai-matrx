-- NO NULL ORG — platform.assists, the DERIVABLE half
-- =====================================================================
-- Owner ruling, 2026-08-21 (db-rules FEATURE.md §2 / §6e): NULL is never a
-- scope, and "no active/preferred/personal/first-org fallback is legal".
--
-- WHY assists WERE NULL AT ALL — the mechanism, not the vibe.
-- `platform.assists.organization_id` is nullable, and migration 0135 attaches
-- `public._stamp_org_default` ONLY to tables whose org column is already NOT
-- NULL. So this table has no backstop, and its RLS `std_insert` explicitly
-- permits `organization_id IS NULL`. The browser producer
-- (matrx-frontend features/assists/service.ts `emitAssist`) simply had no
-- `organization_id` key in its payload, and the Redux mirror hardcoded
-- `organization_id: null`. Nine client producers route through it. Nothing
-- anywhere objected. THAT WRITER IS FIXED in the same change as this migration:
-- `emitAssist` now takes `organizationId` as a REQUIRED positional argument and
-- refuses to write without it, and `emitAssistTracked` supplies the explicitly
-- chosen org (`selectOrganizationId`, never the legacy effective-org fallback),
-- emitting nothing when the user has not chosen one.
--
-- WHAT THIS MIGRATION DOES, AND DELIBERATELY DOES NOT DO.
-- It backfills ONLY the rows whose organization is genuinely DERIVABLE: an
-- assist that names an entity belongs to that entity's organization. Measured
-- live 2026-08-29, of 119 NULL-org rows:
--
--   65 name a registered entity whose org is present, and every one resolves:
--        seo_competitor → seo.competitor    36 rows, 36 with an org
--        web_site       → web.site          18 rows, 18 with an org
--        web_page       → web.page          11 rows, 11 with an org
--   10 name entity_type='kind_definition', which is NOT in platform.entity_types
--      — there is no registered table to resolve it against.
--   44 name no entity at all (entity_id IS NULL): rollups and session-close
--      notices like 'content_plan.missing_keywords', 'notes.unorganized'.
--
-- 🚨 THE OTHER 54 ARE REPORTED, NOT GUESSED. Their addressees each belong to
-- FOUR TO NINE organizations, so "the user's org" is not a fact the row
-- contains — picking one would be the invention §2 forbids, and one of the
-- three addressees even has TWO personal orgs, so the personal-org shortcut is
-- not well-defined either. The honest output for a non-derivable row is a
-- report, and this file is where that report lives. They stay NULL, they stay
-- BELOW the ratchet baseline (54 < 116), and they stay visible.
--
-- NO NOT NULL FLIP HERE, on purpose. With 54 legitimately unresolvable rows the
-- column cannot be flipped today, and flipping it would also require the FK and
-- backstop work that only makes sense once those 54 have an answer. The writer
-- fix stops the bleeding; this stops the derivable debt; the remainder is a
-- named, measured item for the lane that owns assists, not a guess made here.

BEGIN;

-- ── 1. Pre-state, and the exact target set ─────────────────────────────────
CREATE TEMP TABLE _assist_org_targets ON COMMIT DROP AS
SELECT a.id, e.org AS derived_org
  FROM platform.assists a
  JOIN LATERAL (
    SELECT CASE a.entity_type
             WHEN 'seo_competitor' THEN (SELECT c.organization_id FROM seo.competitor c WHERE c.id = a.entity_id)
             WHEN 'web_site'       THEN (SELECT s.organization_id FROM web.site s      WHERE s.id = a.entity_id)
             WHEN 'web_page'       THEN (SELECT p.organization_id FROM web.page p      WHERE p.id = a.entity_id)
           END AS org
  ) e ON true
 WHERE a.organization_id IS NULL
   AND a.entity_id IS NOT NULL
   AND e.org IS NOT NULL;

CREATE TEMP TABLE _assist_org_pre ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM platform.assists)                                   AS total_rows,
  (SELECT count(*) FROM platform.assists WHERE organization_id IS NULL)     AS null_org,
  (SELECT count(*) FROM _assist_org_targets)                                AS targets,
  (SELECT coalesce(md5(string_agg(id::text || ':' || coalesce(organization_id::text,'~'), ',' ORDER BY id)), '')
     FROM platform.assists
    WHERE id NOT IN (SELECT id FROM _assist_org_targets))                   AS untouched_fingerprint;

DO $$
DECLARE p record;
BEGIN
  SELECT * INTO p FROM _assist_org_pre;
  RAISE NOTICE 'NO NULL ORG / platform.assists: % NULL-org row(s); % derivable from a named entity; % will be REPORTED, not guessed.',
               p.null_org, p.targets, p.null_org - p.targets;
  IF p.targets = 0 THEN
    RAISE EXCEPTION 'ABORT: nothing derivable — the premise of this migration no longer holds.';
  END IF;
END $$;

-- ── 2. Backfill: an assist about an entity belongs to that entity's org ────
UPDATE platform.assists a
   SET organization_id = t.derived_org
  FROM _assist_org_targets t
 WHERE t.id = a.id;

-- ── 3. Prove exactly the target set moved, and nothing else ────────────────
DO $$
DECLARE p record; v_total int; v_null int; v_fp text; v_bad int;
BEGIN
  SELECT * INTO p FROM _assist_org_pre;
  SELECT count(*) INTO v_total FROM platform.assists;
  SELECT count(*) INTO v_null  FROM platform.assists WHERE organization_id IS NULL;

  IF v_total <> p.total_rows THEN
    RAISE EXCEPTION 'ABORT: row count changed (% -> %). A backfill creates and destroys nothing.', p.total_rows, v_total;
  END IF;

  -- CHECKSUM DISCIPLINE: every row OUTSIDE the target set must be bit-identical,
  -- NULLs included (coalesced to '~' so a NULL that changed cannot hide).
  SELECT coalesce(md5(string_agg(id::text || ':' || coalesce(organization_id::text,'~'), ',' ORDER BY id)), '')
    INTO v_fp
    FROM platform.assists
   WHERE id NOT IN (SELECT id FROM _assist_org_targets);
  IF v_fp <> p.untouched_fingerprint THEN
    RAISE EXCEPTION 'ABORT: rows outside the derivable target set changed.';
  END IF;

  -- Exactly the targeted rows lost their NULL.
  IF v_null <> p.null_org - p.targets THEN
    RAISE EXCEPTION 'ABORT: expected % NULL-org row(s) to remain, found %.', p.null_org - p.targets, v_null;
  END IF;

  -- Every backfilled row agrees with the entity it names. Derivation, not guess.
  SELECT count(*) INTO v_bad
    FROM platform.assists a
    JOIN _assist_org_targets t ON t.id = a.id
   WHERE a.organization_id IS DISTINCT FROM t.derived_org;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'ABORT: % backfilled assist(s) disagree with their entity''s org.', v_bad;
  END IF;

  RAISE NOTICE 'NO NULL ORG / platform.assists: backfilled % row(s) from their named entity; % remain NULL and NON-DERIVABLE (reported, below the ratchet baseline of 116); untouched rows bit-identical.',
               p.targets, v_null;
END $$;

COMMIT;
