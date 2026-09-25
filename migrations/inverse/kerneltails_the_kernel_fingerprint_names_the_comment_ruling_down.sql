-- INVERSE of migrations/campaign/kerneltails_the_kernel_fingerprint_names_the_comment_ruling.sql (lane KERNEL-TAILS).
-- Restores the expectation SHARE-LANE-2 recorded (cc430d18…). NOTE: with rca2b's bodies live this
-- puts platform.provision back into refusing every spec (preflight.read_kernel) — rule-27 use only.
set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT 'cc430d18fa421e34cde0704cf8282ad6'::text
$function$;
