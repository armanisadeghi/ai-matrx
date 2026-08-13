-- The ACTION half of the surface manifest, mirrored from code so the SERVER
-- (and therefore every surface-bound agent) can see what a surface can DO.
--
-- Read-only mirror of `SurfaceManifest.clientTools` (features/surfaces/types.ts),
-- the exact twin of ui.ui_surface_write_target for the action tier: write
-- targets say what an agent may CHANGE, these say what it may CALL. Without
-- this table nothing server-side knows a surface offers tools at all — the
-- inline tool specs are assembled on the client at launch, so a server-side
-- agent planning against a surface is blind to its action vocabulary.
--
-- Code is truth; rows here are written by manifest-sync.service.ts (and its
-- SQL twin scripts/emit-surface-sync-sql.ts) and read by aidream's surface
-- manifest feed. Never hand-edit.
--
-- Shape follows ui_surface_write_target's conventions (composite PK, FK to
-- ui_surface, world-readable + super-admin-write RLS, surface index). The
-- COLUMNS mirror `SurfaceClientTool`, which is a different type from
-- SurfaceWriteTarget: no value_type / updates_value / group_key / sort_order
-- (the type declares none of them), and one column write targets don't need —
-- `input_schema`, the tool's argument wire contract.
--
-- Two deliberate departures from ui_surface_write_target, both toward the
-- older ui_surface_value / ui_surface_agent_role convention:
--   * FK is ON UPDATE CASCADE as well as ON DELETE CASCADE. Surfaces CAN be
--     renamed from the admin page, and ui_surface_value / ui_surface_agent_role
--     both cascade the rename; ui_surface_write_target's missing ON UPDATE is
--     an inconsistency, not a rule to copy.
--   * `name` carries the lower_snake CHECK that ui_surface_value and
--     ui_surface_agent_role carry. `check:surface-drift` enforces the same
--     regex code-side; this is the second line of defense, and the model-facing
--     tool name must satisfy the server's tool-name rule anyway.
--
-- APPLIED LIVE 2026-08-12 via Supabase MCP (project txzxabzwovsujtloxrus).
create table if not exists ui.ui_surface_client_tool (
  surface_name  text        not null references ui.ui_surface(name) on update cascade on delete cascade,
  name          text        not null,
  label         text        not null default '',
  description   text        not null default '',
  input_schema  jsonb       not null default '{"type": "object", "properties": {}}'::jsonb,
  mode          text        not null default 'ui',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ui_surface_client_tool_pkey primary key (surface_name, name),
  constraint ui_surface_client_tool_name_chk check (name ~ '^[a-z][a-z0-9_]*$'),
  constraint ui_surface_client_tool_mode_check check (mode in ('draft', 'entity', 'ui')),
  constraint ui_surface_client_tool_input_schema_chk check (jsonb_typeof(input_schema) = 'object')
);

comment on table ui.ui_surface_client_tool is
  'Synced mirror of SurfaceManifest.clientTools — the client-side TOOLS a surface offers to agents bound to it (the action half of the 360 loop, beside ui_surface_write_target''s data-write half). Code (matrx-frontend features/surfaces/manifests) is the source of truth; rows here are written by manifest-sync.service.ts and read by aidream''s surface manifest feed. A row here means the tool is DECLARED, not that it is live: the page must also be mounted with a registered handler for the tool to be offered on a run. Never hand-edit.';

comment on column ui.ui_surface_client_tool.name is
  'Model-facing tool name. lower_snake_case, unique within the surface, and expected to be globally unique per conversation — check:surface-drift enforces cross-surface uniqueness code-side, since the tool namespace is per conversation and a collision is silently skipped at injection time.';

comment on column ui.ui_surface_client_tool.description is
  'Model-facing prose: when to call the tool, what it does to the page, and what the result means. Not UI copy.';

comment on column ui.ui_surface_client_tool.input_schema is
  'The tool''s argument wire contract — the CustomToolInputSchema shape {type:"object", properties, required} that aidream''s InlineToolSpec.input_schema accepts. Mirrored verbatim from SurfaceClientTool.inputSchema.';

comment on column ui.ui_surface_client_tool.mode is
  'What calling the tool does to the page — same meanings as ui_surface_write_target.mode: ui = ephemeral view/selection state, draft = staged into editor state (the user still saves), entity = persisted immediately. Defaults to ui, which is the safe reading of an omitted SurfaceClientTool.mode.';

alter table ui.ui_surface_client_tool enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='ui' and tablename='ui_surface_client_tool' and policyname='ui_surface_client_tool_read') then
    create policy ui_surface_client_tool_read on ui.ui_surface_client_tool for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='ui' and tablename='ui_surface_client_tool' and policyname='ui_surface_client_tool_read_anon') then
    create policy ui_surface_client_tool_read_anon on ui.ui_surface_client_tool for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='ui' and tablename='ui_surface_client_tool' and policyname='ui_surface_client_tool_service_role') then
    create policy ui_surface_client_tool_service_role on ui.ui_surface_client_tool for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='ui' and tablename='ui_surface_client_tool' and policyname='ui_surface_client_tool_write_admin') then
    create policy ui_surface_client_tool_write_admin on ui.ui_surface_client_tool for all to authenticated using (is_super_admin()) with check (is_super_admin());
  end if;
end $$;

grant select on ui.ui_surface_client_tool to anon, authenticated;
grant all on ui.ui_surface_client_tool to service_role;

create index if not exists ui_surface_client_tool_surface_idx
  on ui.ui_surface_client_tool (surface_name);
