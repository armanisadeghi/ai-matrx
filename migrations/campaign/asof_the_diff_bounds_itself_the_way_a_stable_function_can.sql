-- STORE-ASOF (4b of 4) — THE ORGANIZATION'S DIFF BOUNDS ITSELF THE WAY A STABLE FUNCTION CAN.
--
-- `custom.query_visibility_parity` bounded its own runtime with `set local statement_timeout`
-- INSIDE the body. Measured on the main database the moment it was first called from an
-- organization admin's seat, 2026-09-19: `ERROR: SET is not allowed in a non-volatile
-- function`. A STABLE function may not issue SET at all — so the door was unreachable in
-- exactly the case it was built for, and the bound was a sentence rather than a bound.
--
-- The fix is the mechanism Postgres provides for precisely this: a FUNCTION-LEVEL `SET`
-- clause, applied for the duration of the call and restored on exit, with no statement
-- executed in the body at all. Same twenty seconds, same reason, actually enforced.
--
-- Nothing else changes: the same wall, the same audit threshold, the same rows.
--
-- ADDITIVE: one CREATE OR REPLACE of the function this lane created minutes ago. No signature
-- change, no grant change, no door row change.
--
-- INVERSE: migrations/inverse/asof_the_diff_bounds_itself_the_way_a_stable_function_can_down.sql

-- based-on: custom.query_visibility_parity(uuid) a35eadd0d6f57cdc5b1c4271755e34259c8d14de748a96ffa9c90d2e2043f671

set lock_timeout = '5s';
set statement_timeout = '120s';

create or replace function custom.query_visibility_parity(p_organization_id uuid)
returns table(side text, container_type text, container_id uuid, item_type text, item_id uuid,
              stored_level public.permission_level, derived_level public.permission_level, reason text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
-- A BOUNDED RUN, decided here rather than hoped for, and by the one mechanism a STABLE
-- function has: the setting is applied for the duration of the call and restored on exit. The
-- set-based diff finishes the whole platform in about a quarter of a second; twenty seconds is
-- a ceiling nothing healthy reaches, and a person clicking this is never the reason somebody
-- else waits.
set statement_timeout to '20s'
as $fn$
declare
  v_me uuid := custom.query_principal();
begin
  -- THE WALL, on the one ladder, before anything is read.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_visibility_parity');
  -- Then the same audit threshold `custom.visibility_as_of` applies: a cutover diff names
  -- records across the whole organization, so it is an owner's or an admin's question.
  if not (custom.query_is_store_owner()
          or (v_me is not null and public.is_org_admin_for(v_me, p_organization_id))) then
    raise exception 'Only an owner or admin of this organization can compare what it can see against the stored form.'
      using errcode = '42501',
            hint = 'T1: this answers about every record in the organization at once. A member can ask what THEY can see (custom.query_can_see).';
  end if;

  return query
    select p.side, p.container_type, p.container_id, p.item_type, p.item_id,
           p.stored_level, p.derived_level, p.reason
      from custom.visibility_parity() p
     where p.side in ('depth_measured', 'depth_exceeded')
        -- and every row that names a record of THIS organization, either end.
        or exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id
                      and (r.id = p.container_id or r.id = p.item_id));
end;
$fn$;
