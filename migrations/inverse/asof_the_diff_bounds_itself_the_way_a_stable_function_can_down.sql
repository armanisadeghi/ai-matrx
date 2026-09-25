-- STORE-ASOF (4b of 4) — THE INVERSE. The body with `set local statement_timeout` back inside
-- it, which is the body that raised `SET is not allowed in a non-volatile function` for every
-- caller. It is here because an inverse that does not put the old behaviour back is not one.

set lock_timeout = '2s';
set statement_timeout = '120s';

create or replace function custom.query_visibility_parity(p_organization_id uuid)
returns table(side text, container_type text, container_id uuid, item_type text, item_id uuid,
              stored_level public.permission_level, derived_level public.permission_level, reason text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_visibility_parity');
  if not (custom.query_is_store_owner()
          or (v_me is not null and public.is_org_admin_for(v_me, p_organization_id))) then
    raise exception 'Only an owner or admin of this organization can compare what it can see against the stored form.'
      using errcode = '42501',
            hint = 'T1: this answers about every record in the organization at once. A member can ask what THEY can see (custom.query_can_see).';
  end if;
  set local statement_timeout = '20s';
  return query
    select p.side, p.container_type, p.container_id, p.item_type, p.item_id,
           p.stored_level, p.derived_level, p.reason
      from custom.visibility_parity() p
     where p.side in ('depth_measured', 'depth_exceeded')
        or exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id
                      and (r.id = p.container_id or r.id = p.item_id));
end;
$fn$;
