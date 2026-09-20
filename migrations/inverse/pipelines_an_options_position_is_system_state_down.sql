-- INVERSE of migrations/campaign/pipelines_an_options_position_is_system_state.sql
-- (lane PIPELINES). Takes the one declaration back, which makes `platform._metadata_guard`
-- refuse `option_position` again — so run this only together with the inverse of
-- `pipelines_a_choice_list_keeps_the_order_it_was_written_in.sql`, which is what writes it.
delete from platform.metadata_reserved_keys
 where table_token = 'record' and key = 'option_position';
