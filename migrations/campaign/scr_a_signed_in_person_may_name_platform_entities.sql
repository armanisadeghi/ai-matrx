-- chair-step: it (re)opens the signed-in lane on SC-R's two door rows and runs
--   `select custom.reopen_declared_doors()`, which ISSUES the EXECUTE grant to `authenticated`
--   that the two `platform.client_callable_door` rows declare, for
--   `custom.entity_reference_kinds()` (the kinds a record may point at, for the field editor's
--   picker) and `custom.entity_reference_words(uuid, jsonb)` (the words of each {token, id} for a
--   chip before anything is saved). A GRANT is the one shape the production allow-list refuses by
--   name, so it comes through this route (the same route as
--   gridprim_a_signed_in_person_may_count_rows_and_read_headers.sql). Nothing is replaced, dropped
--   or revoked; `anon` gains nothing. Apply AFTER scr_a_field_can_point_at_a_platform_entity.sql.
--   The inverse is `migrations/inverse/scr_a_signed_in_person_may_name_platform_entities_down.sql`.
-- lane: SC-R
-- lock: custom,platform
--
-- LANE SC-R · REFERENCE-FIELD, THE GRANT. The read and write doors (custom.read_record,
-- custom.record_write …) need no new grant: they are granted already and reach the new helpers
-- as their owner. Only the two catalogue doors a screen calls directly are opened here.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name in ('entity_reference_kinds', 'entity_reference_words')
   and declared_by = 'scr_a_field_can_point_at_a_platform_entity.sql';

select custom.reopen_declared_doors();
