-- Inverse of migrations/campaign/fts2c_a_a_contact_names_the_columns_the_crm_form_edits.sql.
update platform.feature_knob
   set value = jsonb_set(value, '{party,writable_columns}', '[]'::jsonb), updated_at = now()
 where feature = 'table_api' and key = 'standard_tables' and value -> 'party' is not null;
