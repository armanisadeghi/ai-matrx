-- INVERSE of migrations/campaign/chair_tf_one_template_family_one_install_door.sql (lane
-- CHAIR-TEMPLATE-FAMILY). Removes the template doors, their door rows, the internals, the two
-- registrations and the two tables.
--
-- 🚨 DROPPING custom.template AND custom.template_install FORGETS EVERY DECLARED TEMPLATE AND EVERY
-- INSTALL RECORD. Nothing an install MADE is touched: its tables, records, forms, views, dashboards
-- and documents stay where they are (live or archived), they simply stop being listed as one
-- install's footprint, so uninstall can no longer take them back as a set.
-- chair-step: removes the one template family (two tables, seven doors and their platform.client_callable_door rows); what installs made stays in the store.


delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'chair_tf_one_template_family_one_install_door.sql';

drop function if exists custom.template_restore(uuid, uuid, integer);
drop function if exists custom.template_uninstall(uuid, uuid, integer);
drop function if exists custom.template_install_note(uuid, uuid, text, uuid, text);
drop function if exists custom.template_install(uuid, uuid, integer);
drop function if exists custom.templates(jsonb);
drop function if exists custom.template_declare(text, jsonb);
drop function if exists custom._template_answer(custom.template_install, jsonb);
drop function if exists custom._template_call(text, jsonb);
drop function if exists custom._template_bind(jsonb, jsonb, uuid, date, text);
drop function if exists custom._template_date(text, date, text);
drop function if exists custom._template_doors();

delete from platform.entity_types where token in ('custom_template_install', 'custom_template');
drop table if exists custom.template_install;
drop table if exists custom.template;
