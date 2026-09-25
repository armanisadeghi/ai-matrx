-- chair-step: the inverse of lane CAPTURE — drops the five capture doors, their declarations, the two columns and the two constraints this lane added to custom.anon_form, and nothing it did not create
--
-- LANE CAPTURE — THE INVERSE.
--
-- What goes: the crew sheet's declaring door, its publish act, the foreman's list, the
-- phone's read and the capture write. W4-ANON's `custom.anon_capture`, `custom.anon_replay`,
-- `custom.anon_form` and every FORMS door are untouched — a capture sheet declared before
-- this ran survives as an unpublished public form with its questions intact.
--
-- WHAT THIS DESTROYS, STATED RATHER THAN HIDDEN: dropping `audience` takes the only mark
-- that separates a crew sheet from a public form, so every crew sheet becomes an ordinary
-- unpublished form — it asks the same questions and it is still closed, but re-declaring it
-- as a capture sheet is a new act. Dropping `capture_opened_at` forgets which sheets the
-- crew had been given. No record, no File record and no ledger row is touched: every
-- capture that already landed keeps its `_source.via = 'capture'` provenance forever, which
-- is the point of putting the provenance on the record instead of in a side table.

set lock_timeout = '2s';
set statement_timeout = '600s';

drop function if exists custom.capture_submit(uuid, uuid, text, jsonb, jsonb, text, timestamptz, jsonb);
drop function if exists custom.capture_open(uuid, uuid);
drop function if exists custom.capture_sheets(uuid, uuid);
drop function if exists custom.capture_publish(uuid, uuid, boolean);
drop function if exists custom.capture_sheet_declare(uuid, uuid, text, jsonb, jsonb, uuid, uuid);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'capture_a_sheet_a_crew_fills_on_a_phone.sql';

alter table custom.anon_form drop constraint if exists anon_form_crew_is_never_public;
alter table custom.anon_form drop constraint if exists anon_form_audience_is_a_closed_set;
alter table custom.anon_form drop column if exists capture_opened_by;
alter table custom.anon_form drop column if exists capture_opened_at;
alter table custom.anon_form drop column if exists audience;
