-- chair-step: re-opens a client INSERT/UPDATE door on three Vault tables, letting the browser
-- choose which saved credential a row is about. Only run this to undo the closure.

drop policy if exists authenticator_window_client_insert_refused on browser.authenticator_window;
drop policy if exists authenticator_window_client_update_refused on browser.authenticator_window;
drop policy if exists credential_attachments_client_insert_refused on users.credential_attachments;
drop policy if exists credential_attachments_client_update_refused on users.credential_attachments;
drop policy if exists user_secret_grants_client_insert_refused on users.user_secret_grants;
drop policy if exists user_secret_grants_client_update_refused on users.user_secret_grants;
