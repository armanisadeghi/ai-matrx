-- chair-step: undo chairdoors3b_c_a_form_or_a_booking_page_goes_to_trash_and_comes_back.sql: removes the four door rows and drops custom.form_archive, custom.form_restore, custom.forms_archived and custom.checklist_templates_archived. A form archived through the door stays archived (its row is untouched) and can then only come back with a direct change by the store's owner; nothing else is affected.
-- lane: CHAIR-DOORS-3B
delete from platform.client_callable_door
 where declared_by = 'chairdoors3b_c_a_form_or_a_booking_page_goes_to_trash_and_comes_back.sql';
drop function if exists custom.checklist_templates_archived(uuid, uuid, integer);
drop function if exists custom.forms_archived(uuid, uuid, integer);
drop function if exists custom.form_restore(uuid, uuid);
drop function if exists custom.form_archive(uuid, uuid);
