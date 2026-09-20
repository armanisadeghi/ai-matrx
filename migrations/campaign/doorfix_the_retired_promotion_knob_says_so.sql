-- DOOR-FIX 4b — THE RETIRED PROMOTION KNOB SAYS SO.
--
-- `custom/field_index_guard` decided whether a field could be promoted, and nothing reads it
-- any more: promotion, the index DDL generator, the per-table cap and work slots all follow
-- the organization's own `custom/system_enabled` (DOOR-FIX 4, defect B1). A knob row left on
-- the settings screen still claiming to govern promotion is a lie on a screen, so it says what
-- it is. The ROW stays: deleting a knob row is not additive and the campaign does not delete.
--
-- NO `-- target:` HEADER, deliberately. An UPDATE of a registry row is not one of the
-- enumerated additive shapes and this file does not dress it up as one. It is a one-row label
-- change on a knob nothing reads.

set lock_timeout = '3s';
set statement_timeout = '30s';


update platform.feature_knob
   set label = 'Retired: promotion follows the store switch',
       description = 'Nothing reads this knob. Promoting a field, generating its index DDL, the cap on promoted fields per table and declaring work slots all follow the organization''s own custom/system_enabled, read through custom.store_is_open (DOOR-FIX, 2026-09-19, defect B1). The row is kept because deleting a knob row is not additive; it decides nothing.'
 where feature = 'custom' and key = 'field_index_guard';
