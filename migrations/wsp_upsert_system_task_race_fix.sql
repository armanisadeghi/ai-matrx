-- Applied 2026-08-07 via Supabase MCP.
-- wsp_upsert_system_task hardening: concurrent same-key calls return the
-- existing row instead of erroring on tasks_org_dedupe_key_uq (with an
-- exists_not_visible result when RLS hides an org-mate's row), and a missing
-- organization raises a clear exception (service-role callers must pass
-- p_organization_id).
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
  if v_org is null then
    raise exception 'wsp_upsert_system_task: organization could not be resolved — pass p_organization_id when calling without a user session';
  end if;

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

  begin
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
  exception when unique_violation then
    select * into v_existing from workspace.tasks
     where organization_id = v_org and dedupe_key = p_dedupe_key and deleted_at is null
     limit 1;
    if found then
      return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
    end if;
    return jsonb_build_object('id', null, 'created', false, 'status', null, 'reason', 'exists_not_visible');
  end;
end;
$$;
