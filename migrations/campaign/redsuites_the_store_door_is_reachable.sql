-- chair-step: a GRANT is refused by the production allow-list by name, and this one has to
-- land before `redsuites_one_store_switch.sql` or that file narrows who may write.
--
-- RED-SUITES — THE ONE STORE DOOR IS REACHABLE BY EVERY ROLE THAT COULD READ THE SWITCH.
--
-- `redsuites_one_store_switch.sql` makes seventeen bodies ASK `custom.store_is_open` instead
-- of spelling its read out again. Six of those bodies are SECURITY INVOKER — three are
-- triggers on live `iam` and `custom` tables — so they ask the switch as whoever is writing,
-- and five of them ask it with no exception handler at all.
--
-- MEASURED on the main database, 2026-09-21:
--   platform.knob_resolve(text,text,uuid,uuid,jsonb)  EXECUTE to postgres, authenticated,
--       service_role, authenticator, cli_login_postgres, dashboard_user, matrx_provisioner, svc_seo
--   custom.store_is_open(uuid)                        EXECUTE to postgres, authenticated
--
-- So without this file the switch read would go from eight roles to three, and a
-- `service_role` write that works today would raise `permission denied for function
-- store_is_open`. The door is granted to EXACTLY `platform.knob_resolve`'s own grantees and
-- to no others: nobody who could not read the switch before can read it now.
--
-- IT DOES NOT WIDEN THE STORE. `custom.store_is_open` returns a boolean about a knob and
-- nothing else; it grants no reach to `custom.record` or to any door. And its own rule is
-- unchanged — a caller that cannot SEE the knob rows still reads CLOSED, never open.
--
-- THE INVERSE, if this ever has to come back out:
--   revoke execute on function custom.store_is_open(uuid) from service_role, authenticator,
--     matrx_provisioner, svc_seo, cli_login_postgres, dashboard_user;
-- (and `redsuites_one_store_switch.sql`'s bodies would have to come out with it).

grant execute on function custom.store_is_open(uuid) to service_role;
grant execute on function custom.store_is_open(uuid) to authenticator;
grant execute on function custom.store_is_open(uuid) to matrx_provisioner;
grant execute on function custom.store_is_open(uuid) to svc_seo;
grant execute on function custom.store_is_open(uuid) to cli_login_postgres;
grant execute on function custom.store_is_open(uuid) to dashboard_user;
