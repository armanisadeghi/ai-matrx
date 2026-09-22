-- FIX-11A / V11-A — the repair that goes with
-- migrations/campaign/fix11a_the_two_halves_of_the_one_switch_cannot_drift.sql.
--
-- The migration stops the two halves of the record-store switch drifting apart from today.
-- This settles the 42 organizations that had already drifted, by touching the SWITCH half
-- of each one — `custom/system_enabled`, the half NAV-FIX ruled is the switch — and letting
-- the new trigger write the code half to match. Nothing here decides for an organization:
-- every one of them ends on the answer its own switch already held.
--
-- An organization that has only ever written the code half and never the switch is left
-- ALONE and listed, because inventing a switch value for it would be this file deciding
-- something an organization decides.
--
--   $(brew --prefix libpq)/bin/psql "<the main database>" -f scripts/fix11a/mirror_the_code_half_onto_every_organization.sql
--
-- It is idempotent: an organization whose halves already agree is not selected.

do $mirror$
declare
  r        record;
  v_fixed  integer := 0;
  v_left   text[] := '{}';
begin
  for r in
    select k.organization_id, k.scope_id, k.value, o.name
      from platform.knob_override k
      join iam.organizations o on o.id = k.organization_id
     where k.feature = 'custom' and k.key = 'system_enabled' and k.scope_kind = 'organization'
       and k.value is distinct from (
             select t.value from platform.knob_override t
              where t.feature = 'custom' and t.key = 'code_paths_enabled'
                and t.scope_kind = 'organization' and t.scope_id = k.scope_id
                and t.organization_id = k.organization_id)
  loop
    update platform.knob_override
       set value = r.value
     where feature = 'custom' and key = 'system_enabled' and scope_kind = 'organization'
       and scope_id = r.scope_id and organization_id = r.organization_id;
    v_fixed := v_fixed + 1;
  end loop;

  select coalesce(array_agg(o.name order by o.name), '{}')
    into v_left
    from platform.knob_override k
    join iam.organizations o on o.id = k.organization_id
   where k.feature = 'custom' and k.key = 'code_paths_enabled' and k.scope_kind = 'organization'
     and not exists (select 1 from platform.knob_override s
                      where s.feature = 'custom' and s.key = 'system_enabled'
                        and s.scope_kind = 'organization' and s.scope_id = k.scope_id
                        and s.organization_id = k.organization_id);

  raise notice 'V11-A: % organization(s) had the code half written to match their own switch.', v_fixed;
  if array_length(v_left, 1) is not null then
    raise notice 'V11-A: left alone, because only the code half was ever written and the switch is theirs to set: %', array_to_string(v_left, ', ');
  end if;
end
$mirror$;
