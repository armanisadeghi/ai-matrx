-- lane: SECURITY-KEYS
-- CRITICAL-1 (VERIFIER-8, 2026-09-21; feedback 2bf46257-ac5f-4213-8a32-af2498979de9)
--
-- THE HOLE. `iam.api_keys` is a credentials table served directly over PostgREST with
-- INSERT/UPDATE/DELETE granted to `authenticated`. Its `std_insert` WITH CHECK pinned
-- `created_by` and `organization_id` and said NOTHING about `service_user_id` — the column
-- that decides WHOSE IDENTITY a presented key adopts — and nothing about `secret_hash` —
-- the digest the server compares the presented token against. So any signed-in member of any
-- organization could POST an ACTIVE row carrying a secret she chose and the organization
-- owner's user id, then present `mx_live_<key_id>_<secret>` to the AI server and be
-- authenticated AS THE OWNER (aidream `services/api_keys/service.py::resolve_api_key` adopts
-- `row.service_user_id` after a constant-time compare against `row.secret_hash`). Full
-- account takeover from a plain member seat. Proven live by VERIFIER-8; both probe rows were
-- removed by the verifier, and `iam.api_keys` holds 3 rows, all `revoked`, all minted by the
-- real door, all with a `provider = 'api_key'` service principal.
--
-- THE FIX: CLOSING A CLASS MEANS REMOVING THE DOOR, not adding a safe path beside an unsafe
-- one. A legitimate API key CANNOT be written by a client at all — not even with
-- `service_user_id` pinned to `auth.uid()`, because the identity a real key carries is a
-- freshly minted `auth.users` service principal that a client has no way to create. The one
-- legitimate path already exists and is the only one the app uses
-- (`matrx-frontend/features/organizations/apiKeysService.ts`):
--
--   iam.api_key_create(org, name, expires_at)  SECURITY DEFINER, organization OWNER only.
--       Mints the key_id and a 32-byte random secret server-side, stores only sha256(token),
--       mints the service principal, returns the plaintext exactly ONCE.
--   iam.api_key_revoke(id)                     SECURITY DEFINER, the revoke path.
--
-- So every direct client write is refused at the row level, unconditionally. These are
-- RESTRICTIVE policies: they AND with the permissive ones, so no permissive policy — present
-- or future, generated or hand-written — can re-open the write. They carry bespoke names that
-- are deliberately NOT in `iam.generated_policy_names()`, which is exactly what makes
-- `iam.apply_rls` preserve them across every regeneration (DD-147 drift guard: it drops only
-- the names in that catalog and keeps everything else).
--
-- `service_role` (the aidream server, policy `svc_all`) and `postgres` are untouched: the
-- server must still read `secret_hash` to authenticate a presented key, and the SECURITY
-- DEFINER doors run as the table owner and are not subject to these policies.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked here. The grants are withdrawn separately
-- in `seckeys_api_keys_grants_follow_the_door.sql`, which is non-additive and therefore a
-- chair step; this file alone already closes the hole, so that one is defence in depth.
-- Inverse: `drop policy api_keys_client_{insert,update,delete}_refused on iam.api_keys;`
-- Guard: matrx-frontend `scripts/check-unpinned-security-columns.mjs`
-- (`pnpm check:unpinned-security-columns`) fails on these exact policy bytes if they go away.

create policy api_keys_client_insert_refused on iam.api_keys
  as restrictive for insert to authenticated, anon
  with check (false);

create policy api_keys_client_update_refused on iam.api_keys
  as restrictive for update to authenticated, anon
  using (false) with check (false);

create policy api_keys_client_delete_refused on iam.api_keys
  as restrictive for delete to authenticated, anon
  using (false);

comment on policy api_keys_client_insert_refused on iam.api_keys is
  'CRITICAL-1 (VERIFIER-8 2026-09-21): a client can never write an API-key row. std_insert pinned created_by and organization_id but not service_user_id or secret_hash, so a member could mint an active key carrying the owner''s identity and a secret of her choosing. The only way to create a key is iam.api_key_create, which mints the secret and the service identity server-side. RESTRICTIVE so no permissive policy can re-open it; bespoke on purpose, so iam.apply_rls preserves it.';
comment on policy api_keys_client_update_refused on iam.api_keys is
  'CRITICAL-1: a client can never edit an API-key row — status, secret_hash, service_user_id and expires_at are all takeover-shaped. Retiring a key goes through iam.api_key_revoke.';
comment on policy api_keys_client_delete_refused on iam.api_keys is
  'CRITICAL-1: credentials are revoked, never deleted by a client.';

comment on column iam.api_keys.service_user_id is
  'The identity a presented key adopts. Written ONLY by iam.api_key_create, which mints a dedicated auth.users principal stamped raw_app_meta_data->>''provider'' = ''api_key''. It is deliberately never the creating human, so "service_user_id = created_by" is NOT the legitimacy test; being a minted api_key principal is, and the server refuses any key whose service_user_id is not one (aidream services/api_keys/service.py). CRITICAL-1, 2026-09-21.';
comment on column iam.api_keys.secret_hash is
  'sha256 of the full mx_live_ token. Never written by a client. Its SELECT grant to authenticated is withdrawn by seckeys_api_keys_grants_follow_the_door.sql. CRITICAL-1, 2026-09-21.';
