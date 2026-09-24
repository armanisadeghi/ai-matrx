-- expect-scan: function zz_bo_03.record_aggregate
-- expect-live: refuse
-- setup: create function zz_bo_03.record_aggregate(p_table uuid, p_op text) returns jsonb language sql stable as $f$ select '{"by":"S2"}'::jsonb $f$
--
-- PROGRESS-S2, the incident shape: lane S3 DROPped record_aggregate and re-created it with a
-- plain CREATE FUNCTION (no OR REPLACE needed once the DROP removed it) from a stale dump.
-- Before RUNNER-DROP-BASEDON neither runner saw this; it put S2's older body back, twice.
drop function if exists zz_bo_03.record_aggregate(uuid, text);
create function zz_bo_03.record_aggregate(p_table uuid, p_op text) returns jsonb language sql stable as $f$ select '{"by":"S3-stale-dump"}'::jsonb $f$;
