-- Re-run of drop_graveyard_to_live_fks.sql (first applied 2026-07-28).
--
-- That migration was treated as a ONE-TIME sweep, so every table retired into
-- `graveyard` after that date carried its outbound FKs into live tables again:
-- 78 such FKs existed on 2026-08-13, two of them into workspace.projects.
--
-- Those two broke public.get_project_references for EVERY project page with
-- "42501 permission denied for schema graveyard": the RPC discovers tables to
-- count by walking the FKs that point at workspace.projects, then queries each
-- one as the signed-in user — who deliberately has no USAGE on graveyard.
--
-- Graveyard tables are archival dead data. Their FKs must never constrain live
-- rows or advertise the dead table to a catalog walker. Intra-graveyard FKs are
-- left in place (harmless).
--
-- IDEMPOTENT BY DESIGN — this is a post-condition of every graveyard move, not a
-- one-time migration. Re-run it after retiring any table.
-- (.claude/skills/db-graveyard-table/SKILL.md step 3 now says so.)

do $$
declare
  r record;
  v_dropped integer := 0;
begin
  for r in
    select conname, conrelid::regclass as from_table
    from pg_constraint
    where contype = 'f'
      and conrelid::regclass::text like 'graveyard.%'
      and confrelid::regclass::text not like 'graveyard.%'
  loop
    execute format('alter table %s drop constraint %I', r.from_table, r.conname);
    v_dropped := v_dropped + 1;
  end loop;
  raise notice 'dropped % graveyard->live foreign keys', v_dropped;
end $$;
