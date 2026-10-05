-- FTS-1 wave 2 W2-R — NO CLIENT ROLE (authenticated, anon) HOLDS ANY PRIVILEGE ON THE SIX OLD SCOPE TABLES (check:scope-tables-no-client-grant).
-- RED before the revoke file; GREEN after. Self-proof: a grant planted inside this guard's own rolled-back savepoint must
-- turn the check red (plan v2 A5: the plant runs in the same transaction as the check).
\set ON_ERROR_STOP on
\set suite 'scopesw2_the_old_scope_tables_take_no_client_reads_red_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
create function pg_temp.held() returns text language sql as $f$
  select string_agg(r || ' ' || t || ' ' || p, ', ')
    from unnest(array['authenticated', 'anon']) r,
         unnest(array['scopes', 'scope_types', 'context_items', 'context_item_values', 'context_value_refs', 'scope_dataset_instances']) t,
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   where has_table_privilege(r, 'context.' || t, p)
$f$;
savepoint planted;
grant select on context.scopes to authenticated;
do $p$ begin
  if pg_temp.held() is null then raise exception 'PLANT FAILED: a planted grant was not seen'; end if;
  raise notice 'plant seen (red as intended): %', left(pg_temp.held(), 120);
end $p$;
rollback to savepoint planted;
do $g$ begin
  if pg_temp.held() is not null then raise exception 'RED: client roles still hold privileges on the old scope tables: %', pg_temp.held(); end if;
  raise notice 'GREEN: no client role holds any privilege on the six old scope tables';
end $g$;
rollback;
