-- chair-step: the inverse of migrations/campaign/doorstwo_the_document_and_cadence_doors.sql and its grant file. It DROPS the five doors that file created and deletes their platform.client_callable_door rows. Nothing else is touched: custom.doc_template (the view), custom.doc_render and custom.doc_signature are not touched, no data is moved or deleted, and no pre-existing door loses a grant. Dropping these five returns the store to exactly the state lane TEST-BENCH photographed: the singular document acts work, the plural ones are refused.
-- lane: DOORS-TWO
--
-- Run this only to undo that landing. Every screen that calls one of these five will then
-- refuse with 42501, which is the honest answer, not a silent empty list.

drop function if exists custom.doc_templates(uuid, uuid);
drop function if exists custom.doc_template_delete(uuid, uuid);
drop function if exists custom.doc_renders(uuid, uuid);
drop function if exists custom.doc_signatures(uuid, uuid);
drop function if exists custom.subscription_cadences(uuid);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('doc_templates', 'doc_template_delete', 'doc_renders',
                         'doc_signatures', 'subscription_cadences');
