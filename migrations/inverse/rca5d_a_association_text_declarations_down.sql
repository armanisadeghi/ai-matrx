-- chair-step: RC-A5d(a) inverse — drops the two association-text declarations. Refuses while the RC-A5d(b) gate that reads them still exists; run rca5d_b's inverse first.

set local lock_timeout = '2s';

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'platform' and tablename = 'associations'
                and qual like '%edge_structural_labels%') then
    raise exception 'rca5d_a inverse: the RC-A5d(b) gate still reads these declarations; run migrations/inverse/rca5d_b_association_content_follows_endpoints_down.sql first';
  end if;
end $$;

delete from platform.client_callable_door where schema_name = 'platform' and function_name = 'edge_structural_labels';
drop function if exists platform.edge_structural_labels();
drop function if exists platform.edge_structural_metadata_keys();
