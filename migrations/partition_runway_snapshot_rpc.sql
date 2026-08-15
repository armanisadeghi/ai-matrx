-- partition_runway_snapshot() — the live-DB half of `pnpm check:partition-runway`.
--
-- WHY THIS EXISTS (D122). history.row_versions is RANGE-partitioned on
-- occurred_at. In August 2026 its last partition ended and nothing created the
-- next one, so the version trigger on 121 versioned tables raised on EVERY
-- INSERT/UPDATE/DELETE for four days — no file, note, task, transcript or agent
-- run was written. The provisioner was fixed
-- (migrations/history_row_versions_partition_autoprovision.sql), but NOTHING
-- compared partition runway to now().
--
-- This is a different failure class from every schema check we already run.
-- `pnpm check:schema` and aidream's schema analysis compare code against DB
-- SHAPE — and the shape was perfectly correct. What was exhausted was the DATA
-- RANGE the shape covers. A structural diff can never see that, because time
-- moves while the schema stands still. Time-bounded DDL needs a check that
-- knows what day it is.
--
-- Structural metadata + counts only — no row data ever leaves this function,
-- which is why it can carry the same grants as public.schema_truth_snapshot().
--
-- Reports three things that expire on a clock:
--   1. RANGE partition runway — days between now() and the highest upper bound.
--   2. DEFAULT (catch-all) partitions that have STARTED RECEIVING ROWS. A row
--      in the catch-all means the provisioner already failed and the catch-all
--      silently absorbed what should have gone in a real partition. That is a
--      caught outage, not a healthy state.
--   3. pg_cron jobs — inactive ones, and active ones whose last run failed or
--      never happened. The provisioner IS a cron job; a cron job that quietly
--      stopped is exactly how the four-day outage started.

CREATE OR REPLACE FUNCTION public.partition_runway_snapshot()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_parts   jsonb := '[]'::jsonb;
  v_cron    jsonb := '[]'::jsonb;
  v_rec     record;
  v_child   record;
  v_max     timestamptz;
  v_upper   timestamptz;
  v_unbound boolean;
  v_default text;
  v_rows    bigint;
  v_bound   text;
  v_raw     text;
  v_lower   timestamptz;
  v_rawlo   text;
  v_kind    text;
  v_widths  numeric[];
BEGIN
  FOR v_rec IN
    SELECT c.oid,
           n.nspname AS schema_name,
           c.relname AS table_name,
           pg_get_partkeydef(c.oid) AS partkey
    FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pt.partstrat = 'r'          -- RANGE only; LIST/HASH cannot run out
    ORDER BY n.nspname, c.relname
  LOOP
    v_max := NULL;
    v_unbound := false;
    v_default := NULL;
    v_rows := 0;
    v_kind := 'time';
    v_widths := '{}';

    FOR v_child IN
      SELECT c2.oid,
             n2.nspname AS schema_name,
             c2.relname AS child_name,
             pg_get_expr(c2.relpartbound, c2.oid) AS bound
      FROM pg_inherits i
      JOIN pg_class c2 ON c2.oid = i.inhrelid
      JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
      WHERE i.inhparent = v_rec.oid
    LOOP
      v_bound := v_child.bound;

      IF v_bound = 'DEFAULT' THEN
        v_default := v_child.schema_name || '.' || v_child.child_name;
        -- Bounded probe: we only need to know whether the catch-all is EMPTY,
        -- never how full it is, so never scan a big table to find out.
        EXECUTE format(
          'SELECT count(*) FROM (SELECT 1 FROM %I.%I LIMIT 1000) s',
          v_child.schema_name, v_child.child_name
        ) INTO v_rows;
        CONTINUE;
      END IF;

      -- 'FOR VALUES FROM (x) TO (y)' → y
      v_raw := substring(v_bound from 'TO \((.*)\)$');
      IF v_raw IS NULL THEN
        CONTINUE;
      END IF;
      IF upper(btrim(v_raw)) = 'MAXVALUE' THEN
        -- An open-ended top partition can never run out.
        v_unbound := true;
        CONTINUE;
      END IF;

      BEGIN
        v_upper := btrim(v_raw, '''')::timestamptz;
      EXCEPTION WHEN others THEN
        -- Not a time-keyed partition (int ids, text prefixes, …). Runway is
        -- not measurable in days; say so rather than guessing.
        v_kind := 'non-time';
        v_upper := NULL;
      END;

      IF v_upper IS NOT NULL AND (v_max IS NULL OR v_upper > v_max) THEN
        v_max := v_upper;
      END IF;

      -- Observed CADENCE, so the checker never has to be told how often a
      -- table rolls. history.row_versions is monthly (~30d); Supabase's
      -- realtime.messages is daily. One fixed day threshold cannot serve both,
      -- so the width of the partitions IS the unit the threshold is expressed in.
      IF v_upper IS NOT NULL THEN
        v_rawlo := substring(v_bound from 'FROM \((.*?)\) TO');
        IF v_rawlo IS NOT NULL AND upper(btrim(v_rawlo)) <> 'MINVALUE' THEN
          BEGIN
            v_lower := btrim(v_rawlo, '''')::timestamptz;
            v_widths := v_widths ||
              (EXTRACT(epoch FROM (v_upper - v_lower)) / 86400)::numeric;
          EXCEPTION WHEN others THEN
            NULL;
          END;
        END IF;
      END IF;
    END LOOP;

    v_parts := v_parts || jsonb_build_object(
      'schema',            v_rec.schema_name,
      'table',             v_rec.table_name,
      'partition_key',     v_rec.partkey,
      'key_kind',          v_kind,
      'partition_count',   (SELECT count(*) FROM pg_inherits WHERE inhparent = v_rec.oid),
      -- Narrowest observed partition width, in days: the conservative cadence.
      'cadence_days',      (SELECT min(w) FROM unnest(v_widths) w),
      'max_upper_bound',   v_max,
      'unbounded_top',     v_unbound,
      'runway_days',       CASE WHEN v_unbound OR v_max IS NULL THEN NULL
                                ELSE floor(EXTRACT(epoch FROM (v_max - now())) / 86400)::int END,
      'default_partition', v_default,
      'default_rows',      v_rows
    );
  END LOOP;

  -- pg_cron liveness. last_run/last_status come from cron.job_run_details,
  -- which Supabase retains; a NULL last_run on an active job means it has never
  -- run since the retention window — worth a look, not a crisis on its own.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT coalesce(jsonb_agg(j ORDER BY j->>'jobname'), '[]'::jsonb) INTO v_cron
    FROM (
      SELECT jsonb_build_object(
        'jobid',       job.jobid,
        'jobname',     job.jobname,
        'schedule',    job.schedule,
        'active',      job.active,
        'last_run',    d.last_run,
        'last_status', d.last_status,
        'hours_since_last_run',
          CASE WHEN d.last_run IS NULL THEN NULL
               ELSE floor(EXTRACT(epoch FROM (now() - d.last_run)) / 3600)::int END
      ) AS j
      FROM cron.job job
      LEFT JOIN LATERAL (
        SELECT r.end_time AS last_run, r.status AS last_status
        FROM cron.job_run_details r
        WHERE r.jobid = job.jobid
        ORDER BY r.start_time DESC
        LIMIT 1
      ) d ON true
    ) s;
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'partitioned',  v_parts,
    'cron_jobs',    v_cron
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.partition_runway_snapshot() FROM public;
GRANT EXECUTE ON FUNCTION public.partition_runway_snapshot() TO anon, authenticated, service_role;
