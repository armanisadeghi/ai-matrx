-- DD-259 — the nightly reachability self-heal must be LOUD, ordered, and freezable
-- 2026-09-15 · THE PLAN v2 D-16 · brief B-140
--
-- based-on: platform.heal_reachability_drift() 9bd00a34f60f3f994f7ae668fdb135d09c6e0b78d020ab6e7fd661ca757af5e9
--
-- WHAT WAS WRONG (measured live 2026-09-15, before this file)
-- -----------------------------------------------------------
-- `reachability_drift_daily_selfheal.sql` (2026-08-21) already filed an
-- ops.system_error of kind `reachability_drift_detected`, and that kind IS
-- registered in aidream's `_patrol_priority()` `urgent` bucket, so the triage
-- queue does list it. Two real holes remained:
--
--   1. ORDER. The row was filed AFTER `platform.rebuild_reachability()` ran. A
--      rebuild that throws (lock timeout, a broken derivation, a statement
--      timeout on a bigger graph) took the INSERT down with it: the transaction
--      rolls back, the cron run reports `failed` in cron.job_run_details, and
--      the only durable trace of the drift — the evidence sample captured
--      before the truncate — is gone. The loudest moment of the night was the
--      one that could vanish. The row is now filed FIRST and the repair runs
--      SECOND, inside a subtransaction whose failure updates the already-filed
--      row instead of erasing it.
--
--   2. NO FREEZE. There was no way to stop the nightly repair. During a cutover
--      that intentionally rewrites containment, the healer would fight the
--      migration and rebuild a cache from a half-moved graph, silently. Opinions
--      become knobs: `platform.reachability.selfheal_pause` (default false)
--      freezes the REPAIR ONLY. Detection and filing never pause — a paused
--      heal files a LOUDER row, because access is now knowingly left wrong.
--
-- Live state at the time of writing: `platform.reachability_drift()` = 0 rows,
-- `platform.reachability` = 6,764 cached rows, cron job 21
-- `reachability-drift-selfheal` active on `10 9 * * *`, every run since
-- 2026-09-10 `succeeded`, and ops.system_error has never held a
-- `reachability_drift_detected` row — the job has simply never seen drift.
--
-- MUTATION BOUNDARY unchanged: the guarded `platform.rebuild_reachability()`
-- call is still the only write this path makes to platform.reachability, and it
-- still only runs behind a non-zero drift measurement — now also behind the
-- pause knob.

-- ---------------------------------------------------------------------------
-- 1. The freeze knob
-- ---------------------------------------------------------------------------
-- System-scoped: `overridable_by = '{}'` — one organization must never be able
-- to freeze a platform-wide access-cache repair, and no organization can hold a
-- reachability cache of its own. Admin-settable through the ordinary knob door
-- (`platform.feature_knob_set('platform.reachability','selfheal_pause','true')`).
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, taxonomy_node_id)
values
  ('platform.reachability', 'selfheal_pause', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Freeze the nightly reachability self-heal',
   'The nightly job checks whether the access visibility cache still agrees with a fresh derivation, and rebuilds it when it does not. Turn this on during a cutover that is deliberately rewriting who contains what, so the rebuild does not run against a half-moved graph. Detection and the incident report keep running while this is on — only the repair stops, and every skipped repair is filed as an urgent defect, because access is knowingly left wrong until you turn it back off.',
   'agent',
   'Default false: the repair is the thing that restores people''s access, so it runs unless a human deliberately freezes it. DD-259 / THE PLAN v2 D-16 — read live inside platform.heal_reachability_drift() through platform.knob_resolve, never a constant.',
   date '2026-10-15', '{}'::text[], 'any',
   (select taxonomy_node_id from platform.feature_knob
     where feature = 'platform.access' and taxonomy_node_id is not null limit 1))
on conflict (feature, key) do update set
  default_value   = excluded.default_value,
  value_type      = excluded.value_type,
  label           = excluded.label,
  description     = excluded.description,
  basis           = excluded.basis,
  overridable_by  = excluded.overridable_by,
  taxonomy_node_id = coalesce(platform.feature_knob.taxonomy_node_id, excluded.taxonomy_node_id),
  value           = case when platform.feature_knob.set_by = 'human'
                         then platform.feature_knob.value else excluded.value end,
  review_due      = case when platform.feature_knob.set_by = 'human'
                         then platform.feature_knob.review_due else excluded.review_due end,
  updated_at      = now();

do $$ begin
  if not exists (select 1 from platform.feature_knob
                  where feature = 'platform.reachability' and key = 'selfheal_pause') then
    raise exception 'platform.reachability.selfheal_pause was not registered';
  end if;
  if platform.knob_resolve('platform.reachability', 'selfheal_pause', null) <> 'false'::jsonb then
    raise exception 'platform.reachability.selfheal_pause does not resolve to false by default (got %)',
      platform.knob_resolve('platform.reachability', 'selfheal_pause', null);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The healer: measure -> FILE -> (freeze check) -> heal -> re-verify -> amend
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.heal_reachability_drift()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
-- The drift check is a full re-derivation of every container and this function
-- runs it twice around a rebuild. Give it room rather than inheriting whatever
-- statement_timeout the cron role happens to carry.
SET statement_timeout TO '10min'
AS $function$
DECLARE
  v_before        bigint;
  v_by_kind       jsonb;
  v_sample        jsonb;
  v_rebuilt       bigint  := NULL;
  v_after         bigint  := NULL;
  v_containers    bigint;
  v_hit_containers bigint;
  v_hit_sample    jsonb;
  v_open_id       uuid;
  v_error_id      uuid;
  v_paused        boolean := false;
  v_knob_readable boolean := true;
  v_knob_error    text    := NULL;
  v_repair        text;            -- 'repaired' | 'failed' | 'skipped_paused'
  v_repair_error  text    := NULL;
  v_headline      text;
  v_occurrences   int     := 1;
BEGIN
  -- --- Measure -----------------------------------------------------------
  -- Measure-first so the disagreeing rows are captured BEFORE the rebuild
  -- destroys the evidence: once rebuild_reachability() truncates, nobody can
  -- reconstruct what was wrong, and "the cache was broken, we don't know how"
  -- is not a triageable defect. MATERIALIZED so the derivation runs once.
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
                    LIMIT 25) s), '[]'::jsonb),
    (SELECT count(*) FROM (SELECT DISTINCT dd.container_type, dd.container_id FROM d dd) h),
    COALESCE((SELECT jsonb_agg(to_jsonb(c))
              FROM (SELECT DISTINCT dd.container_type, dd.container_id
                    FROM d dd ORDER BY 1, 2 LIMIT 50) c), '[]'::jsonb)
  INTO v_before, v_by_kind, v_sample, v_hit_containers, v_hit_sample;

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

  RAISE WARNING 'heal_reachability_drift: % disagreeing row(s) % across % container(s) — filing before touching anything',
    v_before, v_by_kind, v_hit_containers;

  -- --- FILE FIRST ---------------------------------------------------------
  -- DD-259: the incident row exists BEFORE any repair is attempted, so a repair
  -- that throws cannot take the evidence down with it. `kind` is the ONLY thing
  -- the triage ranker reads: aidream's admin_persistence `_patrol_priority()`
  -- buckets by kind string alone and 'reachability_drift_detected' is in its
  -- `urgent` set; an unregistered kind sorts last and is filtered OUT of any
  -- priority-scoped query. Neither `metadata` nor `source_app` is loaded by the
  -- collapsed list and `metadata` is not loaded by the detail view either, so
  -- every fact a human needs goes in `error_text` (always shown, part of the
  -- grouping signature) and `context` (shown on detail).
  -- One OPEN alarm at a time: a write path that stays broken must not
  -- manufacture a new ticket every night, but each recurrence is visible on the
  -- one that is open.
  SELECT e.id INTO v_open_id
  FROM ops.system_error e
  WHERE e.kind = 'reachability_drift_detected'
    AND e.resolved_at IS NULL
  ORDER BY e.occurred_at DESC
  LIMIT 1;

  IF v_open_id IS NULL THEN
    INSERT INTO ops.system_error (
      kind, error_type, source_app, route, error_text, context
    ) VALUES (
      'reachability_drift_detected',
      'ReachabilityCacheDrift',
      'postgres-cron',
      'cron:reachability-drift-selfheal',
      format(
        'platform.reachability disagreed with a fresh derivation on %s row(s) %s '
        'across %s of %s containers. Repair not yet attempted — this row was filed FIRST. '
        'THIS IS A DEFECT: a trigger-maintained cache that needs healing means an '
        'association write path or trg_associations_reachability stopped working. '
        'Find the write path before resolving. Evidence sample in context.drift_sample.',
        v_before, v_by_kind, v_hit_containers, v_containers
      ),
      jsonb_build_object(
        'drift_before',      v_before,
        'drift_by_kind',     v_by_kind,
        'drift_sample',      v_sample,
        'containers',        v_containers,
        'containers_hit',    v_hit_containers,
        'containers_sample', v_hit_sample,
        'repair',            'pending',
        'first_seen_at',     now(),
        'occurrences',       1,
        'guard',             'reachability',
        'severity',          'critical'
      )
    )
    RETURNING id INTO v_error_id;
  ELSE
    -- Already open: fold this firing into it rather than duplicating the ticket.
    -- `occurred_at` is deliberately NOT bumped. It stays at first-seen so the
    -- incident visibly AGES in the triage burn-down buckets. Recurrence is
    -- recorded as context.occurrences / last_seen_at.
    v_error_id := v_open_id;
    SELECT COALESCE((e.context->>'occurrences')::int, 1) + 1
      INTO v_occurrences
      FROM ops.system_error e WHERE e.id = v_error_id;
    UPDATE ops.system_error e
    SET context = e.context || jsonb_build_object(
          'occurrences',       v_occurrences,
          'last_seen_at',      now(),
          'drift_before',      v_before,
          'drift_by_kind',     v_by_kind,
          'drift_sample',      v_sample,
          'containers',        v_containers,
          'containers_hit',    v_hit_containers,
          'containers_sample', v_hit_sample,
          'repair',            'pending',
          'severity',          'critical'
        )
    WHERE e.id = v_error_id;
  END IF;

  -- --- Freeze check -------------------------------------------------------
  -- Read AFTER filing, so a knob that cannot be read still leaves an incident
  -- behind. knob_resolve RAISES on an unseeded knob by design (a missing knob
  -- must never fall back to a hard-coded value); here that would mean skipping
  -- the repair people's access depends on, so the fallback is "repair anyway"
  -- and it announces itself in the row and in the receipt.
  BEGIN
    v_paused := COALESCE(
      (platform.knob_resolve('platform.reachability', 'selfheal_pause', NULL) #>> '{}')::boolean,
      false);
  EXCEPTION WHEN OTHERS THEN
    v_knob_readable := false;
    v_knob_error    := SQLSTATE || ': ' || SQLERRM;
    v_paused        := false;
    RAISE WARNING 'heal_reachability_drift: could not read platform.reachability.selfheal_pause (%) — repairing anyway; re-seed the knob',
      v_knob_error;
  END;

  IF v_paused THEN
    -- --- Repair frozen ----------------------------------------------------
    v_repair := 'skipped_paused';
    RAISE WARNING 'heal_reachability_drift: repair SKIPPED — platform.reachability.selfheal_pause is true; % row(s) left wrong', v_before;
  ELSE
    -- --- Heal -------------------------------------------------------------
    -- The ONLY mutation path. Takes its own advisory xact lock internally.
    -- Wrapped so a failure amends the filed row instead of rolling it back.
    BEGIN
      v_rebuilt := platform.rebuild_reachability();
      -- Re-verify: proves the heal actually worked. A rebuild that leaves drift
      -- behind means the derivation disagrees with itself (non-determinism, or
      -- a graph mutating mid-run) — strictly worse news than the original drift.
      SELECT count(*) INTO v_after FROM platform.reachability_drift();
      v_repair := 'repaired';
    EXCEPTION WHEN OTHERS THEN
      v_repair       := 'failed';
      v_repair_error := SQLSTATE || ': ' || SQLERRM;
      RAISE WARNING 'heal_reachability_drift: rebuild FAILED (%) — incident % stands with the evidence',
        v_repair_error, v_error_id;
    END;
  END IF;

  -- --- Amend the filed row with what actually happened --------------------
  v_headline := CASE v_repair
    WHEN 'repaired' THEN
      format('The cache was self-healed by platform.rebuild_reachability() (%s rows rebuilt) and re-checked: %s.',
             v_rebuilt,
             CASE WHEN v_after = 0 THEN 'clean'
                  ELSE format('STILL %s DISAGREEING ROW(S) — HEAL FAILED', v_after) END)
    WHEN 'skipped_paused' THEN
      'THE REPAIR WAS SKIPPED: the knob platform.reachability.selfheal_pause is ON, so the cache is knowingly still wrong and people may be seeing access they were not granted (or missing access they were). Turn the knob back off — platform.feature_knob_set(''platform.reachability'',''selfheal_pause'',''false'') — or run public.admin_heal_reachability_drift() once the cutover that set it is finished.'
    ELSE
      format('THE REPAIR FAILED and the cache is still wrong: %s. Run public.admin_heal_reachability_drift() after fixing the cause.',
             v_repair_error)
  END;

  UPDATE ops.system_error e
  SET error_text = format(
        'platform.reachability disagreed with a fresh derivation on %s row(s) %s '
        'across %s of %s containers. %s '
        'THIS IS A DEFECT: a trigger-maintained cache that needs healing means an '
        'association write path or trg_associations_reachability stopped working. '
        'Find the write path before resolving. Evidence sample in context.drift_sample.',
        v_before, v_by_kind, v_hit_containers, v_containers, v_headline),
      context = e.context || jsonb_build_object(
        'repair',          v_repair,
        'repair_error',    v_repair_error,
        'rebuilt_rows',    v_rebuilt,
        'drift_after',     v_after,
        'heal_confirmed',  (v_repair = 'repaired' AND v_after = 0),
        'selfheal_paused', v_paused,
        'knob_readable',   v_knob_readable,
        'knob_error',      v_knob_error,
        'severity',        CASE WHEN v_repair = 'repaired' AND v_after = 0
                                THEN 'high' ELSE 'critical' END
      )
  WHERE e.id = v_error_id;

  IF v_repair = 'repaired' AND v_after > 0 THEN
    RAISE WARNING 'heal_reachability_drift: rebuild did NOT converge — % row(s) still disagree', v_after;
  END IF;

  RETURN jsonb_build_object(
    'drift_before',      v_before,
    'drift_by_kind',     v_by_kind,
    'containers',        v_containers,
    'containers_hit',    v_hit_containers,
    'incident_id',       v_error_id,
    'incident',          CASE WHEN v_open_id IS NULL THEN 'filed' ELSE 'folded_into_open' END,
    'repair',            v_repair,
    'repair_error',      v_repair_error,
    'healed',            (v_repair = 'repaired'),
    'rebuilt_rows',      v_rebuilt,
    'drift_after',       v_after,
    'heal_confirmed',    (v_repair = 'repaired' AND v_after = 0),
    'selfheal_paused',   v_paused,
    'knob_readable',     v_knob_readable,
    'knob_error',        v_knob_error,
    'checked_at',        now()
  );
END $function$;

COMMENT ON FUNCTION platform.heal_reachability_drift() IS
  'Daily self-heal (Arman-approved 2026-08-21, "Daily + self-heal", job reachability-drift-selfheal). Runs platform.reachability_drift(); zero = done, nothing filed. Non-zero = capture the evidence, FILE ops.system_error kind=reachability_drift_detected FIRST (DD-259: a repair that throws must not roll back the evidence), then repair with platform.rebuild_reachability() unless the knob platform.reachability.selfheal_pause is true, re-verify, and amend the filed row with the outcome. Non-zero drift is a defect, never routine maintenance.';

REVOKE ALL ON FUNCTION platform.heal_reachability_drift() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.heal_reachability_drift() TO service_role;
