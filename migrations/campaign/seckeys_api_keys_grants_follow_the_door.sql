-- lane: SECURITY-KEYS
-- chair-step: withdraws client privileges on the credentials table iam.api_keys. Non-additive
--   by construction, and `iam` is on REVOKE_PROTECTED_SCHEMAS so the `-- allows: revoke iam`
--   route is closed on purpose. This is the bounded route: the whole body is printed and
--   confirmed before it executes. Under the owner's 2026-09-18 ruling ("everything goes live";
--   a runner-marked terminal step is run under a pseudo-terminal and confirmed) this is run by
--   the lane. It is DEFENCE IN DEPTH — CRITICAL-1 was already closed at 14:24:16 UTC by
--   seckeys_api_keys_have_exactly_one_door.sql, which refuses every client write at the row
--   level regardless of the grant.
--
-- WHAT IT DOES, AND WHY EACH LINE IS SAFE.
--
-- 1. Withdraws INSERT/UPDATE/DELETE on iam.api_keys from `authenticated` and `anon`.
--    No application code anywhere writes this table directly. The ONE writer in the product
--    is matrx-frontend/features/organizations/apiKeysService.ts, which calls the SECURITY
--    DEFINER doors iam.api_key_create / iam.api_key_revoke; those run as the table owner and
--    are unaffected by grants to client roles. aidream reads the table as `service_role`
--    (policy svc_all), also unaffected. So a key that was already impossible to write after
--    14:24:16 now also has no key to the door.
--
-- 2. Withdraws the table-level SELECT grant and re-grants SELECT on every column EXCEPT
--    `secret_hash`. Today any member of an organization can read the sha256 digest of that
--    organization's ACTIVE keys over REST — a credential digest on a surface that has no
--    reason to carry it (VERIFIER-8 recorded this beside CRITICAL-1). A column grant is
--    strictly narrower than what is there now, PostgREST honours it, and the settings screen
--    names its columns explicitly (id, key_id, name, display_prefix, status, last_used_at,
--    expires_at, revoked_at, created_at) — every one of them still granted. Only a caller
--    that asks for `secret_hash` by name, or `select=*`, is refused, and nothing in the
--    product does either.
--
-- Nothing is dropped or renamed. Inverse (rehearsal only):
--   grant select, insert, update, delete on table iam.api_keys to authenticated;

revoke insert, update, delete on table iam.api_keys from authenticated;
revoke insert, update, delete on table iam.api_keys from anon;

revoke select on table iam.api_keys from authenticated;
grant select (
  id, key_id, display_prefix, name, service_user_id, status, revoked_at,
  last_used_at, expires_at, organization_id, created_by, updated_by,
  created_at, updated_at, deleted_at, version, metadata, visibility, custom_fields
) on table iam.api_keys to authenticated;
