-- Inverse of mnd_candidate_live_reads_2026_09_30.sql.
-- based-on: public.mnd_candidate_cells(uuid[]) 2a7487b4f8ef2c000dd8df5076e2a1609ee197481af0984b48d9101726f19994
DELETE FROM platform.feature_knob WHERE feature = 'mandates' AND key = 'candidate_poll_seconds' AND set_by = 'agent';
-- Pure DROP headers are documentary; enforce the exact body inside the transaction.
DO $rollback_body$
DECLARE
  body_hash text;
BEGIN
  SELECT encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('public.mnd_candidate_cells(uuid[])')), 'utf8')), 'hex')
    INTO body_hash;
  IF body_hash IS DISTINCT FROM '2a7487b4f8ef2c000dd8df5076e2a1609ee197481af0984b48d9101726f19994' THEN
    RAISE EXCEPTION 'Refusing rollback: public.mnd_candidate_cells(uuid[]) is missing or changed since the candidate migration';
  END IF;
  DROP FUNCTION public.mnd_candidate_cells(uuid[]);
END
$rollback_body$;
