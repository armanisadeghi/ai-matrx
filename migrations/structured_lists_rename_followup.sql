-- Structured Lists rename follow-up: canonicalize DB-facing code off the
-- backward-compat views (workbench.udt_picklists / udt_picklist_items) and off
-- the stale `udt_picklists` resource token, so the ONLY canonical spelling is
-- `structured_list` + workbench.udt_structured_lists(_items).
--
-- Context: 20260714165014_rename_picklists_to_structured_lists.sql renamed the
-- tables and left compat views + a stale registry row as a transition aid. This
-- migration removes the frontend/DB reliance on those shims. The compat VIEWS
-- themselves stay until aidream's raw-SQL references are cut over (separate pass).
--
-- Idempotent.
set lock_timeout = '5s';
set statement_timeout = '60s';

-- 1) Registry: drop the stale token, fix the canonical row's URL to the real route.
delete from platform.shareable_resource_registry where resource_type = 'udt_picklists';

update platform.shareable_resource_registry
set url_path_template = '/lists/{id}',
    updated_at = now()
where resource_type = 'structured_list';

-- 2) Canonicalize the user-list RPCs onto the real tables (they currently read
--    the compat views). Behavior is identical; this just removes view reliance.
create or replace function public.create_user_list(
  p_list_name character varying,
  p_description text,
  p_user_id uuid,
  p_is_public boolean,
  p_authenticated_read boolean default false,
  p_public_read boolean default false,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
as $function$
DECLARE
    v_list_id uuid;
    v_item jsonb;
    v_result jsonb;
BEGIN
    if not (auth.role() = 'service_role' or p_user_id = auth.uid()) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    INSERT INTO workbench.udt_structured_lists (
        list_name, description, user_id, is_public, public_read
    )
    VALUES (p_list_name, p_description, p_user_id, p_is_public, p_public_read)
    RETURNING id INTO v_list_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO workbench.udt_structured_list_items (
            label, description, help_text, group_name,
            user_id, is_public, public_read, list_id
        )
        VALUES (
            v_item->>'Label', v_item->>'Description', v_item->>'Help Text', v_item->>'Group',
            p_user_id, p_is_public, p_public_read, v_list_id
        );
    END LOOP;

    SELECT jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'items', (
            SELECT jsonb_agg(jsonb_build_object(
                'id', i.id, 'label', i.label, 'description', i.description,
                'help_text', i.help_text, 'group_name', i.group_name
            ))
            FROM workbench.udt_structured_list_items i WHERE i.list_id = l.id
        )
    )
    INTO v_result
    FROM workbench.udt_structured_lists l
    WHERE l.id = v_list_id;

    RETURN v_result;
END;
$function$;

create or replace function public.update_user_list(
  p_list_id uuid,
  p_list_name character varying default null::character varying,
  p_description text default null::text,
  p_is_public boolean default null::boolean,
  p_authenticated_read boolean default null::boolean,
  p_public_read boolean default null::boolean,
  p_items jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
as $function$
DECLARE
    v_item jsonb;
    v_result jsonb;
BEGIN
    UPDATE workbench.udt_structured_lists SET
        list_name = COALESCE(p_list_name, list_name),
        description = COALESCE(p_description, description),
        is_public = COALESCE(p_is_public, is_public),
        public_read = COALESCE(p_public_read, public_read),
        updated_at = now()
    WHERE id = p_list_id;

    IF p_items IS NOT NULL THEN
        DELETE FROM workbench.udt_structured_list_items WHERE list_id = p_list_id;

        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
            INSERT INTO workbench.udt_structured_list_items (
                label, description, help_text, group_name,
                user_id, is_public, public_read, list_id
            )
            VALUES (
                v_item->>'Label', v_item->>'Description', v_item->>'Help Text', v_item->>'Group',
                (SELECT user_id FROM workbench.udt_structured_lists WHERE id = p_list_id),
                (SELECT is_public FROM workbench.udt_structured_lists WHERE id = p_list_id),
                (SELECT public_read FROM workbench.udt_structured_lists WHERE id = p_list_id),
                p_list_id
            );
        END LOOP;
    END IF;

    SELECT jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'items', (
            SELECT jsonb_agg(jsonb_build_object(
                'id', i.id, 'label', i.label, 'description', i.description,
                'help_text', i.help_text, 'group_name', i.group_name
            ))
            FROM workbench.udt_structured_list_items i WHERE i.list_id = l.id
        )
    )
    INTO v_result
    FROM workbench.udt_structured_lists l
    WHERE l.id = p_list_id;

    RETURN v_result;
END;
$function$;

create or replace function public.get_user_lists_summary(p_user_id uuid)
returns jsonb
language plpgsql
security definer
as $function$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'list_id', l.id,
      'list_name', l.list_name,
      'description', l.description,
      'created_at', l.created_at,
      'updated_at', l.updated_at,
      'item_count', (SELECT COUNT(*) FROM workbench.udt_structured_list_items WHERE list_id = l.id),
      'group_count', (SELECT COUNT(DISTINCT group_name) FROM workbench.udt_structured_list_items WHERE list_id = l.id)
    )
    ORDER BY l.created_at DESC
  ) INTO v_result
  FROM workbench.udt_structured_lists l
  WHERE l.user_id = p_user_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

create or replace function public.get_user_list_with_items(p_list_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
    v_result jsonb;
    v_is_editor boolean := false;
BEGIN
    SELECT (l.user_id = auth.uid()
            OR has_permission('structured_list', l.id, 'editor'::permission_level))
      INTO v_is_editor
    FROM workbench.udt_structured_lists l
    WHERE l.id = p_list_id;

    SELECT jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'created_at', l.created_at, 'updated_at', l.updated_at,
        'is_public', l.is_public, 'public_read', l.public_read,
        'items_grouped', (
            SELECT jsonb_object_agg(COALESCE(group_name, 'Ungrouped'), items)
            FROM (
                SELECT
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id, 'label', i.label,
                        'description', CASE WHEN v_is_editor THEN i.description ELSE NULL END,
                        'help_text', i.help_text
                    ) ORDER BY i.created_at) AS items
                FROM workbench.udt_structured_list_items i
                WHERE i.list_id = l.id
                GROUP BY group_name
            ) AS grouped_items
        )
    )
    INTO v_result
    FROM workbench.udt_structured_lists l
    WHERE l.id = p_list_id;
    RETURN v_result;
END;
$function$;

create or replace function public.get_picklist_for_selection(p_list_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE v_result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'list_id', l.id,
        'list_name', l.list_name,
        'description', l.description,
        'is_public', l.is_public,
        'public_read', l.public_read,
        'items_grouped', (
            SELECT jsonb_object_agg(COALESCE(group_name, 'Ungrouped'), items)
            FROM (
                SELECT
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id,
                        'label', i.label,
                        'help_text', i.help_text,
                        'group_name', i.group_name,
                        'icon_name', i.icon_name
                    ) ORDER BY i.created_at) AS items
                FROM workbench.udt_structured_list_items i
                WHERE i.list_id = l.id
                GROUP BY group_name
            ) AS grouped_items
        )
    )
    INTO v_result
    FROM workbench.udt_structured_lists l
    WHERE l.id = p_list_id;
    RETURN v_result;
END;
$function$;

-- 3) container_resource_counts: the 'picklist' row is repointed to structured_list
--    and, while here, the three UDT rows are fixed — they never worked because
--    schema='public' + table='workbench.udt_*' resolves to a non-existent relation
--    (to_regclass('public."workbench.udt_datasets"') is null), so the counts were
--    silently zero. Correct schema is 'workbench'.
create or replace function public.container_resource_counts(p_column text, p_container_id uuid)
 returns table(resource_key text, n bigint)
 language plpgsql
 set search_path to ''
as $function$
declare
  rec record; v_count bigint; v_has_col boolean; v_has_arch boolean; v_sql text;
begin
  if p_column not in ('organization_id', 'project_id', 'task_id') then
    raise exception 'invalid container column: %', p_column;
  end if;
  if p_container_id is null then return; end if;
  for rec in
    select * from (values
      ('agent',            'agent',       'definition',            'is_archived'),
      ('agent_app',        'app',         'definition',            null),
      ('agent_shortcut',   'agent',       'shortcut',              null),
      ('skill',            'skill',       'definition',            null),
      ('content_template', 'public',      'content_template',      null),
      ('sandbox',          'public',      'sandbox_instances',     null),
      ('file',             'files',       'files',                 null),
      ('dataset',          'workbench',   'udt_datasets',          null),
      ('structured_list',  'workbench',   'udt_structured_lists',  null),
      ('workbook',         'workbench',   'udt_workbooks',         null),
      ('transcript',       'transcripts', 'transcripts',           null),
      ('note',             'public',      'notes',                 null),
      ('conversation',     'chat',        'conversation',          null),
      ('flashcard',        'education',   'flashcard_data',        null),
      ('quiz',             'education',   'quiz_sessions',         null),
      ('canvas',           'public',      'canvas_items',          'is_archived'),
      ('research',         'research',    'rs_topic',              null),
      ('project',          'workspace',   'projects',              null),
      ('task',             'workspace',   'tasks',                 null),
      ('workflow',         'workflow',    'definition',            null)
    ) as t(k, sch, tbl, arch)
  loop
    begin
      if to_regclass(format('%I.%I', rec.sch, rec.tbl)) is null then continue; end if;
      select exists (select 1 from information_schema.columns
        where table_schema = rec.sch and table_name = rec.tbl and column_name = p_column) into v_has_col;
      if not v_has_col then continue; end if;
      v_has_arch := false;
      if rec.arch is not null then
        select exists (select 1 from information_schema.columns
          where table_schema = rec.sch and table_name = rec.tbl and column_name = rec.arch) into v_has_arch;
      end if;
      v_sql := format('select count(*) from %I.%I where %I = $1', rec.sch, rec.tbl, p_column);
      if v_has_arch then v_sql := v_sql || format(' and %I = false', rec.arch); end if;
      execute v_sql into v_count using p_container_id;
      resource_key := rec.k; n := v_count; return next;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;
end;
$function$;

notify pgrst, 'reload schema';
