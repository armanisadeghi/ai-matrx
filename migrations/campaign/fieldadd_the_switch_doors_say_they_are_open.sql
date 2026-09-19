-- FIELD-ADD — THE SWITCH DOORS SAY THEY ARE OPEN.
--
-- The previous file gave three of the switch screen's doors a decision in the
-- body (`iam.has_org_admin`, before the first read) and declared them open to a
-- signed-in organization admin. Two of the three declarations did not take, and
-- the reason is worth writing down because it is the same shape of silence this
-- lane exists to close:
--
--   `platform.client_callable_door` already held a row for each of them, saying
--   SERVER-ONLY. The INSERT carried `on conflict (schema_name, function_name,
--   identity_argtypes) do nothing`, which is the right clause for a NEW door and
--   exactly the wrong one for a door whose declaration is CHANGING. The rows
--   were discarded in silence, the grant loop found no row saying
--   `signed_in_callers`, and the three functions came out of the transaction
--   reachable by nobody but the service role — measured immediately afterwards:
--
--     unified_data_ramp_exit(uuid)     authenticated=X   ← the new twin, took
--     unified_data_ramp_state(uuid)    service_role only ← did not take
--     unified_data_store_state(uuid)   service_role only ← did not take
--     unified_data_store_set(...)      service_role only ← did not take
--
-- So this file says the change out loud: the three rows are UPDATED to open a
-- signed-in lane, their `non_client_lane` sentence is cleared (the table's own
-- check constraint requires exactly one of the two states), the reason says who
-- may call them and what decides it, and the grant is then issued from the
-- registry over the rows that declare a client lane — the same loop, now with
-- rows for it to find.
--
-- The bodies are untouched by this file. They already ask
-- `platform.assert_may_operate_unified_data_ramp` before they read anything,
-- which is what makes these rows lawful.
--
-- ADDITIVE: three registry rows change from server-only to signed-in, and the
-- grants those rows imply are issued. No function is replaced, nothing is
-- dropped, and the service-role lane the admin API route uses is untouched.
--
-- THE INVERSE: migrations/inverse/fieldadd_the_switch_doors_say_they_are_open_down.sql.

set lock_timeout = '5s';
set statement_timeout = '600s';

update platform.client_callable_door d
   set signed_in_callers = true,
       anonymous_callers = false,
       non_client_lane   = null,
       declared_by       = 'migrations/campaign/fieldadd_the_switch_doors_say_they_are_open.sql (lane FIELD-ADD)',
       reason            = v.reason
  from (values
    ('unified_data_ramp_state',
     'Where one organization stands on the ramp, consumer by consumer, with the verdict of each consumer''s last gate run. p_organization_id is checked by platform.assert_may_operate_unified_data_ramp before the first read - iam.has_org_admin for a signed-in person, and the owner and service-role lanes as they were - so an organization somebody does not administer answers exactly as an invented id does. It was declared server-only while the only caller was an admin API route holding the service key; that route still works and a person who administers the organization can now read their own ramp, which is what the screen needed.'),
    ('unified_data_store_state',
     'Whether this organization is on the unified record store, whether that is its own decision or the platform default, and what being on it actually means, in the sentence the screen shows. p_organization_id is checked by platform.assert_may_operate_unified_data_ramp before the first read. Every refusal in the product points a person at this switch, so the screen that shows it has to be reachable by the person the refusal is addressed to.'),
    ('unified_data_store_set',
     'Turning the unified record store on or off for one organization. It moves no data and no consumer - every consumer knob stays separate - but until it is on, that organization reaches none of the store''s doors, so this is the switch every refusal in the product names. p_organization_id is checked by platform.assert_may_operate_unified_data_ramp before anything is written: an owner or an administrator of that organization, or the owner and service-role lanes. The knob''s own write door, its audit row and its read-back check are untouched, and p_acting_user_id falls back to auth.uid() so a person operating it from their own session is the person stamped on the override.')
  ) as v(function_name, reason)
 where d.schema_name = 'platform'
   and d.function_name = v.function_name;

-- The grants, issued from the registry over the rows that now declare a client
-- lane. Schema `platform` is not declared closed, so `reopen_declared_doors`
-- has nothing to say about it; this is the same sentence, bounded to the switch
-- screen's own doors.
do $grants$
declare
  fn record;
  v_any boolean := false;
begin
  for fn in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'platform'
      join platform.client_callable_door d
        on d.schema_name = 'platform'
       and d.function_name = p.proname
       and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
     where d.signed_in_callers
       and p.proname in ('unified_data_ramp_exit', 'unified_data_ramp_state',
                         'unified_data_store_state', 'unified_data_store_set')
  loop
    v_any := true;
    execute format('grant execute on function %s to authenticated', fn.sig);
    raise notice 'reachable by a signed-in organization admin: %', fn.sig;
  end loop;

  -- NOTHING FAILS SILENTLY. This file exists because a registry write was
  -- discarded without a word; it is not going to end the same way.
  if not v_any then
    raise exception 'No switch door declares a signed-in lane after this file ran, so nothing was granted and the switch screen is still unreachable.'
      using errcode = 'P0001',
            hint = 'platform.client_callable_door rows for unified_data_ramp_exit(uuid), unified_data_ramp_state, unified_data_store_state and unified_data_store_set must carry signed_in_callers = true with identity_argtypes matching the live functions.';
  end if;
end
$grants$;
