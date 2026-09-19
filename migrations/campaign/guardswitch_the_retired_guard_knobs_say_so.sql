-- GUARD-SWITCH 1b — THE RETIRED GUARD KNOBS SAY SO.
--
-- `custom/associations_guard`, `custom/entity_custom_fields_guard` and
-- `custom/row_versions_guard` decided whether the relation surface, the custom-fields layer
-- and the store's history writer did anything, and nothing reads them any more: all three
-- follow the organization's own `custom/system_enabled` through `custom.store_is_open`
-- (GUARD-SWITCH 1, the class DOOR-FIX's B1 opened). A knob row left on the settings screen
-- still claiming to govern a layer is a lie on a screen, so it says what it is. The ROWS
-- stay: deleting a knob row is not additive and the campaign does not delete.
--
-- NO `-- target:` HEADER, deliberately — the same shape as
-- `doorfix_the_retired_promotion_knob_says_so.sql`. An UPDATE of a registry row is not one of
-- the enumerated additive shapes and this file does not dress it up as one. It is a label
-- change on three knobs nothing reads.

set lock_timeout = '3s';
set statement_timeout = '30s';


update platform.feature_knob
   set label = 'Retired: relations follow the store switch',
       description = 'Nothing reads this knob. The relation contract on platform.associations — including the organization wall that refuses a link into another organization unless both sides opted in — follows the organization''s own custom/system_enabled, read through custom.store_is_open (GUARD-SWITCH, 2026-09-19). The row is kept because deleting a knob row is not additive; it decides nothing.'
 where feature = 'custom' and key = 'associations_guard';

update platform.feature_knob
   set label = 'Retired: custom fields follow the store switch',
       description = 'Nothing reads this knob. Validating a custom_fields document on a standard Entity table, and the doctrine shape rules on a field declaration, follow the organization''s own custom/system_enabled, read through custom.store_is_open (GUARD-SWITCH, 2026-09-19). The row is kept because deleting a knob row is not additive; it decides nothing.'
 where feature = 'custom' and key = 'entity_custom_fields_guard';

update platform.feature_knob
   set label = 'Retired: history follows the store switch',
       description = 'Nothing reads this knob. Recording a change, pruning value history and replaying who could see a record follow the organization''s own custom/system_enabled, read through custom.store_is_open and history.capture_is_open (GUARD-SWITCH, 2026-09-19). The row is kept because deleting a knob row is not additive; it decides nothing.'
 where feature = 'custom' and key = 'row_versions_guard';
