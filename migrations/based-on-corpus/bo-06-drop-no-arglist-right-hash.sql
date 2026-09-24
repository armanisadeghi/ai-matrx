-- expect-scan: function zz_bo_06.agg_sql
-- expect-live: accept
-- setup: create function zz_bo_06.agg_sql(p_op text) returns text language sql immutable as $f$ select 'count(*)' $f$
-- based-on: zz_bo_06.agg_sql(text) {{hash:function zz_bo_06.agg_sql(text)}}
--
-- DROP FUNCTION with no argument list destroys every overload of the name; with the one live
-- overload declared, it is accepted.
drop function zz_bo_06.agg_sql;
create function zz_bo_06.agg_sql(p_op text) returns text language sql immutable as $f$ select 'sum(amount)' $f$;
