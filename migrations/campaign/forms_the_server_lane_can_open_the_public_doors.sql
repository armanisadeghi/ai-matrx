-- chair-step: this GRANTs USAGE on schema `custom` and EXECUTE on TWO functions to `service_role`, the role the app's server holds. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly what is opened and to whom. No REVOKE, no DROP, no data movement, no existing grant changed, and `anon` gains nothing.
-- lane: FORMS (the public form, PRODUCTS row 1)
--
-- WHAT THIS OPENS, EXACTLY
-- ------------------------
--   custom.form_public(uuid)                                    → service_role, EXECUTE
--   custom.form_submit(uuid, text, jsonb, text, text, text)     → service_role, EXECUTE
--   schema custom                                               → service_role, USAGE
--
-- and NOTHING else. `anon` is not named anywhere in this file: schema `custom` stays
-- revoked from it, which is the posture W4-ANON chose and gave its reason for, and this
-- lane agrees with that reason. The public form page is SERVER-RENDERED and its submit is
-- a route handler, so the caller of both doors is the app's server — which is the only
-- thing that knows the request's real origin and the client's address. A browser handing
-- a door its own origin and its own rate-limit bucket would be counting itself.
--
-- WHY service_role AND NOT authenticated. The person answering a public form has no
-- account. `authenticated` would mean a signed-in caller, which is the case these two
-- doors exist to avoid; `anon` would mean the browser itself, which is the case above.
-- `service_role` is reachable only with the secret key the server holds
-- (`utils/supabase/adminClient.ts`, `SUPABASE_SECRET_KEY`) and never leaves it.
--
-- service_role BYPASSES RLS, AND THAT CHANGES NOTHING HERE. Both functions are SECURITY
-- DEFINER owned by the store's owner, so they already run with the definer's authority
-- whoever calls them; the grant decides who may knock, never what the door does. What
-- each door will and will not do is its own body and its own row in
-- platform.client_callable_door. Schema USAGE alone reaches no table: every table in
-- `custom` is revoked from service_role and this file does not change that.
--
-- THE ORDER OF THE TWO KINDS OF STATEMENT IS LOAD-BEARING and it is already right:
-- `forms_a_form_is_a_view_on_a_table.sql` writes both platform.client_callable_door rows,
-- and this file runs after it. A GRANT issued BEFORE its declaration is silently revoked
-- by platform.enforce_definer_client_grants' database-wide sweep while the runner still
-- reports success — lane FORTY-FIVE measured exactly that on
-- custom.organization_kernel_id and wrote the law down. Declaration first, grant after.
--
-- Idempotent: an already-holds GRANT is a no-op.

grant usage on schema custom to service_role;

grant execute on function custom.form_public(uuid) to service_role;

grant execute on function custom.form_submit(uuid, text, jsonb, text, text, text) to service_role;
