-- chair-step: it GRANTs EXECUTE on `custom.form_public_route(uuid, jsonb)` and `custom.form_visit(uuid, text, text, text)` to `service_role` (the app's server), and opens the signed-in lane on the two door rows typeform_a_form_routes_scores_and_counts_itself.sql declares for `custom.form_preview_route` and `custom.form_results`, then runs `select custom.reopen_declared_doors()`, which issues the EXECUTE grant to `authenticated` those rows declare. A GRANT is the one shape the production allow-list refuses by name, so it comes through this route. Nothing is replaced, dropped or revoked; `anon` gains nothing. Apply AFTER that file. The inverse is `migrations/inverse/typeform_a_signed_in_person_may_preview_a_route_and_read_results_down.sql`.
-- lane: TYPEFORM-DUP
-- lock: custom,platform

set local lock_timeout = '2s';
set local statement_timeout = '60s';

grant execute on function custom.form_public_route(uuid, jsonb) to service_role;
grant execute on function custom.form_visit(uuid, text, text, text) to service_role;

update platform.client_callable_door
   set argument_rules = jsonb_build_object('version', 1, 'declared_by', 'typeform_a_form_routes_scores_and_counts_itself.sql',
     'declared_at', '2026-10-07 lane TYPEFORM-DUP',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_store_door(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-10-07 lane TYPEFORM-DUP — written with this body'),
       'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_table',
         'check', 'asked custom.assert_client_may_open(arg1, arg2, viewer, table) after arg1 is decided; a Table the caller may not open raises exactly as an invented id does.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-10-07 lane TYPEFORM-DUP — written with this body'),
       'p_questions', jsonb_build_object('type', 'jsonb', 'position', 3, 'not_an_id', true,
         'check', 'the caller''s own draft questions; each showIf and jump is evaluated by custom.rule_eval with an empty context.'),
       'p_endings', jsonb_build_object('type', 'jsonb', 'position', 4, 'not_an_id', true,
         'check', 'the caller''s own draft endings; each condition is evaluated by custom.rule_eval with an empty context.'),
       'p_values', jsonb_build_object('type', 'jsonb', 'position', 5, 'not_an_id', true,
         'check', 'the caller''s own answers so far, narrowed to the questions'' own keys.')))
 where schema_name = 'custom' and function_name = 'form_preview_route'
   and declared_by = 'typeform_a_form_routes_scores_and_counts_itself.sql';

update platform.client_callable_door
   set argument_rules = jsonb_build_object('version', 1, 'declared_by', 'typeform_a_form_routes_scores_and_counts_itself.sql',
     'declared_at', '2026-10-07 lane TYPEFORM-DUP',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_store_door(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-10-07 lane TYPEFORM-DUP — written with this body'),
       'p_form_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'anon_form',
         'check', 'resolved with organization_id = arg1 and deleted_at is null (a form of another organization raises the same 23503 as an invented id), then custom.assert_client_may_open(arg1, its table, viewer, table).',
         'foreign', jsonb_build_object('sqlstate', '23503', 'same_as_invented', true), 'verified', '2026-10-07 lane TYPEFORM-DUP — written with this body')))
 where schema_name = 'custom' and function_name = 'form_results'
   and declared_by = 'typeform_a_form_routes_scores_and_counts_itself.sql';

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name in ('form_preview_route', 'form_results')
   and declared_by = 'typeform_a_form_routes_scores_and_counts_itself.sql';

select custom.reopen_declared_doors();
