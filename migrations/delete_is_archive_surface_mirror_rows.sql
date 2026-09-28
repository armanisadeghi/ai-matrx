-- Delete means archive (Arman, 2026-09-27): the admin Surfaces page's "Sync
-- manifests" with the stale-row option, and the drift report's per-row remove,
-- destroyed ui.ui_surface_value / agent_role / write_target / client_tool rows.
-- They now archive instead: these four mirror tables get a Trash column
-- (a positive add — db-rules §8 THE POSITIVE-ADD RULE: no existing row or read
-- changes), and each follows its surface to Trash through a declared
-- soft-delete cascade edge. A later sync that sees the row in a manifest again
-- revives it (deleted_at = null) instead of inserting a duplicate.

alter table ui.ui_surface_value        add column if not exists deleted_at timestamptz;
alter table ui.ui_surface_agent_role   add column if not exists deleted_at timestamptz;
alter table ui.ui_surface_write_target add column if not exists deleted_at timestamptz;
alter table ui.ui_surface_client_tool  add column if not exists deleted_at timestamptz;

select platform.declare_soft_delete_edge('ui','ui_surface','ui','ui_surface_value','surface_name','cascade',
  'A declared page value is part of its surface', 'delete-is-archive 2026-09-27', 'surface', 'name');
select platform.declare_soft_delete_edge('ui','ui_surface','ui','ui_surface_agent_role','surface_name','cascade',
  'An agent role is part of its surface', 'delete-is-archive 2026-09-27', 'surface', 'name');
select platform.declare_soft_delete_edge('ui','ui_surface','ui','ui_surface_write_target','surface_name','cascade',
  'A write target is part of its surface', 'delete-is-archive 2026-09-27', 'surface', 'name');
select platform.declare_soft_delete_edge('ui','ui_surface','ui','ui_surface_client_tool','surface_name','cascade',
  'A client tool is part of its surface', 'delete-is-archive 2026-09-27', 'surface', 'name');
