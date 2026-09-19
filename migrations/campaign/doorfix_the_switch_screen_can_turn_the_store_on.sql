-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- DOOR-FIX 4c — B1, THE OTHER HALF. THE SWITCH SCREEN CAN TURN THE STORE ON FOR AN ORGANIZATION.
--
-- DOOR-FIX 4 made promoting a field follow `custom/system_enabled`, which is right — one
-- switch per organization, not a second knob nobody turns on. But the switch screen could only
-- ramp CONSUMERS; there was no way in the product to turn the store itself on for an
-- organization at all, so "follow the system switch" would have been "follow a switch with no
-- switch". These two doors are that switch.
--
-- THE STORE SWITCH IS NOT A CONSUMER, AND IS NOT GATED BY TEST 1. Test 1 compares the stored
-- access answers with the derived ones for data that is MOVING from an old store to this one;
-- turning the store on for an organization moves nothing and has nothing to compare. The
-- consumer ramp is still gated exactly as it was, and every consumer knob is still off, so
-- turning the store on moves nobody — it only lets that organization use the store's own
-- doors. The returned sentence says this out loud so nobody reads the absence of a gate as an
-- oversight.
--
-- Both doors are SERVER-ONLY and declared so: the admin API route establishes from the
-- caller's own session that they are a platform admin (auth.uid() is null on a service-key
-- lane), and passes that person in as the actor — the same shape, and the same reason, as
-- `platform.unified_data_ramp_set`.
--
-- INVERSE: migrations/inverse/doorfix_the_switch_screen_can_turn_the_store_on_down.sql

set lock_timeout = '3s';
set statement_timeout = '2min';

create function platform.unified_data_store_state(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_on   boolean;
  v_over boolean;
begin
  v_on := coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false);
  select true into v_over from platform.knob_override o
   where o.feature = 'custom' and o.key = 'system_enabled'
     and o.scope_kind = 'organization' and o.scope_id = p_organization_id;
  return jsonb_build_object(
    'knob_key', 'system_enabled',
    'switched_on', v_on,
    'has_organization_override', coalesce(v_over, false),
    'why', case when v_on
                then 'This organization is on the unified record store. Its doors take writes from its own people, and a field can be promoted here. Every consumer knob is still separate: turning this on moved nobody onto the new store.'
                else 'This organization is not on the unified record store. Its doors take writes only from the role that owns custom.record, and promoting a field is refused here. Turning this on does not move any consumer — every consumer knob is separate and still off.' end);
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', 'unified_data_store_state', 'p_organization_id uuid',
   array['uuid'::regtype]::oid[],
   'p_organization_id names the organization whose store switch is being read and is never NULL; the function reads only that organization''s knob override and the resolved value, and returns no record of the store at all.',
   'migrations/campaign/doorfix_the_switch_screen_can_turn_the_store_on.sql',
   'server_only: read by the admin switch screen through /api/admin/unified-data-ramp, which establishes from the caller''s own session that they are a platform admin before it uses the service key. No client reaches it.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

create function platform.unified_data_store_set(p_organization_id uuid, p_on boolean,
                                                p_acting_user_id uuid default null,
                                                p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor    uuid := coalesce(p_acting_user_id, auth.uid());
  v_door     jsonb;
  v_written  jsonb;
  v_readback jsonb;
begin
  if v_actor is null then
    raise exception 'platform.unified_data_store_set: no acting user. The caller must pass p_acting_user_id — the person it has already established is a platform admin — because auth.uid() is null on a server lane and the override would otherwise be written by nobody.'
      using errcode = 'P0001';
  end if;
  if p_organization_id is null or p_on is null then
    raise exception 'platform.unified_data_store_set: name the organization and say on or off. Nothing was changed.'
      using errcode = '22004';
  end if;

  -- THE DOOR QUESTION IS STILL ASKED, exactly as platform.knob_override_set asks it.
  v_door := platform.knob_write_door_for('custom.system_enabled');
  if (v_door ->> 'ok')::boolean
     and (v_door ->> 'set_door') is distinct from 'platform.knob_override_set' then
    raise exception 'platform.unified_data_store_set: custom.system_enabled is written through %, not through this screen. That is where its own permission gate and its own audit trail live.',
      v_door ->> 'set_door'
      using errcode = 'P0001';
  end if;

  v_written := platform._knob_override_write(
    'custom', 'system_enabled', 'organization', p_organization_id, p_organization_id,
    to_jsonb(p_on),
    coalesce(p_note, 'Unified-data switch screen, the store itself, ' || (case when p_on then 'ON' else 'OFF' end)),
    v_actor);

  if v_written is null or not coalesce((v_written ->> 'ok')::boolean, false) then
    raise exception 'platform.unified_data_store_set: the override was NOT written for custom.system_enabled — the knob writer answered %. Nothing has changed and this organization has not moved.',
      coalesce(v_written::text, 'null')
      using errcode = 'P0001',
            hint = 'platform.knob_override_set RETURNS a refusal rather than raising one, so a discarded result looks exactly like success. This is the failure the consumer switch used to swallow.';
  end if;

  -- READ IT BACK. The screen may only say "switched on" when the database agrees.
  v_readback := platform.knob_resolve('custom', 'system_enabled', p_organization_id, null, null);
  if v_readback is distinct from to_jsonb(p_on) then
    raise exception 'platform.unified_data_store_set: wrote % for custom.system_enabled but platform.knob_resolve still answers % for organization %. The switch did not take.',
      to_jsonb(p_on), coalesce(v_readback::text, 'null'), p_organization_id
      using errcode = 'P0001';
  end if;

  return platform.unified_data_store_state(p_organization_id);
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', 'unified_data_store_set',
   'p_organization_id uuid, p_on boolean, p_acting_user_id uuid, p_note text',
   array['uuid'::regtype, 'boolean'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
   'p_organization_id is the only organization this call can change and is never NULL — the override it writes is keyed to it at the organization rung. p_acting_user_id is the platform admin the API route has already established from that person''s OWN session, and the write is refused when it is NULL, because an override written by nobody has no audit trail.',
   'migrations/campaign/doorfix_the_switch_screen_can_turn_the_store_on.sql',
   'server_only: the store switch on the admin screen, called through /api/admin/unified-data-ramp, which requires a super admin from the caller''s own session before it uses the service key. No client reaches it, and no client may: it decides whether a whole organization is on the record store.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
