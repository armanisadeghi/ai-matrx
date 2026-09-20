-- chair-step: the inverse of lane FORMS — drops the five form doors, their declarations and the four columns this lane added to custom.anon_form, and nothing it did not create
--
-- LANE FORMS — THE INVERSE.
--
-- Running this takes the PRODUCT back off DOOR-17 and leaves the door itself exactly as
-- W4-ANON built it: `custom.anon_form`, `custom.anon_submission`, `custom.anon_write`,
-- `custom.anon_publish` and the rest are untouched. What goes is the declaring door, the
-- public face, the link-arm write, the owner's list and the form's notification — plus the
-- four columns those five functions are the only readers of.
--
-- DROPPING THE FOUR COLUMNS DESTROYS THE PRESENTATION OF EVERY FORM, and that is stated
-- rather than hidden: a form re-declared afterwards asks the same questions (they come
-- from `exposed_field_keys`, which is W4-ANON's own column) but loses its wording, its
-- thank-you screen, its cap and its decoy. That is why this file is a chair step.

set lock_timeout = '5s';
set statement_timeout = '600s';

drop function if exists custom.form_submit(uuid, text, jsonb, text, text, text);
drop function if exists custom.form_notify(uuid, uuid, uuid, uuid);
drop function if exists custom.form_public(uuid);
drop function if exists custom.forms(uuid, uuid);
drop function if exists custom.form_declare(uuid, uuid, text, jsonb, jsonb, integer, uuid, uuid, uuid, text);
drop function if exists custom.form_slug(uuid, text, uuid);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('form_declare', 'forms', 'form_public', 'form_notify', 'form_submit');

alter table custom.anon_form drop column if exists notify_rule_id;
alter table custom.anon_form drop column if exists honeypot_key;
alter table custom.anon_form drop column if exists submission_cap;
alter table custom.anon_form drop column if exists presentation;
