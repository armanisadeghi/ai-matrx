-- crm_ui_surfaces.sql
-- Code-first seed rows for the CRM route + two WindowPanel surfaces.
-- Manifest values/labels/groups are synced from features/surfaces/manifests.
-- Idempotent and non-destructive.

insert into ui.ui_surface (
  name,
  client_name,
  description,
  sort_order,
  is_active,
  url_pattern,
  overlay_id,
  execution_mode,
  executor_name
) values
  (
    'matrx-user/crm',
    'matrx-user',
    'People and companies manager with explicit Mine, My Orgs, and Public list scopes',
    2080,
    true,
    '/crm',
    null,
    'python-stream',
    'matrx-user'
  ),
  (
    'matrx-user/crm-manager',
    'matrx-user',
    'Floating CRM people-and-companies manager available from the main app menu',
    2081,
    true,
    null,
    'crmManagerWindow',
    'python-stream',
    'matrx-user'
  ),
  (
    'matrx-user/crm-create-party',
    'matrx-user',
    'Floating create form for a CRM person or company and optional contact methods',
    2082,
    true,
    null,
    'crmCreatePartyWindow',
    'python-stream',
    'matrx-user'
  )
on conflict (name) do update set
  client_name = excluded.client_name,
  description = excluded.description,
  is_active = true,
  url_pattern = excluded.url_pattern,
  overlay_id = excluded.overlay_id,
  execution_mode = excluded.execution_mode,
  executor_name = excluded.executor_name,
  updated_at = now();
