-- Drop every FK that points FROM a graveyard.* table INTO a live (non-graveyard) table.
-- Graveyard tables are archival dead data; their FKs must never constrain live rows.
-- Found when deleting zero-reference ui.ui_surface rows failed on
-- graveyard.agent_surface's agx_agent_surface_surface_name_fkey (2026-07-28).
-- ~180 such FKs existed (auth.users, iam.organizations, workspace.*, ui.*, ai.*, ...).
-- Intra-graveyard FKs are left in place (harmless).
-- Idempotent: the loop only drops what exists.

do $$
declare r record;
begin
  for r in
    select conname, conrelid::regclass as from_table
    from pg_constraint
    where contype = 'f'
      and conrelid::regclass::text like 'graveyard.%'
      and confrelid::regclass::text not like 'graveyard.%'
  loop
    execute format('alter table %s drop constraint %I', r.from_table, r.conname);
  end loop;
end $$;
