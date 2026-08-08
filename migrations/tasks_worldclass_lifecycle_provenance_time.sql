-- ============================================================================
-- Tasks world-class upgrade — part 1 (applied 2026-08-07 via Supabase MCP)
-- Lifecycle vocabulary, provenance, time controls, reminders, per-user
-- notification state, idempotent system-task primitive.
-- 'incomplete' stays valid during the FE transition (deployed clients still
-- write it); the backfill below maps legacy rows onto the new vocabulary.
-- ============================================================================

-- 1. Lifecycle
alter table workspace.tasks drop constraint if exists tasks_status_check;
alter table workspace.tasks add constraint tasks_status_check
  check (status = any (array['inbox','planned','active','incomplete','completed','cancelled','dismissed']));

alter table workspace.tasks add column if not exists completed_at timestamptz;
update workspace.tasks set completed_at = updated_at where status = 'completed' and completed_at is null;

-- 2. Provenance
alter table workspace.tasks add column if not exists origin text not null default 'user';
alter table workspace.tasks drop constraint if exists tasks_origin_check;
alter table workspace.tasks add constraint tasks_origin_check check (origin in ('user','agent','system'));
alter table workspace.tasks add column if not exists source_type text;
alter table workspace.tasks add column if not exists source_id text;
alter table workspace.tasks add column if not exists source_url text;
alter table workspace.tasks add column if not exists source_label text;
alter table workspace.tasks add column if not exists dedupe_key text;
create unique index if not exists tasks_org_dedupe_key_uq
  on workspace.tasks (organization_id, dedupe_key)
  where dedupe_key is not null and deleted_at is null;

-- 3. Time controls
alter table workspace.tasks add column if not exists start_date date;
alter table workspace.tasks add column if not exists due_time time;
alter table workspace.tasks add column if not exists timezone text;
alter table workspace.tasks add column if not exists recurrence_rule text;
alter table workspace.tasks add column if not exists reminders jsonb not null default '[]'::jsonb;

create index if not exists tasks_assignee_open_idx on workspace.tasks (assignee_id) where deleted_at is null;
create index if not exists tasks_due_date_idx on workspace.tasks (due_date) where deleted_at is null;
create index if not exists tasks_created_by_idx on workspace.tasks (created_by) where deleted_at is null;

-- 4. Per-user notification / triage state
create table if not exists workspace.task_user_state (
  task_id uuid not null references workspace.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz,
  acknowledged_at timestamptz,
  snoozed_until timestamptz,
  dismissed_at timestamptz,
  pinned_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

alter table workspace.task_user_state enable row level security;
drop policy if exists own_rows on workspace.task_user_state;
create policy own_rows on workspace.task_user_state
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on workspace.task_user_state to authenticated;
grant all on workspace.task_user_state to service_role;

-- 5. Idempotent system-task primitives
create or replace function public.wsp_upsert_system_task(
  p_dedupe_key text,
  p_title text,
  p_description text default null,
  p_origin text default 'system',
  p_source_type text default null,
  p_source_id text default null,
  p_source_url text default null,
  p_source_label text default null,
  p_due_date date default null,
  p_priority text default null,
  p_assignee_id uuid default null,
  p_organization_id uuid default null,
  p_project_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, workspace
as $$
declare
  v_org uuid;
  v_existing workspace.tasks%rowtype;
  v_id uuid;
begin
  if p_dedupe_key is null or length(trim(p_dedupe_key)) = 0 then
    raise exception 'wsp_upsert_system_task: dedupe_key is required';
  end if;
  v_org := coalesce(p_organization_id, public.ensure_personal_organization(auth.uid()));

  select * into v_existing from workspace.tasks
   where organization_id = v_org and dedupe_key = p_dedupe_key and deleted_at is null
   limit 1;

  if found then
    if v_existing.status in ('completed','cancelled','dismissed') then
      return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
    end if;
    update workspace.tasks
       set title = p_title,
           description = coalesce(p_description, description),
           due_date = coalesce(p_due_date, due_date),
           source_url = coalesce(p_source_url, source_url),
           source_label = coalesce(p_source_label, source_label),
           updated_at = now()
     where id = v_existing.id;
    return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
  end if;

  insert into workspace.tasks (
    title, description, status, origin, source_type, source_id, source_url, source_label,
    dedupe_key, due_date, priority, assignee_id, organization_id, project_id,
    metadata, created_by
  ) values (
    p_title, p_description, 'inbox', coalesce(p_origin, 'system'),
    p_source_type, p_source_id, p_source_url, p_source_label,
    p_dedupe_key, p_due_date,
    nullif(p_priority, '')::task_priority,
    coalesce(p_assignee_id, auth.uid()), v_org, p_project_id,
    coalesce(p_metadata, '{}'::jsonb), auth.uid()
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'created', true, 'status', 'inbox');
end;
$$;

create or replace function public.wsp_resolve_system_task(
  p_dedupe_key text,
  p_outcome text default 'completed',
  p_organization_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, workspace
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if p_outcome not in ('completed','cancelled','dismissed') then
    raise exception 'wsp_resolve_system_task: invalid outcome %', p_outcome;
  end if;
  v_org := coalesce(p_organization_id, public.ensure_personal_organization(auth.uid()));
  update workspace.tasks
     set status = p_outcome,
         completed_at = case when p_outcome = 'completed' then now() else completed_at end,
         updated_at = now()
   where organization_id = v_org and dedupe_key = p_dedupe_key and deleted_at is null
     and status not in ('completed','cancelled','dismissed')
   returning id into v_id;
  return jsonb_build_object('id', v_id, 'resolved', v_id is not null);
end;
$$;

grant execute on function public.wsp_upsert_system_task(text,text,text,text,text,text,text,text,date,text,uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.wsp_resolve_system_task(text,text,uuid) to authenticated;

-- 6. Backfill legacy 'incomplete' rows onto the new vocabulary
update workspace.tasks
   set status = case when due_date is not null or project_id is not null then 'planned' else 'inbox' end
 where status = 'incomplete';

notify pgrst, 'reload schema';
