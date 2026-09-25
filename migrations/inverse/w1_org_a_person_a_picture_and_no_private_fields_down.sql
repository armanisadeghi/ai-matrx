-- target: branch
--
-- INVERSE of `migrations/campaign/w1_org_a_person_a_picture_and_no_private_fields.sql`.
--
-- Before that file, `platform.custom_field_definition` carried exactly one trigger,
-- `_guard_definition` (`platform._custom_field_definition_guard()`), and neither
-- `platform._doctrine_field_shape_guard()` nor `platform.doctrine_shape_vocabulary()` existed
-- in the catalogue (measured 2026-09-18 on both databases). Nothing else was touched: the up
-- file writes no row and alters no existing object, which is why this undo is three drops.
--
-- It is a `-- target: branch` file and can never reach production. The production undo is the
-- same three statements as a chair step; while `custom/entity_custom_fields_guard` resolves
-- false the guard returns NEW untouched, so removing it changes no answer either way.

set lock_timeout = '2s';

drop trigger if exists _doctrine_field_shape_guard on platform.custom_field_definition;
drop function if exists platform._doctrine_field_shape_guard();
drop function if exists platform.doctrine_shape_vocabulary();
