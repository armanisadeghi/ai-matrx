-- ddl_guard_log_ack_contract.sql — give platform.ddl_guard_log a READER and an
-- ACK CONTRACT. (Drift-audit adjudication 2026-08-21, enforcement recommendation
-- "give ddl_guard_log its reader"; 2026-08-15 architecture drift audit §1.)
--
-- THE PROBLEM THIS CLOSES
-- -----------------------
-- The DDL sentinel has been writing WARN/NOTICE rows since 2026-08-13. On
-- 2026-08-21 the table held 865 rows and EVERY ONE had acknowledged_at IS NULL,
-- because nothing on the platform read the table and nothing could write the
-- column. A guard whose findings nobody reads is not enforcement, it is a log
-- file: 68 hand_rolled_entity firings sat there unseen for a week.
--
-- WHAT THIS ADDS (no behaviour change to the guard itself)
--   1. ack_reason / acknowledged_by columns + a CHECK that makes the REASON
--      MANDATORY. An ack without a reason is exactly the unreviewed silence the
--      audit found; the constraint makes that state unrepresentable.
--   2. platform.ddl_guard_ack(...) — the ONLY supported write path. Requires a
--      selector (ids, rule, or object_ref), requires a >= 12-char reason, and
--      NEVER overwrites an existing ack.
--   3. platform.ddl_guard_unacked — the per-rule reader view.
--   4. public.__ddl_guard_unacked() — the PostgREST-callable projection the
--      release gate (scripts/check-ddl-guard-log.ts) and the canonicalization
--      admin page read. `public` keeps functions/RPCs, no tables (doctrine §7).
--
-- Read-only toward every other schema. No table is canonicalized here.

-- 1. Columns + the reason contract ------------------------------------------
ALTER TABLE platform.ddl_guard_log
  ADD COLUMN IF NOT EXISTS ack_reason text,
  ADD COLUMN IF NOT EXISTS acknowledged_by text;

COMMENT ON COLUMN platform.ddl_guard_log.ack_reason IS
  'Why this firing was accepted. MANDATORY whenever acknowledged_at is set — this column IS the "reviewed, deliberate" record.';
COMMENT ON COLUMN platform.ddl_guard_log.acknowledged_by IS
  'Who acknowledged: an agent/task label or a human name. Defaults to current_user.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'platform.ddl_guard_log'::regclass
      AND conname = 'ddl_guard_log_ack_needs_reason'
  ) THEN
    ALTER TABLE platform.ddl_guard_log
      ADD CONSTRAINT ddl_guard_log_ack_needs_reason
      CHECK (
        acknowledged_at IS NULL
        OR (ack_reason IS NOT NULL AND length(btrim(ack_reason)) >= 12)
      );
  END IF;
END $$;

-- 2. The one supported write path -------------------------------------------
CREATE OR REPLACE FUNCTION platform.ddl_guard_ack(
  p_reason      text,
  p_by          text        DEFAULT NULL,
  p_ids         bigint[]    DEFAULT NULL,
  p_rule        text        DEFAULT NULL,
  p_object_ref  text        DEFAULT NULL,
  p_before      timestamptz DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 12 THEN
    RAISE EXCEPTION 'ddl_guard_ack: a reason of at least 12 characters is REQUIRED'
      USING HINT = 'The reason is the reviewed-and-deliberate record. "ok"/"fine"/NULL is the state this contract exists to forbid.',
            ERRCODE = 'check_violation';
  END IF;

  IF p_ids IS NULL AND p_rule IS NULL AND p_object_ref IS NULL THEN
    RAISE EXCEPTION 'ddl_guard_ack: pass a selector (p_ids, p_rule, or p_object_ref)'
      USING HINT = 'A blanket ack of the whole table is never a review.',
            ERRCODE = 'check_violation';
  END IF;

  UPDATE platform.ddl_guard_log
     SET acknowledged_at = now(),
         ack_reason      = btrim(p_reason),
         acknowledged_by = COALESCE(NULLIF(btrim(COALESCE(p_by, '')), ''), current_user)
   WHERE acknowledged_at IS NULL            -- never overwrite an existing ack
     AND (p_ids        IS NULL OR id         = ANY (p_ids))
     AND (p_rule       IS NULL OR rule       = p_rule)
     AND (p_object_ref IS NULL OR object_ref = p_object_ref)
     AND (p_before     IS NULL OR occurred_at < p_before);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

COMMENT ON FUNCTION platform.ddl_guard_ack(text,text,bigint[],text,text,timestamptz) IS
  'Acknowledge ddl_guard_log firings. Reason mandatory, selector mandatory, existing acks immutable. Returns rows acknowledged.';

REVOKE ALL ON FUNCTION platform.ddl_guard_ack(text,text,bigint[],text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.ddl_guard_ack(text,text,bigint[],text,text,timestamptz) TO service_role;

-- 3. The reader view ---------------------------------------------------------
CREATE OR REPLACE VIEW platform.ddl_guard_unacked AS
SELECT rule,
       severity,
       count(*)::int                                    AS unacked_rows,
       count(DISTINCT object_ref)::int                  AS unacked_objects,
       min(occurred_at)                                 AS first_seen,
       max(occurred_at)                                 AS last_seen,
       (array_agg(DISTINCT object_ref ORDER BY object_ref))[1:6] AS sample_objects
FROM platform.ddl_guard_log
WHERE acknowledged_at IS NULL
GROUP BY rule, severity;

COMMENT ON VIEW platform.ddl_guard_unacked IS
  'Per-rule backlog of unacknowledged DDL-sentinel firings. The reader the 2026-08-15 drift audit found missing.';

-- 4. The PostgREST projection the gate + admin page call ---------------------
CREATE OR REPLACE FUNCTION public.__ddl_guard_unacked()
RETURNS TABLE (
  rule            text,
  severity        text,
  unacked_rows    int,
  unacked_objects int,
  first_seen      timestamptz,
  last_seen       timestamptz,
  sample_objects  text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT v.rule, v.severity, v.unacked_rows, v.unacked_objects,
         v.first_seen, v.last_seen, v.sample_objects
  FROM platform.ddl_guard_unacked v
  ORDER BY v.unacked_rows DESC, v.rule;
$$;

COMMENT ON FUNCTION public.__ddl_guard_unacked() IS
  'Read-only per-rule unacknowledged DDL-guard summary for scripts/check-ddl-guard-log.ts and /administration/database/canonicalization.';

REVOKE ALL ON FUNCTION public.__ddl_guard_unacked() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.__ddl_guard_unacked() TO anon, authenticated, service_role;
