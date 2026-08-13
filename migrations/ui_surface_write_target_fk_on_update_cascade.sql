-- ui.ui_surface_write_target: add the missing ON UPDATE CASCADE to the
-- surface_name FK so renaming a surface carries its write targets along.
--
-- Every other FK onto ui.ui_surface(name) already cascades on update
-- (ui_surface_value, ui_surface_agent_role, ui_surface_client_tool,
-- ui_surface_config, tool.surface_defaults, tool.ui, agent.shortcut, and the
-- parent_surface_name self-FK). This table, added 2026-07-29, was the sole
-- holdout: its FK was ON DELETE CASCADE only, so ON UPDATE defaulted to
-- NO ACTION and Postgres REJECTED the parent rename outright with SQLSTATE
-- 23503 -- renameSurface() is a single UPDATE that relies entirely on
-- DB-level cascade, so 108 of 185 surfaces could not be renamed at all.
--
-- Constraint options only; no data is read, written, or moved.
-- Verified live: 368 write-target rows before and after, 0 orphans.
--
-- APPLIED LIVE 2026-08-13 via Supabase MCP (project txzxabzwovsujtloxrus).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'ui.ui_surface_write_target'::regclass
      and conname  = 'ui_surface_write_target_surface_name_fkey'
      and confupdtype <> 'c'
  ) then
    alter table ui.ui_surface_write_target
      drop constraint ui_surface_write_target_surface_name_fkey;

    alter table ui.ui_surface_write_target
      add constraint ui_surface_write_target_surface_name_fkey
      foreign key (surface_name) references ui.ui_surface(name)
      on update cascade on delete cascade;
  end if;
end $$;
