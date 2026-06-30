-- fix_create_tasks_bulk_use_assoc_add.sql
-- ROOT-FIX the same 42P10 bug that killed create_task_with_association /
-- associate_with_task (now graveyarded): create_tasks_bulk hand-rolled the
-- entity→task association insert with
--   on conflict (source_type, source_id, target_type, target_id) do nothing
-- a 4-column conflict target that matches NO unique index (the real key is the
-- 5-tuple incl. `role`, `associations_unique`), so every bulk-create that passed
-- p_entity_type/p_entity_id threw 42P10. The scope edges in this same function
-- already used the generic primitive public.assoc_add — so does this fix for the
-- entity edge. One canonical write path, no hand-rolled inserts.
--
-- Idempotent (CREATE OR REPLACE); assoc_add itself is ON CONFLICT idempotent.

create or replace function public.create_tasks_bulk(
  p_items jsonb,
  p_project_id uuid default null::uuid,
  p_organization_id uuid default null::uuid,
  p_scope_ids uuid[] default '{}'::uuid[],
  p_entity_type text default null::text,
  p_entity_id uuid default null::uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_item jsonb; v_task workspace.tasks; v_tasks jsonb := '[]'::jsonb;
  v_scope_id uuid; v_priority task_priority;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'p_items must be a JSON array'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_priority := case when v_item->>'priority' in ('low','medium','high') then (v_item->>'priority')::task_priority else null end;
    insert into workspace.tasks (title, description, project_id, organization_id, priority, due_date, status, created_by)
    values (coalesce(nullif(trim(v_item->>'title'), ''), 'Untitled task'), v_item->>'description', p_project_id, p_organization_id,
            v_priority, case when v_item->>'due_date' is not null then (v_item->>'due_date')::date else null end,
            coalesce(v_item->>'status', 'incomplete'), v_uid)
    returning * into v_task;
    if p_entity_type is not null and p_entity_id is not null then
      -- Canonical: generic primitive (5-tuple ON CONFLICT inside), never a hand-rolled insert.
      perform public.assoc_add(
        p_entity_type, p_entity_id, 'task', v_task.id, v_task.organization_id,
        v_item->>'title',
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('item_index', coalesce((v_item->>'index')::int, 0))
      );
    end if;
    if p_scope_ids is not null and array_length(p_scope_ids, 1) > 0 then
      foreach v_scope_id in array p_scope_ids loop
        perform public.assoc_add('task', v_task.id, 'scope', v_scope_id, p_organization_id);
      end loop;
    end if;
    v_tasks := v_tasks || jsonb_build_array(to_jsonb(v_task));
  end loop;
  return jsonb_build_object('tasks', v_tasks);
end;
$function$;
