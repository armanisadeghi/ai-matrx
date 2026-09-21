-- lane: SECURITY-SWEEP-2
-- CREDENTIAL COLUMNS ARE NEVER CLIENT-WRITABLE. (Chair ruling, 2026-09-21.)
--
-- Three tables in the Vault family (users.credential_items -- a SAVED LOGIN, an API key, a token
-- bundle -- per features/secrets/FEATURE.md:17) carry a client INSERT/UPDATE door that no client
-- code walks, and each leaves `credential_item_id` for the client to choose:
--
--   browser.authenticator_window.credential_item_id
--       WHICH SAVED CREDENTIAL A TOTP CODE WAS MINTED FOR. The row is half of the unique
--       (credential_item_id, time_step) marker that enforces "one TOTP code per credential per
--       RFC-6238 time step, ever". Written ONLY by aidream
--       (services/authenticator/live.py:81-99, AuthenticatorWindow.insert_ignore, on_conflict on
--       exactly that pair); the frontend reaches it through HTTP /enroll, never .from().
--       🚨 THIS IS THE SIBLING SECURITY-SWEEP MISSED. Its
--       secsweep_a_credential_column_is_never_client_writable.sql closed
--       browser.login_attempt.credential_item_id with the reason "choosing it client-side is
--       choosing somebody else's saved login" (:132-133) and took six columns -- this one was not
--       among them. Same table family, same sentence, same fix.
--
--   users.credential_attachments.credential_item_id
--       WHICH VAULT ITEM OWNS THIS ENCRYPTED PROTECTED FILE (a signing key, a certificate, a
--       recovery export). The client READS only, through an explicit column list
--       (VAULT_ATTACHMENT_COLUMNS, features/secrets/types.ts:349) that deliberately omits the
--       row's actual secret, `value_encrypted`; the read is features/secrets/vault-service.ts:1096.
--       There is no client insert or update anywhere.
--
--   users.user_secret_grants.credential_item_id
--       THE AUTHORIZATION RECORD ITSELF -- "person X may use or manage credential Y". A
--       client-chosen value here is self-granting access to another person's vault item. The
--       client READS only (vault-service.ts:1045-1054 self-read on can_use, :1137-1145 on
--       can_manage); grants are minted server-side.
--
-- THE CENSUS was a read of the files above, not a .from() count -- a .from() count is a signal,
-- never a proof (SECURITY-SWEEP was bitten by one).
--
-- So this removes a second path no code walks, exactly as iam.api_keys did. RESTRICTIVE policies
-- AND with the permissive ones, so no permissive policy -- present or future, generated or
-- hand-written -- can re-open the write, and their bespoke names are deliberately NOT in
-- iam.generated_policy_names(), which makes iam.apply_rls preserve them across every
-- regeneration (DD-147). service_role and every READ are untouched.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked.
-- Inverse: migrations/inverse/secsweep2_three_vault_tables_are_never_client_written.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` -- a table closed by a restrictive refusal
-- yields no findings, so all three leave the baseline.

set local lock_timeout = '2s';

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('browser','authenticator_window'),
      ('users','credential_attachments'),
      ('users','user_secret_grants')
    ) as t(schema_name, table_name)
  loop
    execute format(
      'create policy %I on %I.%I as restrictive for insert to authenticated, anon with check (false)',
      r.table_name || '_client_insert_refused', r.schema_name, r.table_name);
    execute format(
      'create policy %I on %I.%I as restrictive for update to authenticated, anon using (false) with check (false)',
      r.table_name || '_client_update_refused', r.schema_name, r.table_name);
    execute format(
      'comment on policy %I on %I.%I is %L',
      r.table_name || '_client_insert_refused', r.schema_name, r.table_name,
      'SECURITY-SWEEP-2 2026-09-21: a credential column is never client-writable. This table lets the client choose credential_item_id -- which saved login a row is about -- and no client code writes it at all. RESTRICTIVE so no permissive policy can re-open it; bespoke on purpose, so iam.apply_rls preserves it. Reads are untouched.');
    raise notice 'secsweep2: %.% no longer takes a client write', r.schema_name, r.table_name;
  end loop;
end $$;
