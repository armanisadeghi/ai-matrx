-- chair-step: the inverse of migrations/campaign/choiceval_the_values_become_words.sql and of
--   choiceval_the_census_answers_the_operator.sql. It drops the conversion verb and the census,
--   and closes the two client doors they declared. THE CONVERSION ITSELF IS NOT UNDONE and cannot
--   be: the store no longer has a representation for a choice value held as an option record's
--   uuid, which is why the verb records its own inverse as `{"kind":"none"}` with that reason.
--   Each converted record's previous value is in history.row_versions.

set lock_timeout = '2s';
set statement_timeout = '600s';

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('choice_census', 'migrate_choice_keys');

drop function if exists custom.migrate_choice_keys(uuid, uuid, boolean);
drop function if exists custom.choice_census(uuid, uuid);
