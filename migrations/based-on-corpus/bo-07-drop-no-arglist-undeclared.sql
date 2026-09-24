-- expect-scan: function zz_bo_07.agg_sql
-- expect-live: refuse
-- setup: create function zz_bo_07.agg_sql(p_op text) returns text language sql immutable as $f$ select 'count(*)' $f$
--
-- The same DROP with nothing declared.
drop function zz_bo_07.agg_sql;
create function zz_bo_07.agg_sql(p_op text) returns text language sql immutable as $f$ select 'sum(amount)' $f$;
