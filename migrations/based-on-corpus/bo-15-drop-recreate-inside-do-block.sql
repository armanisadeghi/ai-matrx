-- expect-scan: function zz_bo_15.agg_sql
-- expect-live: refuse
-- setup: create function zz_bo_15.agg_sql(p_op text) returns text language sql immutable as $f$ select 'count(*)' $f$
--
-- Dynamic DDL is not an escape hatch: the DROP and the CREATE run through EXECUTE.
do $do$
begin
  execute 'drop function if exists zz_bo_15.agg_sql(text)';
  execute 'create function zz_bo_15.agg_sql(p_op text) returns text language sql immutable as $f$ select ''sum(amount)'' $f$';
end
$do$;
