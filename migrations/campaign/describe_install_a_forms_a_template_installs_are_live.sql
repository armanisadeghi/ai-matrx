-- describe_install_a_forms_a_template_installs_are_live.sql — lane DESCRIBE-INSTALL (2026-10-08).
--
-- A form the template install makes was a DRAFT ("Not published — the link does not answer yet"): the plan
-- could declare a form but not open it, because custom.anon_publish was not on the closed list of doors a
-- template may call. The plan now ends every form with anon_publish (template knob `publishForms`, default
-- true); this adds the door to the list. anon_publish itself still asks admin on the form's table — the
-- installer holds it, having just made the table.
--
-- based-on: custom._template_doors() 0356d181c0224f534b0fdce8d10d107a15993bfd733f06362fe52b9e224ac875

CREATE OR REPLACE FUNCTION custom._template_doors()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select array['person_kernel_id', 'file_kernel_id', 'record_write', 'record_write_many', 'record_change_many',
               'table_from_example', 'table_declare', 'field_declare', 'applicable_fields',
               'table_dimensions_set', 'view_declare', 'form_declare', 'anon_publish', 'booking_declare',
               'dashboard_declare', 'pipeline_declare', 'doc_template_save', 'action_declare',
               'subscription_declare', 'rule_declare', 'checklist_declare', 'portal_declare',
               'query_table_homes']::text[]
$function$;
