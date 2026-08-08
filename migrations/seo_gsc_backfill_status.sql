-- Live backfill status for one site — the server truth behind the
-- missing-history banner. Client state dies on refresh; whether a history
-- import is RUNNING (nightly scheduler, another tab, an on-demand walk) is
-- a server fact and must be readable as one, or the UI silently "acts as
-- though the user doesn't matter" while work is in flight.
--
-- SECURITY DEFINER because seo.collection_run has no client read policy —
-- same pattern as seo.gsc_ingestion_health. Read-only, per-site, tiny.

CREATE OR REPLACE FUNCTION seo.gsc_backfill_status(p_site_id uuid)
RETURNS TABLE (
  -- Is any GSC collection run for this site processing right now?
  active boolean,
  active_trigger text,
  active_window_start date,
  active_window_end date,
  active_started_at timestamptz,
  -- Google's ~16-month retention horizon as of today.
  horizon date,
  -- The most recent completed backfill-trigger run (null = never).
  last_backfill_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $$
DECLARE
  v_run record;
BEGIN
  SELECT (cr.settings->>'start_date')::date AS ws,
         (cr.settings->>'end_date')::date AS we,
         cr.trigger::text AS trig,
         cr.created_at AS started
  INTO v_run
  FROM seo.collection_run cr
  WHERE cr.provider = 'gsc'
    AND cr.site_id = p_site_id
    AND cr.status = 'processing'
    -- A run abandoned by a dead process must not read as "in progress"
    -- forever — the lease/heartbeat machinery marks real work recent.
    AND cr.updated_at > now() - interval '30 minutes'
  ORDER BY cr.created_at DESC
  LIMIT 1;

  RETURN QUERY
  SELECT v_run.trig IS NOT NULL,
         v_run.trig,
         v_run.ws,
         v_run.we,
         v_run.started,
         (CURRENT_DATE - 488)::date,
         (SELECT MAX(cr2.updated_at)
          FROM seo.collection_run cr2
          WHERE cr2.provider = 'gsc'
            AND cr2.site_id = p_site_id
            AND cr2.status = 'completed'
            AND cr2.trigger::text = 'backfill');
END;
$$;

GRANT EXECUTE ON FUNCTION seo.gsc_backfill_status(uuid) TO authenticated;
