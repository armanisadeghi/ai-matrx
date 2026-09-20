-- chair-step: DOOR-FIX 4b's inverse — custom/field_index_guard's original label and
-- description. Only meaningful beside doorfix_promoting_a_field_follows_the_store_switch_down.

update platform.feature_knob
   set label = 'Promoted field indexes',
       description = 'Whether a field of the unified record store may be promoted to its own index in this organization.'
 where feature = 'custom' and key = 'field_index_guard';
