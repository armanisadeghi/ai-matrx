-- INVERSE of migrations/campaign/import_the_shape_of_a_column_is_a_question.sql (lane IMPORT).
--
-- Every object this drops was CREATED by that file — none of them existed before it, so there
-- is nothing to restore and nothing is lost but the answers themselves. `custom.io_infer_type`,
-- W4-IO's original and much smaller guesser, is NOT touched: that file never replaced it.
--
-- RUN IT BEFORE `import_every_row_says_what_happened_to_it_down.sql`, because that file's
-- `custom.io_import_rows` calls `custom.io_infer_column` to build its proposals.

begin;

drop function if exists custom.io_import_plan(uuid, uuid, jsonb);
drop function if exists custom.io_infer_column(uuid, uuid, text, jsonb);
drop function if exists custom.io_relation_candidate(uuid, uuid, text[]);
drop function if exists custom.io_money_unit(text);
drop function if exists custom.io_sample_words(jsonb);

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('io_infer_column', 'io_import_plan');

commit;
