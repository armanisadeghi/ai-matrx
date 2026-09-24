-- expect-scan: function zz_bo_05.record_aggregate
-- expect-live: accept
-- setup: create function zz_bo_05.record_aggregate(p_table uuid, p_op text) returns jsonb language sql stable as $f$ select '{"by":"S2"}'::jsonb $f$
-- based-on: zz_bo_05.record_aggregate(uuid, text) {{hash:function zz_bo_05.record_aggregate(uuid, text)}}
--
-- Positive control for bo-03/bo-04: re-based on the live body, declared by its current hash.
drop function if exists zz_bo_05.record_aggregate(uuid, text);
create function zz_bo_05.record_aggregate(p_table uuid, p_op text) returns jsonb language sql stable as $f$ select '{"by":"S3-rebased"}'::jsonb $f$;
