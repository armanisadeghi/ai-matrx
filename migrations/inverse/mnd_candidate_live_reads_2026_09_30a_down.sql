-- Inverse of mnd_candidate_live_reads_2026_09_30.sql.
-- based-on: public.mnd_candidate_cells(uuid[]) 2a7487b4f8ef2c000dd8df5076e2a1609ee197481af0984b48d9101726f19994
DELETE FROM platform.feature_knob WHERE feature = 'mandates' AND key = 'candidate_poll_seconds' AND set_by = 'agent';
DROP FUNCTION IF EXISTS public.mnd_candidate_cells(uuid[]);
