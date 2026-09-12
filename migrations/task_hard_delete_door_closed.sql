-- =============================================================================
-- A TASK IS NEVER DESTROYED BY A CLICK (DD-119).
--
-- 🚨 The defect, measured live on this database 2026-09-12 during the K-2 walk:
-- deleting a task from /tasks issued `DELETE FROM workspace.tasks` straight from
-- the browser. The task AND its subtask were GONE from the table — not
-- `deleted_at`-stamped, gone — while the dialog said only "Delete this task?
-- This cannot be undone." On the same afternoon, on the same platform, deleting
-- a chat was a SOFT delete whose dialog explained the rows are kept for
-- recovery. Two deletion semantics, two dialogs, one platform.
--
-- `workspace.tasks` is a registered entity (`token = 'task'`) with
-- `has_soft_delete = true` and a live `deleted_at` column. Everything needed to
-- do this right already existed; nothing pointed the client at it, and nothing
-- stopped the client from going around it.
--
-- WHY THE DATABASE AND NOT THE SERVICE. db-rules §8a: the meaning of removal
-- lives beside the row, because a row is reachable through doors that share no
-- code — three of them hard-deleted tasks in this repo alone
-- (`features/tasks/services/taskService.ts`,
-- `features/agent-context/service/hierarchyService.ts`,
-- `features/agent-context/redux/tasksSlice.ts`). An answer written in one leaves
-- the others wrong, and the next one written tomorrow starts wrong.
--
-- WHAT THIS FILE DOES
--   1. `platform._refuse_client_hard_delete()` — a generic BEFORE DELETE refusal
--      for CLIENT roles only (`authenticated`, `anon`). The server lane
--      (service_role, postgres, migrations) is untouched: purging really is a
--      server-side act, and this is not the purge policy.
--   2. `platform.protect_from_client_hard_delete(schema, table)` — the attacher,
--      so closing this door on the next table is one call and not a new trigger.
--   3. The `workspace.tasks` soft-delete edges: a SUBTASK is a PART of its task
--      (cascade, §8a); the seven soft-deletable rows that merely REFERENCE a
--      task are declared `keep`, with reasons, so none of them sits unruled on
--      `platform.v_soft_delete_edge_unclassified`.
--   4. `public.__client_hard_delete_conformance()` — the liveness assertion read
--      by `pnpm check:client-hard-delete`, because a dropped trigger leaves this
--      file on disk looking exactly the same (db-rules §1).
--
-- SCOPE. This closes the door on `workspace.tasks` and builds the primitive. It
-- does NOT sweep the platform: the census of every other client path that hard
-- deletes a registered soft-deletable table ships with the guard, as its
-- allow-list of known offenders, each of which is a fix somebody owns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. THE REFUSAL — client roles may remove a thing, never destroy it.
-- -----------------------------------------------------------------------------
create or replace function platform._refuse_client_hard_delete()
returns trigger
language plpgsql
as $fn$
declare
  -- The noun a person calls this thing, and the registry token of its entity,
  -- both handed in by the attacher. 🚨 They are ARGUMENTS and not a registry
  -- lookup on purpose: this trigger runs as the CALLER (see below), and
  -- `platform.entity_types` is not readable that way — measured 2026-09-12, the
  -- first draft's `select et.label ...` silently returned NULL under RLS and the
  -- refusal told the person "A tasks is never permanently deleted".
  v_noun  text := coalesce(tg_argv[0], tg_table_name);
  v_token text := coalesce(tg_argv[1], tg_table_name);
begin
  -- The server lane is deliberately untouched. PostgREST runs every browser
  -- request as `authenticated` or `anon`; anything else here is our own
  -- server, a migration, or a human at psql, and destroying a row there is a
  -- decision somebody made on purpose.
  if current_user not in ('authenticated', 'anon') then
    return old;
  end if;

  raise exception using
    errcode = '42501',
    message = format(
      'A %s is never permanently deleted from the app. Move it to the trash instead, and it can be restored.',
      v_noun
    ),
    detail = format(
      'A DELETE on %I.%I was refused for role %s. This entity is soft-deletable: removing it '
      'means setting deleted_at, which also takes its parts with it and can be undone.',
      tg_table_schema, tg_table_name, current_user
    ),
    hint = format(
      'Use the soft-delete door: update %I.%I set deleted_at = now() where id = ..., or call '
      'public.entity_soft_delete(%L, id). Restore with public.entity_undelete(%L, id).',
      tg_table_schema, tg_table_name, v_token, v_token
    );
end;
$fn$;

comment on function platform._refuse_client_hard_delete() is
  'BEFORE DELETE refusal for client roles on a soft-deletable entity table. '
  'Attach it with platform.protect_from_client_hard_delete. db-rules FEATURE.md §8.';

-- SECURITY INVOKER on purpose: it decides nothing about permission, it only
-- refuses, and it must see the REAL calling role. As DEFINER `current_user`
-- would be the owner and every browser delete would sail through.

-- -----------------------------------------------------------------------------
-- 2. THE ATTACHER — one call closes the door on one table.
-- -----------------------------------------------------------------------------
create or replace function platform.protect_from_client_hard_delete(
  p_schema text, p_table text, p_noun text, p_token text)
returns void
language plpgsql
as $fn$
begin
  if coalesce(trim(p_noun), '') = '' or coalesce(trim(p_token), '') = '' then
    raise exception
      'platform.protect_from_client_hard_delete: %.% needs the word a PERSON calls this thing and its registry token — the refusal speaks to a person, not to a DBA.',
      p_schema, p_table;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = p_schema and table_name = p_table and column_name = 'deleted_at'
  ) then
    raise exception
      'platform.protect_from_client_hard_delete: %.% has no deleted_at column, so refusing DELETE would leave no way to remove a row at all.',
      p_schema, p_table;
  end if;

  execute format('drop trigger if exists _refuse_client_hard_delete on %I.%I', p_schema, p_table);
  execute format(
    'create trigger _refuse_client_hard_delete before delete on %I.%I '
    'for each row execute function platform._refuse_client_hard_delete(%L, %L)',
    p_schema, p_table, p_noun, p_token
  );
end;
$fn$;

comment on function platform.protect_from_client_hard_delete(text, text, text, text) is
  'Attaches the client hard-delete refusal to one soft-deletable entity table, carrying the '
  'human noun and the registry token into the refusal message. Refuses a table with no '
  'deleted_at, because that would leave no way to remove a row.';

-- The first draft of this file took two arguments; drop it so no caller can
-- attach a refusal that has no word for the thing it protects.
drop function if exists platform.protect_from_client_hard_delete(text, text);

select platform.protect_from_client_hard_delete('workspace', 'tasks', 'task', 'task');

-- -----------------------------------------------------------------------------
-- 3. WHAT A TASK'S PARTS ARE (db-rules §8a).
-- -----------------------------------------------------------------------------
-- A subtask is a PART of its task. Until now the only thing that took subtasks
-- with their parent was the FK's ON DELETE CASCADE — which is to say, the very
-- hard delete this file just refused.
select platform.declare_soft_delete_edge(
  'workspace', 'tasks', 'workspace', 'tasks', 'parent_task_id', 'cascade',
  'A subtask is a part of its task, not a thing of its own: it is created inside it, shown inside it, '
  'and means nothing after its parent is gone. Removing the task trashes its subtasks with it, and '
  'restoring the task brings back exactly the ones that removal took.',
  'matrx-frontend/migrations/task_hard_delete_door_closed.sql (DD-119)', 'task');

-- Everything else that points at a task REFERENCES it; none of them is a part
-- of it, and each keeps its own life when the task is trashed.
select platform.declare_soft_delete_edge(
  'workspace', 'tasks', 'agent', 'definition', 'task_id', 'keep',
  'An agent that was created for a task is its own thing with its own life; trashing the task must not take the agent.',
  'matrx-frontend/migrations/task_hard_delete_door_closed.sql (DD-119)', 'task');

select platform.declare_soft_delete_edge(
  'workspace', 'tasks', 'chat', 'conversation', 'task_id', 'keep',
  'A conversation held about a task is the record of what people said. The task going to the trash must never erase it.',
  'matrx-frontend/migrations/task_hard_delete_door_closed.sql (DD-119)', 'task');

select platform.declare_soft_delete_edge(
  'workspace', 'tasks', 'chat', 'user_todo', 'ctx_task_id', 'keep',
  'A personal to-do that merely names a task as its context is that person''s own list item, not a part of the task.',
  'matrx-frontend/migrations/task_hard_delete_door_closed.sql (DD-119)', 'task');

select platform.declare_soft_delete_edge(
  'workspace', 'tasks', 'public', 'app_instances', 'task_id', 'keep',
  'A running app instance is live machinery with its own lifecycle; it is stopped, never trashed by a task.',
  'matrx-frontend/migrations/task_hard_delete_door_closed.sql (DD-119)', 'task');

select platform.declare_soft_delete_edge(
  'workspace', 'tasks', 'public', 'sandbox_instances', 'task_id', 'keep',
  'A sandbox instance is live machinery with its own lifecycle; it is stopped, never trashed by a task.',
  'matrx-frontend/migrations/task_hard_delete_door_closed.sql (DD-119)', 'task');

select platform.declare_soft_delete_edge(
  'workspace', 'tasks', 'transcripts', 'transcripts', 'task_id', 'keep',
  'A transcript is a recording of something that actually happened. Trashing the task it was filed under must not remove the evidence.',
  'matrx-frontend/migrations/task_hard_delete_door_closed.sql (DD-119)', 'task');

select platform.declare_soft_delete_edge(
  'workspace', 'tasks', 'workbench', 'udt_datasets', 'task_id', 'keep',
  'A dataset created while working on a task is the person''s data and outlives the task it was made for.',
  'matrx-frontend/migrations/task_hard_delete_door_closed.sql (DD-119)', 'task');

-- -----------------------------------------------------------------------------
-- 4. THE LIVENESS ASSERTION — read by pnpm check:client-hard-delete.
-- -----------------------------------------------------------------------------
create or replace function public.__client_hard_delete_conformance()
returns table (check_key text, ok boolean, severity text, detail jsonb)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_protected jsonb;
  v_soft_deletable jsonb;
  v_bad_shape jsonb;
  v_definer jsonb;
begin
  -- Every registered, active entity whose table really carries deleted_at. This
  -- is the population the source-scanning half of the gate resolves its
  -- `.delete()` hits against — the registry flag alone is not enough, because
  -- the column is what the soft-delete doors key on (db-rules §8).
  select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into v_soft_deletable
  from (
    select et.schema_name || '.' || et.table_name as x
      from platform.entity_types et
      join information_schema.columns c
        on c.table_schema = et.schema_name
       and c.table_name = et.table_name
       and c.column_name = 'deleted_at'
     where et.is_active
       and et.relation_kind = 'table'
  ) s;

  -- The tables whose client hard-delete door is actually shut, read from
  -- pg_trigger and not from this file.
  select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into v_protected
  from (
    select n.nspname || '.' || c.relname as x
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where t.tgname = '_refuse_client_hard_delete'
       and not t.tgisinternal
       and t.tgenabled <> 'D'
       and (t.tgtype & 8) = 8    -- DELETE
       and (t.tgtype & 2) = 2    -- BEFORE
       and (t.tgtype & 1) = 1    -- ROW
  ) s;

  -- A trigger of that NAME that is disabled, or AFTER, or STATEMENT-level, is
  -- still in pg_trigger while refusing nothing.
  select coalesce(jsonb_agg(n.nspname || '.' || c.relname order by n.nspname, c.relname), '[]'::jsonb)
    into v_bad_shape
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where t.tgname = '_refuse_client_hard_delete'
     and not t.tgisinternal
     and (t.tgenabled = 'D' or (t.tgtype & 8) <> 8 or (t.tgtype & 2) <> 2 or (t.tgtype & 1) <> 1);

  -- As SECURITY DEFINER the refusal would read the OWNER as current_user and
  -- wave every browser delete through. The flip is silent and total.
  select coalesce(jsonb_agg(p.proname), '[]'::jsonb) into v_definer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform'
     and p.proname = '_refuse_client_hard_delete'
     and p.prosecdef;

  return query
  select 'tasks_door_shut',
         v_protected ? 'workspace.tasks', 'error',
         jsonb_build_object(
           'why', 'The defect this primitive was built for: a browser DELETE on workspace.tasks destroyed the task and its subtask.',
           'protected', v_protected)
  union all
  select 'guard_shape_correct',
         v_bad_shape = '[]'::jsonb, 'error',
         jsonb_build_object(
           'why', 'A _refuse_client_hard_delete trigger that is disabled, AFTER, or STATEMENT-level is in the catalog while refusing nothing.',
           'wrong_shape', v_bad_shape)
  union all
  select 'refusal_is_security_invoker',
         v_definer = '[]'::jsonb, 'error',
         jsonb_build_object(
           'why', 'The refusal must run as INVOKER so current_user is the real caller; as DEFINER it sees the owner and refuses nobody.',
           'security_definer', v_definer)
  union all
  select 'soft_deletable_population',
         jsonb_array_length(v_soft_deletable) > 0, 'error',
         jsonb_build_object(
           'why', 'The registered entity tables that carry deleted_at — the population the source scan resolves against. An empty answer means the gate measured nothing.',
           'tables', v_soft_deletable,
           'protected', v_protected);
end;
$fn$;

revoke all on function public.__client_hard_delete_conformance() from public;
grant execute on function public.__client_hard_delete_conformance() to service_role;

comment on function public.__client_hard_delete_conformance() is
  'Liveness assertion for the client hard-delete refusal + the soft-deletable '
  'table population. Read by pnpm check:client-hard-delete. service_role only — '
  'it reports on the whole database, so it is never a client door.';
