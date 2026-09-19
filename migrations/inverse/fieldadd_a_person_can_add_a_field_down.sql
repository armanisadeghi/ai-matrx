-- INVERSE of migrations/campaign/fieldadd_a_person_can_add_a_field.sql.
--
-- It removes the three field doors and the two private helpers they call, and
-- takes their declaration rows with them. It does NOT touch a single Field a
-- person added through them: the rows those doors wrote are ordinary records in
-- `custom.record`, correct in every respect the store's own guards enforce, and
-- they stay exactly as they are. What comes back is the state the 19 September
-- verdict measured — a panel with no door to write through — which is why this
-- file exists to be RUN ONCE on a rehearsal copy and never on the database the
-- app is pointed at.
--
-- The one thing it deliberately leaves behind: options Tables the choice-list
-- door declared. They are a person's data, they hold the words a person typed,
-- and Fields still point at them. Dropping them would delete somebody's
-- dropdown to undo a code change.

set lock_timeout = '5s';
set statement_timeout = '600s';

drop function if exists custom.field_declare(uuid, uuid, jsonb);
drop function if exists custom.field_update(uuid, uuid, jsonb);
drop function if exists custom.field_retire(uuid, uuid);
drop function if exists custom._field_document_for(uuid, uuid, jsonb);
drop function if exists custom._options_table_for(uuid, text, jsonb);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('field_declare', 'field_update', 'field_retire');
