-- chair-step: RC-A5a inverse — drops the payload_follows_endpoints declaration from platform.edge_payload_kind. Refuses while the RC-A5b gate that reads it still exists; run rca5b's inverse first.

set local lock_timeout = '2s';

do $$
begin
  if exists (select 1 from pg_policy where polrelid = 'platform.associations'::regclass
                and polname = 'assoc_payload_follows_endpoints') then
    raise exception 'rca5a inverse: the RC-A5b gate still reads this declaration; run migrations/inverse/rca5b_association_payload_follows_endpoints_down.sql first';
  end if;
end $$;

alter table platform.edge_payload_kind
  drop column if exists payload_follows_endpoints_reason,
  drop column if exists payload_follows_endpoints;
