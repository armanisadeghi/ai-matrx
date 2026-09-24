-- chair-step: it declares ONE platform.client_callable_door row — custom.view_keys(), the registry
--   of every key a saved view may carry, added by uichamp_s1_a_view_keeps_every_setting_it_is_given.sql
--   — and runs `select custom.reopen_declared_doors()`, which ISSUES the EXECUTE grant to
--   `authenticated`. The ddl guard takes a new function's client EXECUTE back at birth, and a GRANT
--   is the one shape the production allow-list refuses by name, so it comes through this route (the
--   same route as gridprim_a_signed_in_person_may_ask_which_measures_there_are.sql). Nothing is
--   replaced, dropped or revoked; `anon` gains nothing; the guard's three internal functions stay
--   server-only. Apply AFTER uichamp_s1_a_view_keeps_every_setting_it_is_given.sql. The inverse is
--   `migrations/inverse/uichamp_s1_a_signed_in_person_may_read_the_view_keys_down.sql`.
-- lock: custom,platform
-- lane: S1-PRIME-VIEW-KEYS
--
-- WHY A SIGNED-IN PERSON ASKS IT. The records-ui accessor (`viewKeys.ts`) and every settings
-- control that offers a view setting read the SAME list the store judges by, so a control can
-- never offer a setting the store refuses — and the accessor's own test compares its key list
-- with this door through REST, as test@test.com.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'view_keys', '', array[]::oid[],
   'The closed list of keys a saved view (platform.saved_view, surface custom/records) may carry — path, shape, the layouts that read it and who may write it — the registry custom.view_declare judges every save against. IMMUTABLE, no argument, reads no table and no record of any organization: a view-settings control asks it so it can never offer a setting the store refuses.',
   'uichamp_s1_a_signed_in_person_may_read_the_view_keys.sql', null, true, false)
on conflict do nothing;

select custom.reopen_declared_doors();
