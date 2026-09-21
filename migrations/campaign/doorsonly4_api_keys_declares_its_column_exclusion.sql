-- lane: DOORS-ONLY-4
-- `iam.api_keys` DECLARES the column-exclusion design it has been running undeclared.
--
-- WHAT STOPPED. Regenerating `iam.api_keys` through the canonical route refuses:
--   apply_table_grants: iam.api_keys runs an UNDECLARED column-level grant design for
--   `authenticated` (19 of 20 columns granted; EXCLUDED: secret_hash) — refusing to issue
--   table-level grants, which would silently REOPEN those columns.
-- That refusal is RIGHT and is not routed around. db-rules §6d-2: the exclusion is DECLARED in
-- the registry, never inferred from the catalog, because `ADD COLUMN` leaves attacl NULL and a
-- new column is then indistinguishable from a deliberately-excluded one — inferring the set
-- would silently hide every future column from clients (proven live, 2026-08-21).
--
-- THIS DECLARES WHAT IS ALREADY TRUE, AND NOTHING ELSE. `secret_hash` is the one column
-- `authenticated` does not hold today, read from pg_attribute.attacl on the live database, not
-- chosen: 19 of 20 columns carry `authenticated=...` and `secret_hash` does not. After this row
-- the ACLs are unchanged and the intent behind them is written down, which is the whole point of
-- the design. `iam.api_keys` is the table of CRITICAL-1 (`service_user_id`, full account takeover
-- from a plain member's seat), so its grant surface is the last one that should rest on an
-- undeclared convention.
--
-- ADDITIVE: one UPDATE of one registry column on one row. No grant, no policy, no DDL.
-- Inverse: migrations/inverse/doorsonly4_api_keys_declares_its_column_exclusion.inverse.sql

update platform.entity_types
   set client_excluded_columns = array['secret_hash']
 where schema_name = 'iam' and table_name = 'api_keys'
   and client_excluded_columns is null;
