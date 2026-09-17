-- chair-step: this seeds the ONE row that declares schema `custom` closed to every client role. It is an INSERT into `platform.schema_client_exposure`, which is a registry table by every definition the additive allow-list uses but is not one of the eight that list names. Widening that allow-list unattended, to make this lane's own file easier to land, is exactly the move this campaign's rules exist to prevent — so the row travels the loud route instead, and a person reads the one statement below before it runs.
--
-- W1-PROV-CLOSED — `custom` IS DECLARED CLOSED.
--
-- This is the declaration that `migrations/campaign/w1_prov_the_provisioner_honours_declared_exposure.sql`
-- built the machinery for. Without this row the registry is empty, every schema answers
-- `exposed`, and the provisioner behaves exactly as it did before the fix — which is why the
-- two files are ordered this way and why the machinery file is safe to land on its own.
--
-- With this row present, EVERY provisioning path into schema `custom` issues no grant to
-- PUBLIC, anon, authenticated or service_role, and `platform.provision` refuses its own
-- transaction if the catalogue says the schema is reachable when it returns.
--
-- THE INVERSE: `migrations/inverse/w1_prov_closed_declares_custom_closed_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── the one row this campaign declares ────────────────────────────────────────
insert into platform.schema_client_exposure (schema_name, client_exposed, reason, declared_by)
values (
  'custom', false,
  'The unified custom-data store. It is closed to PUBLIC, anon, authenticated and service_role until switch-checklist step 3 opens it deliberately (BUILD-BOOK v5 §6.3, fact two of the OFF switch). Until then the only reach into it is as the table owner.',
  'migrations/campaign/w1_prov_closed_declares_custom_closed.sql (lane W1-PROV-CLOSED)')
on conflict (schema_name) do nothing;
