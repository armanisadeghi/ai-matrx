-- version_capture_skip_contentless_updates.sql
--
-- Makes platform._version_capture() refuse to record an UPDATE that changed
-- nothing. A version row whose only difference from its predecessor is the
-- version counter records no information: it cannot be diffed, restored to, or
-- read as anything. It is pure cost.
--
-- WHY, WITH NUMBERS. `sandbox_instance` reached 4.86M rows -- 92% of the whole
-- version store, ~7 GB -- and 100% of a sampled 14,982 consecutive snapshots
-- differed in nothing but `updated_at` and `version` (the two columns
-- platform._touch_row moves by itself). That corpus has since been purged
-- (history_purge_sandbox_heartbeat_versions.sql) and its trigger given a WHEN
-- guard, but the same class exists elsewhere and nothing prevents the next one:
--     web_page      9,024 of 213,213 UPDATE captures contentless  (4.2%)
--     note          2,072 of  13,965                              (14.8%)
--     app_instance      0 of  17,370                              (0%)
-- Fixing it per-table means catching each new offender after it has already
-- written millions of rows. This fixes the class, once, at the source.
--
-- RELATIONSHIP TO THE SPLIT-TRIGGER SHAPE (db-rules §7). This does NOT replace
-- it and does not make the existing pairs redundant. The split triggers on
-- workflow.trigger, scheduler.sch_task/sch_trigger and public.sandbox_instances
-- strip *runtime* columns too (next_run_at, last_fired_at, last_heartbeat_at,
-- ...) -- writes that genuinely change data we do not want versioned. This
-- guard only drops writes that changed NOTHING. Both stay; they compose.
--
-- WHAT IS NOT SKIPPED, deliberately:
--   * INSERT and DELETE -- always captured, unconditionally.
--   * SOFT_DELETE -- a deleted_at transition is a real content change and is
--     detected before this guard can apply, so it always records.
--   * Any UPDATE that changes any column other than `version` / `updated_at`.
--
-- SIDE EFFECT, verified harmless: `version` numbers may now have gaps, because
-- platform._touch_row still bumps the counter on a contentless write while this
-- declines to snapshot it. Every consumer enumerates with version_list() and
-- then fetches a version it was handed, so a gap is never requested:
--   * public.version_snapshot / version_diff / version_restore / version_prune
--   * matrx-frontend/lib/versioning/versionHistory.ts (list -> snapshot/restore)
-- `_touch_row` is deliberately NOT changed: `updated_at` must keep moving on
-- every write, because callers outside versioning rely on it.
--
-- CONSUMER AUDIT (audit.relation_usage('history','row_versions')): all 21
-- function consumers read CONTENT history -- the version_* family, the note /
-- rulebook / content_ir version readers, crm_party_purge, and
-- plan._status_flow_guard (which writes NEW.metadata, a real column change, so
-- its override records exactly as before). NOTHING treats a version row as a
-- "who touched this" audit trail, which is the only thing this could regress.
--
-- Idempotent. Safe to re-run. Reversible: restore the prior body to undo.

BEGIN;

CREATE OR REPLACE FUNCTION platform._version_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE rec jsonb; old_rec jsonb; op text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec := to_jsonb(OLD); op := 'DELETE';
  ELSE
    rec := to_jsonb(NEW) - 'search_tsv' - 'embedding';
    IF TG_OP = 'INSERT' THEN
      op := 'INSERT';
    ELSE
      -- Read the flag out of the snapshot, never off the record: a versioned
      -- table without soft delete simply has no such key.
      old_rec := to_jsonb(OLD);
      op := CASE
              WHEN rec->>'deleted_at' IS NOT NULL AND old_rec->>'deleted_at' IS NULL
                THEN 'SOFT_DELETE'
              ELSE 'UPDATE'
            END;

      -- CONTENTLESS-UPDATE GUARD. A snapshot identical to its predecessor in
      -- everything but the bookkeeping columns records nothing; do not write
      -- it. SOFT_DELETE is exempt by construction (deleted_at differs, so it
      -- would not match anyway) but is excluded explicitly for clarity.
      IF op = 'UPDATE'
         AND (rec      - 'version' - 'updated_at')
             IS NOT DISTINCT FROM
             ((old_rec - 'search_tsv' - 'embedding') - 'version' - 'updated_at')
      THEN
        RETURN COALESCE(NEW, OLD);
      END IF;
    END IF;
  END IF;

  INSERT INTO history.row_versions(entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier)
  VALUES (TG_ARGV[0], (rec->>'id')::uuid, (rec->>'organization_id')::uuid,
          COALESCE((rec->>'version')::int,1), op, rec,
          COALESCE(NULLIF(current_setting('app.user_id', true), '')::uuid, (SELECT auth.uid())),
          platform.actor_tier());
  RETURN COALESCE(NEW, OLD);
END
$fn$;

COMMIT;
