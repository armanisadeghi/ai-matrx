-- chair-step: DROP TRIGGER IF EXISTS only makes the new pick-follow trigger re-runnable (it does not exist yet); REVOKE keeps the new trigger function off client EXECUTE; no table, column, row or existing trigger is dropped
-- based-on: platform._cascade_soft_delete() dc03f86de170a9d83d53ccd62797e43241cb8a9fffaa04405715c539a5caec61
-- based-on: platform._guard_soft_delete_parent() c1700057abe756c50f9056e72b1460e4abe8726266d0f5d5cce7d52e1079f3c1
-- Delete means archive (Arman, 2026-09-27) — closing two partial restores.
--
-- 1. The soft-delete cascade and its child guard cast every key to uuid. The
--    surface edges (ui.ui_surface.name -> surface_name, tool.executor.name ->
--    executor_name) are TEXT keys, so live on 2026-09-28:
--      * archiving any ui.ui_surface failed with 22P02 (invalid uuid "matrx-user/tasks");
--      * EVERY insert/update of a live ui_surface_agent_role / ui_surface_config /
--        ui_surface_item_type / ui_surface_value / ui_surface_write_target /
--        ui_surface_client_tool / tool.surface_defaults / tool.binding row failed
--        the same way inside _guard_soft_delete_parent.
--    Both functions now carry the key as text and compare it cast to the real
--    column type, so uuid edges behave exactly as before (index use kept) and
--    text edges work.
--
-- 2. An agent role's picks (ui.ui_surface_agent_pref) hang off the composite key
--    (surface_name, role_name), which a single-column soft_delete_edge cannot
--    express, so the manifest sync archived them by hand and restoring the role
--    (Trash, entity_undelete, a re-declaring sync) left the picks archived.
--    A dedicated trigger now stamps the picks with the role's EXACT deleted_at
--    and, on restore, brings back exactly the picks that removal took (the same
--    rule platform._cascade_soft_delete uses).

create or replace function platform._cascade_soft_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  e record;
  v_rows bigint;
  v_parent_key text;
  v_child_type text;
begin
  for e in
    select child_schema, child_table, child_column, parent_column
      from platform.soft_delete_edge
     where parent_schema = tg_table_schema
       and parent_table  = tg_table_name
       and action = 'cascade'
     order by child_schema, child_table, child_column
  loop
    v_rows := 0;
    -- The key travels as text and is compared cast to the child column's real
    -- type: uuid edges keep their index, text edges (surface names, executor
    -- names) work instead of failing a uuid cast.
    v_parent_key := to_jsonb(new) ->> e.parent_column;
    continue when v_parent_key is null;
    select pg_catalog.format_type(a.atttypid, a.atttypmod) into v_child_type
      from pg_catalog.pg_attribute a
     where a.attrelid = pg_catalog.format('%I.%I', e.child_schema, e.child_table)::pg_catalog.regclass
       and a.attname = e.child_column and not a.attisdropped;

    -- TRASH: stamp every live part with the parent's EXACT deleted_at. The
    -- shared timestamp is what makes the restore below exact — it is the same
    -- trick platform._gc_entity_associations plays with deleted_via_id, without
    -- needing two new columns on every child table.
    if old.deleted_at is null and new.deleted_at is not null then
      execute pg_catalog.format(
        'update %I.%I set deleted_at = $1 where %I = $2::%s and deleted_at is null',
        e.child_schema, e.child_table, e.child_column, v_child_type
      ) using new.deleted_at, v_parent_key;
      get diagnostics v_rows = row_count;

    -- RESTORE: bring back exactly what THIS removal took, and nothing else. A
    -- part someone had already removed by hand keeps its own timestamp and
    -- stays removed.
    elsif old.deleted_at is not null and new.deleted_at is null then
      execute pg_catalog.format(
        'update %I.%I set deleted_at = null where %I = $1::%s and deleted_at = $2',
        e.child_schema, e.child_table, e.child_column, v_child_type
      ) using v_parent_key, old.deleted_at;
      get diagnostics v_rows = row_count;
    end if;
    if v_rows > 0 then
      -- Nothing fails silently, and nothing succeeds silently either: a removal
      -- that reached other rows says so where the DB log can be read.
      raise notice '[soft-delete-cascade] %.% -> %.%.% : % row(s) followed %.% %',
        tg_table_schema, tg_table_name, e.child_schema, e.child_table,
        e.child_column, v_rows, tg_table_schema, tg_table_name, v_parent_key;
    end if;
  end loop;

  return null;
end;
$function$;

create or replace function platform._guard_soft_delete_parent()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  e record;
  v_child_ref text;
  v_parent_type text;
  v_parent_gone timestamptz;
begin
  -- Removing the child is always allowed; only leaving it LIVE under a removed
  -- parent is refused. This also lets the cascade above do its work.
  if to_jsonb(new) ->> 'deleted_at' is not null then
    return new;
  end if;

  for e in
    select parent_schema, parent_table, parent_column, child_column, parent_noun
      from platform.soft_delete_edge
     where child_schema = tg_table_schema
       and child_table  = tg_table_name
       and action = 'cascade'
  loop
    -- Text, compared cast to the parent column's real type (uuid or text key).
    v_child_ref := nullif(to_jsonb(new) ->> e.child_column, '');
    continue when v_child_ref is null;
    select pg_catalog.format_type(a.atttypid, a.atttypmod) into v_parent_type
      from pg_catalog.pg_attribute a
     where a.attrelid = pg_catalog.format('%I.%I', e.parent_schema, e.parent_table)::pg_catalog.regclass
       and a.attname = e.parent_column and not a.attisdropped;

    execute pg_catalog.format(
      'select deleted_at from %I.%I where %I = $1::%s',
      e.parent_schema, e.parent_table, e.parent_column, v_parent_type
    ) into v_parent_gone using v_child_ref;

    if v_parent_gone is not null then
      raise exception using
        errcode = '23514',
        message = pg_catalog.format(
          'That %s has been removed, so nothing more can be added to it.',
          e.parent_noun
        ),
        detail  = pg_catalog.format(
          'This row points at %I.%I %s, which was removed on %s. Leaving it live here '
          'would put working parts under something no screen shows any more.',
          e.parent_schema, e.parent_table, v_child_ref,
          pg_catalog.to_char(v_parent_gone, 'YYYY-MM-DD HH24:MI')
        ),
        hint    = 'Restore it first if you still need it, or point this at one that is still there.';
    end if;
  end loop;

  return new;
end;
$function$;

-- An agent role's picks follow the role into Trash and back out of it.
create or replace function ui._role_picks_follow_role()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rows bigint := 0;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update ui.ui_surface_agent_pref p
       set deleted_at = new.deleted_at
     where p.surface_name = new.surface_name
       and p.role_name = new.name
       and p.deleted_at is null;
    get diagnostics v_rows = row_count;
  elsif old.deleted_at is not null and new.deleted_at is null then
    -- Exactly the picks THIS removal took; a pick removed on its own keeps its
    -- own timestamp and stays removed.
    update ui.ui_surface_agent_pref p
       set deleted_at = null
     where p.surface_name = new.surface_name
       and p.role_name = new.name
       and p.deleted_at = old.deleted_at;
    get diagnostics v_rows = row_count;
  end if;
  if v_rows > 0 then
    raise notice '[soft-delete-cascade] ui.ui_surface_agent_role -> ui.ui_surface_agent_pref : % pick(s) followed role %/%',
      v_rows, new.surface_name, new.name;
  end if;
  return null;
end;
$function$;

revoke execute on function ui._role_picks_follow_role() from public, anon, authenticated;

drop trigger if exists _role_picks_follow_role on ui.ui_surface_agent_role;
create trigger _role_picks_follow_role
  after update of deleted_at on ui.ui_surface_agent_role
  for each row execute function ui._role_picks_follow_role();
