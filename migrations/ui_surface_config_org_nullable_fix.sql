-- ui_surface_config.organization_id nullable fix
-- Drift repair: the live DB had organization_id NOT NULL, contradicting the table's
-- design. The base migration (ui_surface_roles_and_config.sql) created it nullable,
-- the one_scope CHECK allows zero scopes (global rows), the ui_surface_config_unique_global
-- partial index targets all-null rows, and the RLS policies key on `organization_id IS NULL`.
-- NOT NULL broke global- and user-tier config writes (setNamespaceConfig). Sibling table
-- ui_surface_agent_pref.organization_id is already nullable. This restores parity.
-- Idempotent: DROP NOT NULL is a no-op if already nullable.

ALTER TABLE ui.ui_surface_config
  ALTER COLUMN organization_id DROP NOT NULL;
