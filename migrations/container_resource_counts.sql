-- container_resource_counts: one round-trip replacement for the org/project/task
-- resource-count fan-out.
--
-- The FE `useContainerInventory` hook fired ~20 separate PostgREST head-count
-- queries on every mount (one per ORG_RESOURCE_CATALOGUE entry), from 3 call
-- sites (OrgWorkspace / ProjectWorkspace / TaskAssociatedResources). On edge
-- devices that's 20 round-trips (auth + connection each) to render one tile grid.
-- This collapses them to a single RPC call.
--
-- Security: SECURITY INVOKER — every count runs AS THE CALLER with RLS enforced,
-- so the numbers are exactly the RLS-filtered counts the per-table FE queries
-- produced (no info leak; a non-member can't learn another org's true totals).
-- The container column is validated against a fixed allow-list and every table
-- name comes from a hardcoded server-side whitelist — never from the client — so
-- there is no injection surface. `search_path = ''` forces fully-qualified names.
--
-- Robust to the 2026 schema reorg: each entry is counted inside its own
-- BEGIN/EXCEPTION block, and the target table + the requested container column +
-- the archived column are all checked dynamically. A table that has moved, been
-- graveyarded (e.g. workflow), or lacks the requested column is simply omitted
-- from the result — the FE renders that as an informational tile (null), exactly
-- like the old per-query catch→null path. Dynamic column detection also fixes
-- catalogue drift where `hasOrgColumn` was stale (picklist / rs_topic).
--
-- Returns rows ONLY for countable entries; the FE treats a missing key as null.
-- Idempotent (CREATE OR REPLACE).

create or replace function public.container_resource_counts(
  p_column text,
  p_container_id uuid
)
returns table(resource_key text, n bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rec record;
  v_count bigint;
  v_has_col boolean;
  v_has_arch boolean;
  v_sql text;
begin
  if p_column not in ('organization_id', 'project_id', 'task_id') then
    raise exception 'invalid container column: %', p_column;
  end if;
  if p_container_id is null then
    return;
  end if;

  for rec in
    select * from (values
      ('agent',            'agent',     'definition',        'is_archived'),
      ('agent_app',        'app',       'definition',        null),
      ('agent_shortcut',   'agent',     'shortcut',          null),
      ('skill',            'skill',     'definition',        null),
      ('content_template', 'public',    'content_template',  null),
      ('sandbox',          'public',    'sandbox_instances', null),
      ('file',             'files',     'files',             null),
      ('dataset',          'public',    'udt_datasets',      null),
      ('picklist',         'public',    'udt_picklists',     null),
      ('workbook',         'public',    'udt_workbooks',     null),
      ('transcript',       'public',    'transcripts',       null),
      ('note',             'public',    'notes',             null),
      ('conversation',     'chat',      'conversation',      null),
      ('flashcard',        'public',    'flashcard_data',    null),
      ('quiz',             'public',    'quiz_sessions',     null),
      ('canvas',           'public',    'canvas_items',      'is_archived'),
      ('research',         'public',    'rs_topic',          null),
      ('project',          'workspace', 'projects',          null),
      ('task',             'workspace', 'tasks',             null)
    ) as t(k, sch, tbl, arch)
  loop
    begin
      if to_regclass(format('%I.%I', rec.sch, rec.tbl)) is null then
        continue;
      end if;

      select exists (
        select 1 from information_schema.columns
        where table_schema = rec.sch and table_name = rec.tbl
          and column_name = p_column
      ) into v_has_col;
      if not v_has_col then
        continue;
      end if;

      v_has_arch := false;
      if rec.arch is not null then
        select exists (
          select 1 from information_schema.columns
          where table_schema = rec.sch and table_name = rec.tbl
            and column_name = rec.arch
        ) into v_has_arch;
      end if;

      v_sql := format('select count(*) from %I.%I where %I = $1', rec.sch, rec.tbl, p_column);
      if v_has_arch then
        v_sql := v_sql || format(' and %I = false', rec.arch);
      end if;

      execute v_sql into v_count using p_container_id;

      resource_key := rec.k;
      n := v_count;
      return next;
    exception when others then
      -- table moved / no access / column race during the migration → omit it.
      continue;
    end;
  end loop;
end;
$$;

grant execute on function public.container_resource_counts(text, uuid) to authenticated;

comment on function public.container_resource_counts(text, uuid) is
  'One-shot RLS-filtered resource counts for a container (organization_id / project_id / task_id). Replaces the ~20-query FE fan-out in useContainerInventory. SECURITY INVOKER; whitelisted tables; robust to the 2026 schema reorg.';
