-- lane: PAGE-BUNDLE-2
-- custom.record_page_bundle was created by pagebundle2_a_a_record_page_opens_in_one_call.sql and its
--   platform.client_callable_door row (signed-in callers) was declared there; the schema guard took the grant back
--   at CREATE time because the row did not exist yet. This hands back the EXECUTE grant that row declares
--   (custom.reopen_declared_doors, the same route as pagebundle_b_the_bundle_door_is_opened_to_signed_in_callers.sql).
--   Nothing is replaced, dropped or revoked; no table, policy or row of anybody's data is touched.
set local statement_timeout = '60s';
select custom.reopen_declared_doors();
