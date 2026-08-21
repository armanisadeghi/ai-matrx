-- verify_canonical_restricted_pub_read_and_seo_soft_delete.sql
--
-- Follow-on to soft_delete_and_visibility_positive_adds.sql, same rule (Arman,
-- 2026-08-21: if it is a safe positive add, do it rather than sit uncertified).
-- Two findings that only became visible once that migration ran and the audit
-- store was refreshed.
--
-- E. THE CHECKER DISAGREES WITH ITS OWN GENERATOR (pre-existing, cost: 3 tables).
--    `iam.apply_rls`'s `restricted` lane emits a `pub_read` anon policy whenever
--    the table has a `visibility` column — but `iam.verify_canonical`'s
--    `policies_canonical` expectation list only appends `pub_read` for
--    `entity`/`system`. So a restricted table with visibility is generated
--    correctly by the canonical generator and then FAILED by the canonical gate
--    for having exactly the policy the generator just wrote.
--
--    db-rules §11 already names this class: "If you see a check disagree with
--    `apply_rls`, suspect the check." Live census before the fix — every
--    restricted+visibility table in this state:
--      ai.api, ai.endpoint, ai.offering  → 1 FAIL / 0 WARN, uncertified, all
--                                          three purely from this bug
--      browser.stream_ticket, chat.coding_session → the same FAIL, surfaced by
--                                          the previous migration re-running
--                                          apply_rls on them
--    The fix is one word in the variant list. It certifies 4 of those 5
--    (stream_ticket keeps its separate `legacy_owner_col` WARN).
--
-- F. Two more soft_delete WARN-only tables, missed by the first pass only
--    because of WHEN the census was taken: `seo.landscape_brief` still had
--    hard FAILs at that moment (repaired since by the parallel canonicalization
--    session) and `seo.page_measurement_health` was not yet in the refreshed
--    audit snapshot. Same treatment as group A.
--
-- Patched in place rather than re-pasted, for the same reason as part C of the
-- previous migration: shared checkout, gate function under concurrent edit.

BEGIN;

-- ─── E. restricted tables may have pub_read ────────────────────────────────
DO $$
DECLARE
  v_def text;
  v_anchor CONSTANT text := 'IF v_variant IN (''entity'',''system'') AND f_vis_enum THEN';
  v_new    CONSTANT text := 'IF v_variant IN (''entity'',''system'',''restricted'') AND f_vis_enum THEN';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='iam' AND p.proname='verify_canonical';

  IF v_def IS NULL THEN RAISE EXCEPTION 'E: iam.verify_canonical not found'; END IF;

  IF position(v_new IN v_def) > 0 THEN
    RAISE NOTICE 'E: restricted already in the pub_read expectation list — nothing to do';
    RETURN;
  END IF;

  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'E: expected exactly one pub_read expectation anchor; refusing to patch';
  END IF;

  EXECUTE replace(v_def, v_anchor, v_new);
END $$;

-- Proof: the three tables that were failing on this alone are clean now, and a
-- restricted table WITHOUT visibility still refuses an unexpected pub_read.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM (VALUES ('ai','api','ai_api'),('ai','endpoint','ai_endpoint'),('ai','offering','ai_offering'),
               ('chat','coding_session','coding_session')) AS t(s,tb,tok),
       LATERAL iam.verify_canonical(t.s,t.tb,t.tok,'restricted') v
  WHERE v.check_name='policies_canonical' AND v.status <> 'PASS';
  IF n <> 0 THEN
    RAISE EXCEPTION 'E: % restricted table(s) still fail policies_canonical', n;
  END IF;
END $$;

-- ─── F. deleted_at on the two late-surfacing seo tables ────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('seo','landscape_brief',         'seo_landscape_brief'),
      ('seo','page_measurement_health', 'seo_page_measurement_health')
    ) AS v(s,t,tok)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = format('%I.%I', r.s, r.t)::regclass
        AND a.attname='deleted_at' AND a.attnum>0 AND NOT a.attisdropped
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN deleted_at timestamptz', r.s, r.t);
      EXECUTE format('COMMENT ON COLUMN %I.%I.deleted_at IS %L', r.s, r.t,
        'Soft delete: NULL = live (db-rules §8). Authenticated RLS deliberately does NOT filter this; the app filters, and anon pub_read does.');
    END IF;
    UPDATE platform.entity_types SET has_soft_delete = true
     WHERE token = r.tok AND COALESCE(has_soft_delete,false) = false;
  END LOOP;
END $$;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM platform.entity_types et
  WHERE et.token IN ('seo_landscape_brief','seo_page_measurement_health')
    AND et.has_soft_delete
    AND EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema=et.schema_name AND c.table_name=et.table_name
                  AND c.column_name='deleted_at');
  IF n <> 2 THEN RAISE EXCEPTION 'F: expected 2 soft-delete-capable seo tokens, found %', n; END IF;
END $$;

-- Both are `component` variants: the component lane emits no deleted_at prefix
-- and no anon lane, so no policy regeneration is needed or wanted here.

COMMIT;
