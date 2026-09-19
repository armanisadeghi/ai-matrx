-- INVERSE of migrations/campaign/guardswitch_the_switch_screen_says_what_it_turns_on.sql
-- The sentence exactly as it read before GUARD-SWITCH.

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
                then 'This organization is on the unified record store. Its doors take writes from its own people, and a field can be promoted here. Every consumer knob is still separate: turning this on moved nobody onto the new store.'
                else 'This organization is not on the unified record store. Its doors take writes only from the role that owns custom.record, and promoting a field is refused here. Turning this on does not move any consumer — every consumer knob is separate and still off.' end);
end;
$function$
;
