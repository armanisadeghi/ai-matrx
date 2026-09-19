-- STORE-ASOF (1 of 4) — THE INVERSE. The pre-STORE-ASOF body of `custom.query_can_see`, which
-- answered the one-record question by listing the whole organization. Restoring it restores
-- the O(the organization) cost with it; it is here because an inverse that does not actually
-- put the old behaviour back is not an inverse.

set lock_timeout = '5s';
set statement_timeout = '120s';

create or replace function custom.query_can_see(p_organization_id uuid, p_record_id uuid, p_required text default 'viewer')
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_can_see');
  return (
select exists (select 1 from custom.query_visible_ids(p_organization_id, null, p_required) v
                  where v = p_record_id)
  );
end;
$fn$;
