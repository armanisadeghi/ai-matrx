-- additive: yes
-- lane: FINISH-THE-SWITCH
--
-- table_api/standard_tables, token party: writable_columns lists the nine identity columns the CRM
-- record form already edits (display_name, first_name, last_name, job_title, headline, legal_name,
-- primary_domain, timezone, bio). Every one already has authenticated UPDATE and the form writes
-- them directly; nothing a person could not already change. Data rows are untouched. Idempotent.
-- Inverse: migrations/inverse/fts2c_a_a_contact_names_the_columns_the_crm_form_edits_down.sql.

update platform.feature_knob
   set value = jsonb_set(value, '{party,writable_columns}',
         '["display_name","first_name","last_name","job_title","headline","legal_name","primary_domain","timezone","bio"]'::jsonb),
       updated_at = now()
 where feature = 'table_api' and key = 'standard_tables'
   and value -> 'party' is not null
   and value #> '{party,writable_columns}' is distinct from
       '["display_name","first_name","last_name","job_title","headline","legal_name","primary_domain","timezone","bio"]'::jsonb;

do $$
begin
  if (select jsonb_array_length(value #> '{party,writable_columns}') from platform.feature_knob
       where feature = 'table_api' and key = 'standard_tables') is distinct from 9 then
    raise exception 'party writable_columns was not set to the nine identity columns';
  end if;
end $$;
