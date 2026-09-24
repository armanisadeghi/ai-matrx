-- chair-step: it opens the signed-in lane on S6's two new door rows (`custom.portal_form`,
--   `custom.portal_form_submit`) and runs `select custom.reopen_declared_doors()`, which ISSUES the
--   EXECUTE grant to `authenticated` that their `platform.client_callable_door` rows and the
--   re-created `custom.portal_declare(… p_config jsonb)` row declare. A GRANT is the one shape the
--   production allow-list refuses by name, so it comes through this route (the precedent is
--   uichamp_s4_a_signed_in_person_may_move_and_decide_many.sql). Nothing is replaced, dropped or
--   revoked; `anon` gains nothing (the sign-in page reads `custom.portal_public` through the server
--   lane, as before). Apply AFTER uichamp_s6_a_portal_carries_its_look_and_its_forms.sql. The
--   inverse is `migrations/inverse/uichamp_s6_a_signed_in_person_may_open_a_portals_look_and_forms_down.sql`.
-- lane: S6
-- lock: custom,platform
--
-- LANE S6, THE GRANT. The ddl guard takes a new or re-created definer's client EXECUTE back at
-- birth ("definer_client_grant_revoked"), so without this file a real signed-in connection gets
-- "permission denied for function portal_declare" — the portal builder stops saving — while a
-- psql suite that re-opens the declared doors inside its own transaction passes. The S6 seat
-- suite judges the grant BEFORE any fixture for that reason.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name in ('portal_form', 'portal_form_submit')
   and declared_by = 'uichamp_s6_a_portal_carries_its_look_and_its_forms.sql';

select custom.reopen_declared_doors();
