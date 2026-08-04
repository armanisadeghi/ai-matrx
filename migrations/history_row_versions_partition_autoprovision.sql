-- history.row_versions partition auto-provisioning.
--
-- INCIDENT (2026-08-01 → 2026-08-04, platform-wide write outage):
-- history.row_versions is RANGE-partitioned on occurred_at with hand-created
-- monthly partitions. The last one ended at 2026-08-01T00:00Z and nothing
-- created the next. platform._version_capture() fires on 121 versioned tables,
-- so from that instant EVERY insert/update/delete on all of them failed with
--   SQLSTATE 23514: no partition of relation "row_versions" found for row
-- files.files stopped accepting rows at 2026-07-31 22:09 — no file, note, task,
-- transcript, flashcard set or agent_run was written for four days. Podcast
-- generation failed because its audio stage could not persist media, and the
-- error surfaced to users as "An unexpected Google error occurred."
--
-- Three layers, each sufficient alone, each LOUD when it fires:
--   1. history.ensure_row_version_partitions() — idempotent provisioner.
--   2. pg_cron job "ensure-row-version-partitions" (daily 02:40 UTC, 18 months
--      of runway) so the window can never close again.
--   3. a DEFAULT partition, so even a total provisioner failure degrades to
--      "history landed in the catch-all" instead of freezing user writes.
--      A non-empty default is itself a defect and raises a system_error row.
--
-- Applied live via the Supabase MCP on 2026-08-04; this file is the record.

CREATE OR REPLACE FUNCTION history.ensure_row_version_partitions(months_ahead int DEFAULT 18)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'history', 'public', 'pg_catalog'
AS $fn$
DECLARE
  m            date := date_trunc('month', now())::date;
  stop         date := (date_trunc('month', now()) + make_interval(months => months_ahead))::date;
  part         text;
  created      int  := 0;
  default_rows bigint;
BEGIN
  WHILE m < stop LOOP
    part := format('row_versions_%s', to_char(m, 'YYYY_MM'));
    IF to_regclass(format('history.%I', part)) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE history.%I PARTITION OF history.row_versions '
        'FOR VALUES FROM (%L) TO (%L)',
        part, m::timestamptz, (m + interval '1 month')::timestamptz
      );
      created := created + 1;
      RAISE NOTICE 'history.ensure_row_version_partitions: created %', part;
    END IF;
    m := (m + interval '1 month')::date;
  END LOOP;

  -- The DEFAULT partition is a safety net, not a destination. Anything landing
  -- there means the provisioner stopped running — scream, never absorb silently.
  IF to_regclass('history.row_versions_default') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM ONLY history.row_versions_default' INTO default_rows;
    IF default_rows > 0 THEN
      INSERT INTO public.system_error (kind, error_type, error_text, context)
      VALUES (
        'row_versions_default_partition_used',
        'PartitionProvisioningGap',
        format(
          'history.row_versions_default holds %s row(s): the monthly partition '
          'provisioner did not run in time. User writes were saved, but version '
          'history landed in the catch-all. Run history.ensure_row_version_partitions().',
          default_rows
        ),
        jsonb_build_object('default_rows', default_rows, 'checked_at', now())
      );
      RAISE WARNING 'history.row_versions_default holds % row(s) — provisioning gap', default_rows;
    END IF;
  END IF;

  RETURN created;
END
$fn$;

COMMENT ON FUNCTION history.ensure_row_version_partitions(int) IS
  'Idempotently provisions monthly history.row_versions partitions N months ahead. '
  'Scheduled daily via pg_cron job "ensure-row-version-partitions". A gap here freezes '
  'writes on every versioned table platform-wide (2026-08-01 incident).';

-- Backfill the missing months and build runway.
SELECT history.ensure_row_version_partitions(18);

-- Catch-all so a future gap degrades instead of failing writes.
DO $do$
BEGIN
  IF to_regclass('history.row_versions_default') IS NULL THEN
    EXECUTE 'CREATE TABLE history.row_versions_default '
            'PARTITION OF history.row_versions DEFAULT';
  END IF;
END
$do$;

-- Daily provisioner. cron.schedule() upserts by name, so this is idempotent.
SELECT cron.schedule(
  'ensure-row-version-partitions',
  '40 2 * * *',
  $cron$select history.ensure_row_version_partitions(18);$cron$
);
