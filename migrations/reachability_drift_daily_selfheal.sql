-- Reachability drift — daily self-heal + incident — 2026-08-21
--
-- APPROVAL (required by common-docs/policies/no-unapproved-schedules.md):
--   Arman, 2026-08-21, by name and interval: "Daily + self-heal".
--   Name: `reachability-drift-selfheal`  ·  Interval: daily, 09:10 UTC (02:10 PT).
--   Registered in common-docs/operations/scheduled-tasks.md.
--
-- Completes the 2026-08-15 architecture drift audit, finding 8, risk (2). The
-- guards shipped in `reachability_standing_guards.sql` measure the cache but
-- nothing ran them on a cadence, so `platform.reachability` could sit wrong for
-- an unbounded time between release gates while `iam.has_access` kept trusting
-- it. This adds the cadence and the response.
--
-- The doctrine (access/FEATURE.md §4.5): non-zero drift is a DEFECT, never
-- routine maintenance. A cache that needed healing means a write path or a
-- trigger stopped working. So the response is BOTH halves — heal the users'
-- access immediately, AND file the firing loudly enough that a human triages
-- the cause. Healing without filing would convert a broken write path into a
-- permanently invisible nightly repair.
--
-- MUTATION BOUNDARY: the guarded rebuild below is the ONLY write this migration
-- introduces to platform.reachability. The drift check, the parity check and the
-- report are read-only, and the rebuild only ever runs behind a non-zero drift
-- measurement.

-- ---------------------------------------------------------------------------
-- 1. The wrapper: measure -> (heal + file) -> re-verify
-- ---------------------------------------------------------------------------
-- Returns a jsonb receipt of what it saw and did. Structured as measure-first so
-- the disagreeing rows are captured BEFORE the rebuild destroys the evidence:
-- once `rebuild_reachability()` truncates, nobody can ever reconstruct what was
-- wrong, and "the cache was broken, we don't know how" is not a triageable
-- defect. The drift walk is MATERIALIZED so the expensive derivation runs once.
CREATE OR REPLACE FUNCTION platform.heal_reachability_drift()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
-- The drift check is a full re-derivation of every container (measured
-- 2026-08-21: 468 containers / 4,476 rows / a few seconds) and this function
-- runs it twice around a rebuild. Give it room rather than inheriting whatever
-- statement_timeout the cron role happens to carry.
SET statement_timeout TO '10min'
AS $function$
DECLARE
  v_before     bigint;
  v_by_kind    jsonb;
  v_sample     jsonb;
  v_rebuilt    bigint;
  v_after      bigint;
  v_containers bigint;
  v_open_id    uuid;
BEGIN
  -- --- Measure -----------------------------------------------------------
  WITH d AS MATERIALIZED (
    SELECT * FROM platform.reachability_drift()
  )
  SELECT
    (SELECT count(*) FROM d),
    COALESCE((SELECT jsonb_object_agg(k.disagreement, k.n)
              FROM (SELECT dd.disagreement, count(*) AS n
                    FROM d dd GROUP BY 1) k), '{}'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(s))
              FROM (SELECT * FROM d
                    ORDER BY disagreement, container_type, container_id,
                             item_type, item_id
                    LIMIT 25) s), '[]'::jsonb)
  INTO v_before, v_by_kind, v_sample;

  SELECT count(*) INTO v_containers
  FROM (SELECT DISTINCT ce.container_type, ce.container_id
        FROM platform.containment_edges ce) c;

  -- --- Clean: the expected nightly outcome. Nothing to heal, nothing to file.
  IF v_before = 0 THEN
    RETURN jsonb_build_object(
      'drift_before', 0,
      'healed',       false,
      'containers',   v_containers,
      'cached_rows',  (SELECT count(*) FROM platform.reachability),
      'checked_at',   now()
    );
  END IF;

  RAISE WARNING 'heal_reachability_drift: % disagreeing row(s) % — healing',
    v_before, v_by_kind;

  -- --- Heal --------------------------------------------------------------
  -- The ONLY mutation path. Takes its own advisory xact lock internally.
  v_rebuilt := platform.rebuild_reachability();

  -- --- Re-verify ---------------------------------------------------------
  -- Proves the heal actually worked. A rebuild that leaves drift behind means
  -- the derivation itself disagrees with itself (non-determinism, or a mutating
  -- graph mid-run) — strictly worse news than the original drift.
  SELECT count(*) INTO v_after FROM platform.reachability_drift();

  -- --- File ---------------------------------------------------------------
  -- ops.system_error is the forensic sink and the triage queue; this row is a
  -- first-class defect, not a log line. One OPEN alarm at a time (the
  -- history.ensure_row_version_partitions convention) — a write path that stays
  -- broken must not manufacture a new ticket every night, but each recurrence
  -- has to be visible on the one that is open.
  SELECT e.id INTO v_open_id
  FROM ops.system_error e
  WHERE e.kind = 'reachability_drift_detected'
    AND e.resolved_at IS NULL
  ORDER BY e.occurred_at DESC
  LIMIT 1;

  IF v_open_id IS NULL THEN
    INSERT INTO ops.system_error (
      kind, error_type, source_app, route, error_text, context, metadata
    ) VALUES (
      'reachability_drift_detected',
      'ReachabilityCacheDrift',
      'postgres-cron',
      'cron:reachability-drift-selfheal',
      format(
        'platform.reachability disagreed with a fresh derivation on %s row(s) %s '
        '(across %s containers). The cache was self-healed by '
        'platform.rebuild_reachability() (%s rows rebuilt) and re-checked: %s. '
        'ACCESS IS RESTORED, BUT THIS IS A DEFECT — a trigger-maintained cache '
        'that needed healing means an association write path or '
        'trg_associations_reachability stopped working. Find the write path '
        'before resolving. Evidence sample in context.drift_sample.',
        v_before, v_by_kind, v_containers, v_rebuilt,
        CASE WHEN v_after = 0
             THEN 'clean'
             ELSE format('STILL %s DISAGREEING ROW(S) — HEAL FAILED', v_after)
        END
      ),
      jsonb_build_object(
        'drift_before',   v_before,
        'drift_by_kind',  v_by_kind,
        'drift_sample',   v_sample,
        'rebuilt_rows',   v_rebuilt,
        'drift_after',    v_after,
        'heal_confirmed', (v_after = 0),
        'containers',     v_containers,
        'first_seen_at',  now(),
        'occurrences',    1
      ),
      jsonb_build_object(
        'severity',   CASE WHEN v_after = 0 THEN 'high' ELSE 'critical' END,
        'guard',      'reachability',
        'self_healed', true
      )
    );
  ELSE
    -- Already open: fold this firing into it rather than duplicating the ticket.
    UPDATE ops.system_error e
    SET context = e.context
                || jsonb_build_object(
                     'occurrences',   COALESCE((e.context->>'occurrences')::int, 1) + 1,
                     'last_seen_at',  now(),
                     'drift_before',  v_before,
                     'drift_by_kind', v_by_kind,
                     'drift_sample',  v_sample,
                     'rebuilt_rows',  v_rebuilt,
                     'drift_after',   v_after,
                     'heal_confirmed', (v_after = 0)
                   ),
        metadata = e.metadata
                || jsonb_build_object(
                     'severity', CASE WHEN v_after = 0 THEN 'high' ELSE 'critical' END
                   )
    WHERE e.id = v_open_id;
  END IF;

  IF v_after > 0 THEN
    RAISE WARNING 'heal_reachability_drift: rebuild did NOT converge — % row(s) still disagree', v_after;
  END IF;

  RETURN jsonb_build_object(
    'drift_before',   v_before,
    'drift_by_kind',  v_by_kind,
    'healed',         true,
    'rebuilt_rows',   v_rebuilt,
    'drift_after',    v_after,
    'heal_confirmed', (v_after = 0),
    'containers',     v_containers,
    'incident',       CASE WHEN v_open_id IS NULL THEN 'filed' ELSE 'folded_into_open' END,
    'checked_at',     now()
  );
END $function$;

COMMENT ON FUNCTION platform.heal_reachability_drift() IS
  'Daily self-heal (Arman-approved 2026-08-21, "Daily + self-heal", job reachability-drift-selfheal): runs platform.reachability_drift(); zero = done; non-zero = capture evidence, platform.rebuild_reachability(), re-verify, and file ops.system_error kind=reachability_drift_detected. Non-zero drift is a defect, never routine maintenance.';

REVOKE ALL ON FUNCTION platform.heal_reachability_drift() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.heal_reachability_drift() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Super-admin path, mirroring public.admin_reachability_guard_report()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_heal_reachability_drift()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN platform.heal_reachability_drift();
END $function$;

COMMENT ON FUNCTION public.admin_heal_reachability_drift() IS
  'Super-admin on-demand run of the daily reachability self-heal (platform.heal_reachability_drift), mirroring admin_rebuild_reachability / admin_reachability_guard_report.';

REVOKE ALL ON FUNCTION public.admin_heal_reachability_drift() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_heal_reachability_drift() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The schedule (pg_cron) — APPROVED 2026-08-21 by name and interval
-- ---------------------------------------------------------------------------
-- 09:10 UTC = 02:10 America/Los_Angeles during PDT (01:10 during PST). pg_cron
-- schedules are UTC-only; a quiet-hour job is pinned to UTC and allowed to drift
-- one hour across the DST boundary rather than chasing a local wall clock.
--
-- Slotted at :10 past the hour like the other daily jobs, and clear of the
-- 03:10/03:40 UTC data-lifecycle pair and the 02:40 UTC partition provisioner.
--
-- Idempotent: cron.schedule() upserts by jobname.
SELECT cron.schedule(
  'reachability-drift-selfheal',
  '10 9 * * *',
  $cron$select platform.heal_reachability_drift();$cron$
);
