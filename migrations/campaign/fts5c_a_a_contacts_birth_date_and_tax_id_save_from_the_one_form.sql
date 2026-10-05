-- additive: yes
-- lane: FINISH-THE-SWITCH
--
-- table_api/standard_tables, token party: writable_columns gains date_of_birth and tax_id. The CRM contact form
-- now writes through the one standard-table door (StandardRecordForm) and shows Born / Tax ID; without them in the
-- list every save of those two is refused. Both live on crm.party, which authenticated already updates; the old
-- CRM form wrote them directly. Nothing a person could not already change. Idempotent.
-- Inverse: migrations/inverse/fts5c_a_a_contacts_birth_date_and_tax_id_save_from_the_one_form_down.sql.

update platform.feature_knob
   set value = jsonb_set(value, '{party,writable_columns}',
         (value #> '{party,writable_columns}') || '["date_of_birth","tax_id"]'::jsonb),
       updated_at = now()
 where feature = 'table_api' and key = 'standard_tables'
   and value -> 'party' is not null
   and not ((value #> '{party,writable_columns}') ? 'date_of_birth');

do $$
begin
  if not exists (select 1 from platform.feature_knob
       where feature = 'table_api' and key = 'standard_tables'
         and (value #> '{party,writable_columns}') ? 'date_of_birth'
         and (value #> '{party,writable_columns}') ? 'tax_id') then
    raise exception 'party writable_columns does not carry date_of_birth and tax_id';
  end if;
end $$;
