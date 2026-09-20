-- chair-step: REVOKEs, which the additive allow-list refuses by name at production — and correctly, because a blacklist cannot tell a closing revoke from a door being taken away. These four close schema `custom` again after a file created new functions in it: PostgreSQL gives every new function EXECUTE to PUBLIC, PUBLIC reaches anon, and the provisioner's own closed-schema proof refuses the next build while any of them stands. This is §6.3's fact two of the OFF switch, re-asserted; it grants nothing and opens nothing. Pass 3 of the landing.
--
-- LAND — SCHEMA `custom` HOLDS NO CLIENT GRANT (pass 3).
--
-- WHY A FILE AND NOT A ONE-OFF. `platform.provision`'s closed-schema proof reads the WHOLE
-- schema from the catalogue at the end of every build and refuses when any client role can
-- reach anything in it. Measured on the main database 2026-09-18 19:33 UTC, after
-- `w1_field_definitions_and_validation.sql` landed:
--
--     provision: custom.external_source refused certification
--       - function-execute validate_values(...): role anon can EXECUTE
--       - function-execute validate_values(...): role authenticated can EXECUTE
--       - function-execute validate_values(...): role service_role can EXECUTE
--       - function-execute validate_custom_fields(...): role service_role can EXECUTE
--
-- `proacl` on every function in `custom` read NULL — the PostgreSQL default, which IS
-- `PUBLIC=EXECUTE`. The campaign's files create functions in `custom` directly (not through
-- the provisioner, which revokes its own), so the schema needs closing again after each wave.
-- That is what this file is, and why there is more than one of it.
--
-- THE INVERSE IS THE SWITCH CHECKLIST, and it is deliberate: opening `custom` to a client role
-- is step 3 of the switch, with its own decision, never a lane's.

set lock_timeout = '5s';
set statement_timeout = '120s';

revoke all on schema custom from public, anon, authenticated, service_role;
revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all sequences in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
alter default privileges in schema custom revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema custom revoke all on functions from public, anon, authenticated, service_role;
alter default privileges in schema custom revoke all on sequences from public, anon, authenticated, service_role;
