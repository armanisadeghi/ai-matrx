-- RED before scopesfts1g_search_no_longer_reads_the_old_scope_tables (the projection's backfill/parity read the old scope
-- tables), GREEN after. Run inside begin; …; rollback.
do $g$
declare n int;
begin
  select count(*) into n from pg_proc p where p.pronamespace = 'platform'::regnamespace and p.proname in ('search_item_backfill', 'search_item_parity')
     and p.prosrc ~ 'context\.(scopes|scope_types|context_items)\M';
  if n > 0 then raise exception 'RED P1: % search projection bodies read the old scope tables', n; end if;
  if 'scope' = any (platform.search_item_projected_tokens()) then raise exception 'RED P2: scope is still a projected token'; end if;
  raise notice 'GREEN: search projection reads no old scope table';
end $g$;
