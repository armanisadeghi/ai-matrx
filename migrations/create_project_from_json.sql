-- create_project_from_json
--
-- Single-transaction importer that turns the agent/user "project JSON" shape
-- into a real ctx_projects row plus its nested ctx_tasks (tasks) and ctx_tasks
-- (subtasks via parent_task_id). Both the backend (agent auto-create) and the
-- new "Paste JSON" tab in the create-project window call this one RPC so there
-- is exactly ONE write path for the whole tree.
--
-- Payload shape (extra keys ignored):
-- {
--   "name": "Project name",                  -- required
--   "slug": "lowercase-hyphenated-slug",     -- optional (derived from name)
--   "description": "...",                    -- optional
--   "start_date": "YYYY-MM-DD" | null,        -- optional → ctx_projects.start_date
--   "end_date":   "YYYY-MM-DD" | null,        -- optional → ctx_projects.target_date
--   "tasks": [
--     { "name": "Task name", "description": "..." | null,
--       "subtasks": [ { "name": "...", "description": "..." | null } ] }
--   ]
-- }
--
-- SECURITY INVOKER: runs as the calling user so RLS applies exactly like the
-- direct client inserts it replaces. created_by / user_id are stamped from
-- auth.uid(); the AFTER INSERT trigger trg_ctx_projects_add_creator_membership
-- grants the owner membership row. Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.create_project_from_json(
  p_payload jsonb,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text;
  v_slug text;
  v_base_slug text;
  v_description text;
  v_start_date date;
  v_target_date date;
  v_project_id uuid;
  v_task jsonb;
  v_subtask jsonb;
  v_task_id uuid;
  v_task_idx int := 0;
  v_sub_idx int := 0;
  v_task_count int := 0;
  v_subtask_count int := 0;
  v_suffix int;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;

  v_name := nullif(btrim(p_payload->>'name'), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Project name is required' USING errcode = '22023';
  END IF;

  v_description := nullif(btrim(coalesce(p_payload->>'description', '')), '');

  -- Dates: empty string / "null" → NULL. Bad dates raise (caught by caller).
  v_start_date := nullif(btrim(coalesce(p_payload->>'start_date', '')), '')::date;
  v_target_date := nullif(btrim(coalesce(p_payload->>'end_date', '')), '')::date;

  -- Slug: use provided, else derive from name. Normalize either way.
  v_base_slug := lower(nullif(btrim(coalesce(p_payload->>'slug', '')), ''));
  IF v_base_slug IS NULL THEN
    v_base_slug := v_name;
  END IF;
  v_base_slug := regexp_replace(lower(v_base_slug), '[^a-z0-9]+', '-', 'g');
  v_base_slug := btrim(v_base_slug, '-');
  IF v_base_slug = '' THEN
    v_base_slug := 'project';
  END IF;
  v_base_slug := left(v_base_slug, 50);

  -- Ensure slug uniqueness within scope (org-scoped, or per-user for personal).
  v_slug := v_base_slug;
  v_suffix := 1;
  WHILE EXISTS (
    SELECT 1 FROM public.ctx_projects p
    WHERE p.slug = v_slug
      AND (
        (p_organization_id IS NOT NULL AND p.organization_id = p_organization_id)
        OR (p_organization_id IS NULL AND p.organization_id IS NULL AND p.created_by = v_user_id)
      )
  ) LOOP
    v_suffix := v_suffix + 1;
    v_slug := left(v_base_slug, 50 - (length(v_suffix::text) + 1)) || '-' || v_suffix;
  END LOOP;

  INSERT INTO public.ctx_projects (name, slug, description, organization_id, created_by, start_date, target_date)
  VALUES (v_name, v_slug, v_description, p_organization_id, v_user_id, v_start_date, v_target_date)
  RETURNING id INTO v_project_id;

  -- Tasks (preserve array order via a per-row created_at offset, since the
  -- project task list sorts by created_at ASC and a plain now() would tie).
  FOR v_task IN
    SELECT value FROM jsonb_array_elements(coalesce(p_payload->'tasks', '[]'::jsonb))
  LOOP
    CONTINUE WHEN nullif(btrim(coalesce(v_task->>'name', '')), '') IS NULL;

    INSERT INTO public.ctx_tasks (title, description, project_id, organization_id, user_id, created_at)
    VALUES (
      btrim(v_task->>'name'),
      nullif(btrim(coalesce(v_task->>'description', '')), ''),
      v_project_id,
      p_organization_id,
      v_user_id,
      v_now + (v_task_idx * interval '1 millisecond')
    )
    RETURNING id INTO v_task_id;

    v_task_idx := v_task_idx + 1;
    v_task_count := v_task_count + 1;
    v_sub_idx := 0;

    FOR v_subtask IN
      SELECT value FROM jsonb_array_elements(coalesce(v_task->'subtasks', '[]'::jsonb))
    LOOP
      CONTINUE WHEN nullif(btrim(coalesce(v_subtask->>'name', '')), '') IS NULL;

      INSERT INTO public.ctx_tasks (title, description, project_id, organization_id, user_id, parent_task_id, created_at)
      VALUES (
        btrim(v_subtask->>'name'),
        nullif(btrim(coalesce(v_subtask->>'description', '')), ''),
        v_project_id,
        p_organization_id,
        v_user_id,
        v_task_id,
        v_now + (v_task_idx * interval '1 second') + (v_sub_idx * interval '1 millisecond')
      );

      v_sub_idx := v_sub_idx + 1;
      v_subtask_count := v_subtask_count + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'project_id', v_project_id,
    'slug', v_slug,
    'organization_id', p_organization_id,
    'task_count', v_task_count,
    'subtask_count', v_subtask_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_project_from_json(jsonb, uuid) TO authenticated;
