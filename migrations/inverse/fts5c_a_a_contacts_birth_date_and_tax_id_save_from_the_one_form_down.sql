-- Inverse of fts5c_a_a_contacts_birth_date_and_tax_id_save_from_the_one_form.sql: back to the nine identity columns.
update platform.feature_knob
   set value = jsonb_set(value, '{party,writable_columns}',
         '["display_name","first_name","last_name","job_title","headline","legal_name","primary_domain","timezone","bio"]'::jsonb),
       updated_at = now()
 where feature = 'table_api' and key = 'standard_tables' and value -> 'party' is not null;
