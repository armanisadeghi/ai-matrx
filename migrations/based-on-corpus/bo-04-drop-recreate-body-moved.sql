-- expect-scan: function zz_bo_04.record_aggregate
-- expect-live: refuse
-- setup: create function zz_bo_04.record_aggregate(p_table uuid, p_op text) returns jsonb language sql stable as $f$ select '{"by":"S2"}'::jsonb $f$
-- based-on: zz_bo_04.record_aggregate(uuid, text) 1a4855f7d3edc559a088b34449b8f48cbb6517c73cd65e3fa713442b41fb63d4
--
-- The author DID declare a body — the one they read before a peer lane moved it. The live body
-- is no longer that hash, so the DROP would destroy a change the author never saw.
drop function if exists zz_bo_04.record_aggregate(uuid, text);
create function zz_bo_04.record_aggregate(p_table uuid, p_op text) returns jsonb language sql stable as $f$ select '{"by":"S3"}'::jsonb $f$;
