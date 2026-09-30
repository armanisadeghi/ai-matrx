-- Inverse of mnd_candidate_live_reads_2026_09_30.sql.
DELETE FROM platform.feature_knob WHERE feature = 'mandates' AND key = 'candidate_poll_seconds' AND set_by = 'agent';
DROP FUNCTION IF EXISTS public.mnd_candidate_cells(uuid[]);
