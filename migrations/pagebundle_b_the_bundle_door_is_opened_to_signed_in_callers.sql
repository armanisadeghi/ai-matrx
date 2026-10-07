-- lane: PAGE-BUNDLE
-- custom.table_page_bundle was created by pagebundle_a_a_table_opens_in_one_call.sql and its
--   platform.client_callable_door row (signed-in callers) was declared there; the schema guard took the grant back
--   at CREATE time because the row did not exist yet. This hands back the EXECUTE grant that row declares
--   (custom.reopen_declared_doors - the same route as ap4_c_a_choice_field_is_filtered_by_the_word_a_person_sees.sql).
--   Nothing is replaced, dropped or revoked; no table, policy or row of anybody's data is touched.
set local statement_timeout = '60s';
select custom.reopen_declared_doors();
