-- chair-step: this REVOKES the grants lane TYPEFORM-DUP issued — EXECUTE on `custom.form_public_route(uuid, jsonb)` and `custom.form_visit(uuid, text, text, text)` from `service_role`, and on `custom.form_preview_route(uuid, uuid, jsonb, jsonb, jsonb)` and `custom.form_results(uuid, uuid)` from `authenticated` — and closes the signed-in lane on those two door rows. No function, table or row is touched; `anon` was never named.
-- lane: TYPEFORM-DUP
-- lock: custom,platform

set local lock_timeout = '2s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'opened to signed-in callers by typeform_a_signed_in_person_may_preview_a_route_and_read_results.sql'
 where schema_name = 'custom' and function_name in ('form_preview_route', 'form_results')
   and declared_by = 'typeform_a_form_routes_scores_and_counts_itself.sql';

revoke execute on function custom.form_preview_route(uuid, uuid, jsonb, jsonb, jsonb) from authenticated;
revoke execute on function custom.form_results(uuid, uuid) from authenticated;
revoke execute on function custom.form_visit(uuid, text, text, text) from service_role;
revoke execute on function custom.form_public_route(uuid, jsonb) from service_role;
