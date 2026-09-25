-- target: branch
--
-- W1-STORE — the canonical RLS for `custom.record`, and REC-56's certification. BRANCH ONLY.
--
-- Runs AFTER `w1_store_custom_record_store.sql`: `iam.apply_rls` reads the live table and
-- emits the canonical policy set onto it, so the table has to exist first. The registry
-- row it reads was landed by `w1_store_branch_registration.sql`, which runs BEFORE the
-- store file because both databases' event triggers refuse an entity-shaped table created
-- outside the provisioner unless the registry already names it.
--
-- Branch only, for the reason written out in the registration file: one INSERT into
-- `platform.entity_types` on production mints a live entity token, reds
-- `pnpm check:entity-types` and halts the frontend release train for every unrelated lane.
-- REC-56's `iam.canonical_certify_ok('custom','record','record')` is therefore proven
-- here; production's positive proofs are structural.

set lock_timeout = '2s';
set statement_timeout = '120s';

select iam.apply_rls('custom', 'record', 'record', 'entity');

-- 🚨 `iam.apply_rls` RE-GRANTS WHAT DOOR-N-1 REVOKED, so the door's revoke runs AGAIN here.
-- Measured on the branch 2026-09-17, immediately after the call above:
-- `information_schema.role_table_grants` showed `authenticated` holding SELECT/INSERT/
-- UPDATE/DELETE and `service_role` holding all seven on `custom.record`. That is the
-- canonical RLS contract doing its job — and it is exactly what DOOR-N-1 ("`authenticated`
-- holds no direct INSERT, UPDATE or DELETE grant on `custom.*`") and §6.3's fact two
-- ("REVOKE … from … service_role") forbid. The two contracts are not in conflict about the
-- POSTURE, only about the ORDER: the store file's revoke is the last statement in its own
-- body, and this generator runs after it.
--
-- The question does not arise on PRODUCTION, where `iam.apply_rls` is never called for this
-- token at all (registration and certification are branch-only). It arises on the branch,
-- and it is settled here rather than left as a difference between the two databases that a
-- later lane would discover as a security gap.
--
-- Note the access answer did not change either way: `has_schema_privilege('authenticated',
-- 'custom','USAGE')` is false, so a planted direct INSERT returned `42501 permission denied
-- for schema custom` even while the table grants were live. A table grant behind a revoked
-- schema is not a door — but DOOR-N-1 is written about the GRANT, not about the answer, and
-- a posture that depends on one of two locks is a posture with one lock.
revoke all on all tables in schema custom from public, anon, service_role;
revoke insert, update, delete on all tables in schema custom from authenticated;
revoke all on all tables in schema custom from authenticated;
