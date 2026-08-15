-- ui.ui_client was protected by NOTHING: RLS disabled, zero policies, and BOTH
-- `authenticated` AND `anon` holding SELECT+INSERT+UPDATE+DELETE. Any logged-in user —
-- and any anonymous visitor — could insert, rewrite, or delete rows in the UI client
-- registry. (Verified live 2026-08-14: rls=false, 0 policies, 6 rows, SIUD to anon and
-- authenticated.)
--
-- This is the same class and the same FAMILY as D184's `ui.ui_surface`, fixed live on
-- 2026-08-14 in `migrations/ui_surface_registry_rls_d184.sql`. `ui.ui_client` was found
-- while fixing that one and was out of D184's scope; this closes it identically.
--
-- THE FIX IS RLS, NOT GRANTS (db-rules §6d-2). Grants are left exactly as they are;
-- once RLS is on, the policies below govern every statement, and the absence of an
-- anon write policy is what closes the anon hole. Never grant past a naked table.
--
-- WHY NOT `iam.apply_rls`: the canonical generator cannot run on this table, and that
-- is a property of the table, not a shortcut taken here. ui.ui_client is a flat,
-- code-derived registry keyed on `name` — its full column list is
-- (name, description, is_active, sort_order, created_at, updated_at): NO `created_by`,
-- NO `organization_id`, NO `visibility`, NO `deleted_at`. Every generator variant hard-
-- raises or references a missing column:
--   entity/system/restricted -> 'lacks created_by' / 'lacks organization_id' (raise)
--   system                   -> additionally 'requires a visibility column' (raise)
--   ledger                   -> emits `iam.has_org_access(organization_id)` (no such column)
--   component                -> 'has no composition parent' (raise); it is the ROOT of the
--                               ui tree — ui_surface.client_name FKs to ui_client.name
-- It is also not registered in `platform.entity_types` at all (0 rows), so there is no
-- entity token to pass the generator even if a variant fit. Base-retrofitting owner/org
-- columns onto a registry derived from source code would be semantically wrong (a client
-- application has no owner and belongs to no org) and would not produce the required
-- posture anyway: the entity `std_insert` policy lets ANY authenticated user insert a row
-- naming themselves creator, which is precisely the registry-poisoning hole being closed.
--
-- SO THIS COPIES THE PATTERN ITS OWN SIBLINGS ALREADY USE — not a new security layer.
-- `ui.ui_surface`, `ui.ui_surface_value`, `ui.ui_surface_agent_role` and `tool.executor`
-- are all registries in this same family and are all policied as: read broadly, write
-- admin-only, service_role bypass. Policy names below mirror `ui.ui_surface`'s exactly.
--
-- POSTURE (db-rules §6 THE SECURITY PHILOSOPHY — over-tightening is a defect):
--   read  : UNCHANGED for everyone. authenticated + anon both keep full read. The registry
--           is derived from code in the repo; it is not secret, and its child tables
--           ui.ui_surface / ui.ui_surface_value are already anon-readable, so tightening
--           the parent would break manifest reads while protecting nothing.
--   write : Matrx admins only, via `is_admin()`, plus service_role.
--
-- WHY `is_admin()` AND NOT `is_super_admin()`: the browser admin CRUD that writes this
-- table writes as `authenticated`, and app/(admin)/layout.tsx admits ANY admin level
-- (developer/senior_admin/super_admin — Arman's 2026-07-23 directive). There are TWO such
-- paths, both under that same gate:
--   /administration/agents/lookups -> features/tool-registry/lookups/services/lookups.service.ts
--                                     (upsertUiClient, setUiClientActive)
--   /administration/ui/surfaces    -> features/surfaces/services/surfaces.service.ts
--                                     (createUiClient)
-- `ui.ui_surface` and `tool.executor`, the sibling lookup tables edited by that SAME
-- lookups page, are already policied `is_admin()`. Choosing `is_super_admin()` here would
-- let a developer-level admin open the page, save, and receive a silent 0-row no-op — the
-- exact failure db-rules §6d forbids ("a 0-row RLS-filtered write must SCREAM, never toast
-- success"). Today the distinction is academic: all rows in admin.admins are super_admin,
-- so this widens access to nobody while removing a latent silent-failure. aidream connects
-- as `postgres`, the table owner, and is RLS-exempt.
--
-- Idempotent: safe to re-run.

alter table ui.ui_client enable row level security;

drop policy if exists ui_client_read on ui.ui_client;
create policy ui_client_read on ui.ui_client
  for select to authenticated using (true);

drop policy if exists ui_client_read_anon on ui.ui_client;
create policy ui_client_read_anon on ui.ui_client
  for select to anon using (true);

drop policy if exists ui_client_write_admin on ui.ui_client;
create policy ui_client_write_admin on ui.ui_client
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists ui_client_service_role on ui.ui_client;
create policy ui_client_service_role on ui.ui_client
  for all to service_role using (true) with check (true);
