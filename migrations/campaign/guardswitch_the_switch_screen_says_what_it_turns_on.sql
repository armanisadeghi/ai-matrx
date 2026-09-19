-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- based-on: platform.unified_data_store_state(uuid) a523a5c29d92f63f5b3c034cea3d5676f7c53d8528c52090136ff9e4ebfdf84f
--
-- GUARD-SWITCH 4 — THE SWITCH SCREEN SAYS WHAT THE SWITCH NOW TURNS ON.
--
-- The store switch used to govern the doors and field promotion; after GUARD-SWITCH it also
-- governs the relation surface and its organization wall, the custom-fields layer on standard
-- tables, and the organization's own history. A screen whose sentence still describes only
-- half of that is a screen that lies about what the person is about to do, and this is the one
-- sentence the ramp renders (`storeSwitch.why`, UnifiedDataRampScreen.tsx) — so the ramp
-- covers all of them with NO new React: the text is the database's.
--
-- ADDITIVE: one `create or replace` declaring its `-- based-on:`; only the `why` string moves.
--
-- INVERSE: migrations/inverse/guardswitch_the_switch_screen_says_what_it_turns_on_down.sql

set lock_timeout = '3s';
set statement_timeout = '30s';

CREATE OR REPLACE FUNCTION platform.unified_data_store_state(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                then 'This organization is on the unified record store. Its doors take writes from its own people; a field can be promoted here; relations between records are enforced, including the wall that refuses a link into another organization unless both organizations have turned cross-organization links on; custom fields on its standard tables are checked; and its changes are recorded so "who could see this on that day" can be answered. Every consumer knob is still separate: turning this on moved nobody onto the new store.'
                else 'This organization is not on the unified record store. Its doors take writes only from the role that owns custom.record; promoting a field is refused here; the relation rules, the custom-fields checks and its own change history are all switched off with it. Turning this on does not move any consumer — every consumer knob is separate and still off.' end);
end;
$function$;
