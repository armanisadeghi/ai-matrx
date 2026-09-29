-- Inverse of scopesreadsrest_the_dictionary_trash_and_facts_read_the_store.sql: the fourteen bodies it replaced, byte for byte (production, 2026-09-29), the two
-- door rows it declared removed, and its three helpers dropped (nothing else reads them once the bodies
-- are back).
-- based-on: custom.agent_context_value(jsonb, text, text, uuid, uuid, bigint) 2df8741db1910c067bae79b94aaf5d268eeae9dfdace7a8692b4b19168bfc5c4
-- based-on: custom.table_facts(uuid) b0928ac8458639bb342d19e4682292ecee973606e2f25f892fcf779e5cbb8600
-- based-on: platform._search_item_filed_tags(text, uuid) f485b66d13d9759f8ca5750a2288d5712d445ce3140d1d2ed57395d752d96364
-- based-on: platform.resolve_id(uuid, text) a3dfbd92055b6b39f0aec52e1c983b369c7dc83075f30c9f75eae61251b64cf8
-- based-on: public._trash_kind_counts(uuid, uuid, uuid) bd9ae83104c81e68c9a051cd38dbcabd1d93be8b9f9df37e452c6462f0b88b93
-- based-on: public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer) a57c87c8aca33253915469a20cd58ca66f201e07ae8187c8fb62027f4822f886
-- based-on: public.create_tasks_bulk(jsonb, uuid, uuid, uuid[], text, uuid, jsonb) 82e1f21263017cfc4dff673bef5581d12b6f7b92a09d1593b4a7cb1d423c8c98
-- based-on: public.dict_list_owners_for(uuid) 8024c799c1abf45689ccce7fb7864cd9852fbdacc5fd03ac9fe082756597e92b
-- based-on: public.dict_owner_org(text, uuid) 512b0fb87d09043ae3f806be291ab912f46108c83a67e75631e6c2e4b2f87638
-- based-on: public.dict_resolve_for(uuid, boolean, boolean, uuid[], uuid[], uuid[]) 97a84616145870733f72ed514a7f87a82c40bc3ed8183f34d5797a15bb36fd8b
-- based-on: public.dict_rollup_for(text, uuid) 52f69e4291235501c9c34b081f16364ec019ba0dc7052e3714c533018dc87509
-- based-on: public.get_user_dashboard_metrics() cd6c975ba520b62a8b15ab2216dd152262969cf3e2799db7c23c863048aec66b
-- based-on: public.kg_caller_can_target_scope(uuid) 77caf61aa3ce98634c57eba64d63600c5058797bedc495e09478e92681f2d0e8
-- based-on: public.org_trash_restore(uuid, text, uuid) 21f0ce4664ba8167c4d5259032c77ef631870c38dc689df73826477e863143fe
-- lane: SCOPES-READS-REST

CREATE OR REPLACE FUNCTION public.dict_list_owners_for(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_result jsonb; v_is_admin boolean;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;
    PERFORM iam.asks_about_caller(p_user_id, 'public.dict_list_owners_for');

    SELECT EXISTS (SELECT 1 FROM admin.admins a WHERE a.user_id = p_user_id) INTO v_is_admin;

    WITH member_orgs AS (
        SELECT om.organization_id AS org_id
        FROM iam.organization_member om
        WHERE om.user_id = p_user_id
    ),
    personal AS (
        SELECT jsonb_build_object(
            'level', 'user',
            'owner_id', p_user_id,
            'name', 'Personal',
            'entry_count', (SELECT count(*) FROM dictionary.dict_entries e WHERE e.user_id = p_user_id AND e.deleted_at IS NULL),  -- 1355
            'max_inline_chars', (SELECT s.max_inline_chars FROM dictionary.dict_settings s WHERE s.user_id = p_user_id)
        ) AS obj
    ),
    orgs AS (
        SELECT jsonb_build_object(
            'level', 'organization',
            'owner_id', o.id,
            'name', o.name,
            'entry_count', (SELECT count(*) FROM dictionary.dict_entries e WHERE e.organization_id = o.id AND e.deleted_at IS NULL),  -- 1355
            'max_inline_chars', (SELECT s.max_inline_chars FROM dictionary.dict_settings s WHERE s.organization_id = o.id)
        ) AS obj
        FROM iam.organizations o
        WHERE o.id IN (SELECT org_id FROM member_orgs)
    ),
    scope_types AS (
        SELECT jsonb_build_object(
            'level', 'scope_type',
            'owner_id', st.id,
            'name', st.label_singular,
            'organization_id', st.organization_id,
            'entry_count', (SELECT count(*) FROM dictionary.dict_entries e WHERE e.scope_type_id = st.id AND e.deleted_at IS NULL),  -- 1355
            'max_inline_chars', (SELECT s.max_inline_chars FROM dictionary.dict_settings s WHERE s.scope_type_id = st.id)
        ) AS obj
        FROM context.scope_types st
        WHERE st.organization_id IN (SELECT org_id FROM member_orgs)
    ),
    scopes AS (
        SELECT jsonb_build_object(
            'level', 'scope',
            'owner_id', sc.id,
            'name', sc.name,
            'organization_id', sc.organization_id,
            'scope_type_id', sc.scope_type_id,
            'entry_count', (SELECT count(*) FROM dictionary.dict_entries e WHERE e.scope_id = sc.id AND e.deleted_at IS NULL),  -- 1355
            'max_inline_chars', (SELECT s.max_inline_chars FROM dictionary.dict_settings s WHERE s.scope_id = sc.id)
        ) AS obj
        FROM context.scopes sc
        WHERE sc.organization_id IN (SELECT org_id FROM member_orgs)
    )
    SELECT jsonb_build_object(
        'global', CASE WHEN v_is_admin THEN jsonb_build_object(
            'level', 'global',
            'owner_id', NULL,
            'name', 'Global (app-wide)',
            'entry_count', (SELECT count(*) FROM dictionary.dict_entries e WHERE e.user_id IS NULL AND e.organization_id IS NULL AND e.scope_type_id IS NULL AND e.scope_id IS NULL AND e.deleted_at IS NULL)  -- 1355
        ) ELSE NULL END,
        'personal',    (SELECT obj FROM personal),
        'organizations', coalesce((SELECT jsonb_agg(obj ORDER BY obj->>'name') FROM orgs), '[]'::jsonb),
        'scope_types',   coalesce((SELECT jsonb_agg(obj ORDER BY obj->>'name') FROM scope_types), '[]'::jsonb),
        'scopes',        coalesce((SELECT jsonb_agg(obj ORDER BY obj->>'name') FROM scopes), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dict_owner_org(p_level text, p_owner_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_org uuid;
BEGIN
    IF p_level = 'user' THEN
        RETURN NULL;
    ELSIF p_level = 'organization' THEN
        SELECT id INTO v_org FROM iam.organizations WHERE id = p_owner_id;
    ELSIF p_level = 'scope_type' THEN
        SELECT organization_id INTO v_org FROM context.scope_types WHERE id = p_owner_id;
    ELSIF p_level = 'scope' THEN
        SELECT organization_id INTO v_org FROM context.scopes WHERE id = p_owner_id;
    ELSE
        RAISE EXCEPTION 'dict: unknown level "%"', p_level USING ERRCODE = '22023';
    END IF;

    IF p_level <> 'user' AND v_org IS NULL THEN
        perform platform.refuse_not_found(format('dict: %s "%s" is not available to this account — it may not exist, or your access may not reach it', p_level, p_owner_id));
    END IF;
    RETURN v_org;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dict_resolve_for(p_user_id uuid, p_include_user boolean DEFAULT true, p_all boolean DEFAULT false, p_organization_ids uuid[] DEFAULT '{}'::uuid[], p_scope_type_ids uuid[] DEFAULT '{}'::uuid[], p_scope_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_entries jsonb;
    v_inline integer;
    v_sources integer;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;
    PERFORM iam.asks_about_caller(p_user_id, 'public.dict_resolve_for');

    WITH member_orgs AS (
        SELECT om.organization_id AS org_id
        FROM iam.organization_member om
        WHERE om.user_id = p_user_id
    ),
    sel AS (
        SELECT 'global'::text AS level, NULL::uuid AS owner_id, 0 AS rank, 'Global'::text AS name
        UNION ALL
        SELECT 'user'::text, p_user_id, 1, 'Personal'::text
        WHERE p_include_user OR p_all
        UNION ALL
        SELECT 'organization', o.id, 2, o.name
        FROM iam.organizations o
        WHERE o.id IN (SELECT org_id FROM member_orgs)
          AND (p_all OR o.id = ANY(p_organization_ids))
        UNION ALL
        SELECT 'scope_type', st.id, 3, st.label_singular
        FROM context.scope_types st
        WHERE st.organization_id IN (SELECT org_id FROM member_orgs)
          AND (p_all OR st.id = ANY(p_scope_type_ids))
        UNION ALL
        SELECT 'scope', sc.id, 4, sc.name
        FROM context.scopes sc
        WHERE sc.organization_id IN (SELECT org_id FROM member_orgs)
          AND (p_all OR sc.id = ANY(p_scope_ids))
    ),
    raw AS (
        SELECT e.*, sel.rank, sel.level AS source_level, sel.name AS source_name
        FROM dictionary.dict_entries e
        JOIN sel ON (
            (sel.level = 'global'       AND e.user_id IS NULL AND e.organization_id IS NULL AND e.scope_type_id IS NULL AND e.scope_id IS NULL)
         OR (sel.level = 'user'         AND e.user_id = sel.owner_id)
         OR (sel.level = 'organization' AND e.organization_id = sel.owner_id)
         OR (sel.level = 'scope_type'   AND e.scope_type_id = sel.owner_id)
         OR (sel.level = 'scope'        AND e.scope_id = sel.owner_id)
        )
        WHERE e.is_active
          AND e.deleted_at IS NULL  -- 1355
    ),
    ranked AS (
        SELECT DISTINCT ON (lower(term)) *
        FROM raw
        ORDER BY lower(term), rank DESC, updated_at DESC
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'term', r.term,
            'sounds_like', to_jsonb(r.sounds_like),
            'pronunciation', r.pronunciation,
            'ipa', r.ipa,
            'definition', r.definition,
            'category', r.category,
            'source_level', r.source_level,
            'source_name', r.source_name
        ) ORDER BY lower(r.term)
    ) INTO v_entries
    FROM ranked r;

    SELECT s.max_inline_chars INTO v_inline
    FROM dictionary.dict_settings s
    JOIN (
        SELECT 'user'::text AS level, p_user_id AS owner_id, 1 AS rank WHERE p_include_user OR p_all
        UNION ALL SELECT 'organization', o.id, 2 FROM iam.organizations o
            WHERE o.id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_user_id)
              AND (p_all OR o.id = ANY(p_organization_ids))
        UNION ALL SELECT 'scope_type', st.id, 3 FROM context.scope_types st
            WHERE st.organization_id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_user_id)
              AND (p_all OR st.id = ANY(p_scope_type_ids))
        UNION ALL SELECT 'scope', sc.id, 4 FROM context.scopes sc
            WHERE sc.organization_id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_user_id)
              AND (p_all OR sc.id = ANY(p_scope_ids))
    ) owners ON (
        (owners.level = 'user'         AND s.user_id = owners.owner_id)
     OR (owners.level = 'organization' AND s.organization_id = owners.owner_id)
     OR (owners.level = 'scope_type'   AND s.scope_type_id = owners.owner_id)
     OR (owners.level = 'scope'        AND s.scope_id = owners.owner_id)
    )
    WHERE s.max_inline_chars IS NOT NULL
    ORDER BY owners.rank DESC
    LIMIT 1;

    SELECT count(DISTINCT (source_level, source_name)) INTO v_sources
    FROM (
        SELECT e.*, sel.level AS source_level, sel.name AS source_name
        FROM dictionary.dict_entries e
        JOIN (
            SELECT 'global'::text AS level, NULL::uuid AS owner_id, 'Global'::text AS name
            UNION ALL SELECT 'user'::text, p_user_id, 'Personal'::text WHERE p_include_user OR p_all
            UNION ALL SELECT 'organization', o.id, o.name FROM iam.organizations o
                WHERE o.id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_user_id)
                  AND (p_all OR o.id = ANY(p_organization_ids))
            UNION ALL SELECT 'scope_type', st.id, st.label_singular FROM context.scope_types st
                WHERE st.organization_id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_user_id)
                  AND (p_all OR st.id = ANY(p_scope_type_ids))
            UNION ALL SELECT 'scope', sc.id, sc.name FROM context.scopes sc
                WHERE sc.organization_id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_user_id)
                  AND (p_all OR sc.id = ANY(p_scope_ids))
        ) sel ON (
            (sel.level = 'global'       AND e.user_id IS NULL AND e.organization_id IS NULL AND e.scope_type_id IS NULL AND e.scope_id IS NULL)
         OR (sel.level = 'user'         AND e.user_id = sel.owner_id)
         OR (sel.level = 'organization' AND e.organization_id = sel.owner_id)
         OR (sel.level = 'scope_type'   AND e.scope_type_id = sel.owner_id)
         OR (sel.level = 'scope'        AND e.scope_id = sel.owner_id)
        )
        WHERE e.is_active
          AND e.deleted_at IS NULL  -- 1355
    ) src;

    RETURN jsonb_build_object(
        'entries', coalesce(v_entries, '[]'::jsonb),
        'effective_max_inline_chars', v_inline,
        'source_count', coalesce(v_sources, 0)
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dict_rollup_for(p_level text, p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_entries jsonb;
BEGIN
    WITH raw AS (
        -- GLOBAL
        SELECT e.*, 0 AS rank, 'global'::text AS source_level
        FROM dictionary.dict_entries e
        WHERE p_level = 'global'
          AND e.user_id IS NULL AND e.organization_id IS NULL
          AND e.scope_type_id IS NULL AND e.scope_id IS NULL

        UNION ALL
        -- ORGANIZATION rollup: org(1) + scope_type(2) + scope(3)
        SELECT e.*, 1, 'organization' FROM dictionary.dict_entries e
            WHERE p_level = 'organization' AND e.organization_id = p_owner_id
        UNION ALL
        SELECT e.*, 2, 'scope_type' FROM dictionary.dict_entries e
            JOIN context.scope_types st ON st.id = e.scope_type_id
            WHERE p_level = 'organization' AND st.organization_id = p_owner_id
        UNION ALL
        SELECT e.*, 3, 'scope' FROM dictionary.dict_entries e
            JOIN context.scopes sc ON sc.id = e.scope_id
            WHERE p_level = 'organization' AND sc.organization_id = p_owner_id

        UNION ALL
        -- USER rollup: org content(1/2/3) of every membership org + personal(4)
        SELECT e.*, 1, 'organization' FROM dictionary.dict_entries e
            WHERE p_level = 'user' AND e.organization_id IN (
                SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_owner_id)
        UNION ALL
        SELECT e.*, 2, 'scope_type' FROM dictionary.dict_entries e
            JOIN context.scope_types st ON st.id = e.scope_type_id
            WHERE p_level = 'user' AND st.organization_id IN (
                SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_owner_id)
        UNION ALL
        SELECT e.*, 3, 'scope' FROM dictionary.dict_entries e
            JOIN context.scopes sc ON sc.id = e.scope_id
            WHERE p_level = 'user' AND sc.organization_id IN (
                SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_owner_id)
        UNION ALL
        SELECT e.*, 4, 'user' FROM dictionary.dict_entries e
            WHERE p_level = 'user' AND e.user_id = p_owner_id
    ),
    active AS (SELECT * FROM raw WHERE is_active AND deleted_at IS NULL),  -- 1355
    ranked AS (
        SELECT DISTINCT ON (lower(term)) *
        FROM active
        ORDER BY lower(term), rank DESC, updated_at DESC
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id, 'term', r.term, 'sounds_like', to_jsonb(r.sounds_like),
            'pronunciation', r.pronunciation, 'ipa', r.ipa,
            'definition', r.definition, 'category', r.category,
            'source_level', r.source_level
        ) ORDER BY lower(r.term)
    ) INTO v_entries
    FROM ranked r;

    RETURN jsonb_build_object('entries', coalesce(v_entries, '[]'::jsonb));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.kg_caller_can_target_scope(p_scope_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_scope_id IS NULL OR EXISTS (
    SELECT 1 FROM context.scopes s
     WHERE s.id = p_scope_id
       AND (s.created_by = (select auth.uid())
            OR EXISTS (SELECT 1 FROM iam.organization_member om
                        WHERE om.organization_id = s.organization_id
                          AND om.user_id = (select auth.uid())))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('agents',0,'conversations',0,'knowledge_files',0,'published_apps',0,
      'notes',0,'tasks',0,'transcripts',0,'scopes',0,'shortcuts',0,'research_reports',0,'podcasts',0,'messages',0);
  end if;
  return jsonb_build_object(
    'agents',           (select count(*) from agent.definition      where created_by = uid and coalesce(is_archived, false) = false),
    'conversations',    (select count(*) from chat.conversation      where created_by = uid and deleted_at is null),
    'knowledge_files',  (select count(*) from files.files            where created_by = uid and deleted_at is null),
    'published_apps',   (select count(*) from app.definition         where created_by = uid and status = 'published'),
    'notes',            (select count(*) from workbench.notes        where created_by = uid and deleted_at is null),
    'tasks',            (select count(*) from workspace.tasks        where created_by = uid),
    'transcripts',      (select count(*) from transcripts.transcripts where created_by = uid and deleted_at is null),
    'scopes',           (select count(*) from context.scopes         where created_by = uid),
    'shortcuts',        (select count(*) from agent.shortcut         where created_by = uid and coalesce(is_active, false) = true),
    'research_reports', (select count(*) from research.rs_topic      where created_by = uid),
    'podcasts',         (select count(*) from podcast.pc_episodes    where created_by = uid),
    'messages',         (select count(*) from communication.dm_messages where sender_id = uid and deleted_at is null)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_tasks_bulk(p_items jsonb, p_project_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_scope_ids uuid[] DEFAULT '{}'::uuid[], p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_task workspace.tasks;
  v_tasks jsonb := '[]'::jsonb;
  v_scope_id uuid;
  v_priority task_priority;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'at most 100 tasks may be created at once' using errcode = '22023';
  end if;
  if p_organization_id is not null
     and coalesce(iam.has_org_access(p_organization_id), false) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('organization_id', p_organization_id)::text;
  end if;
  if p_project_id is not null
     and coalesce(iam.has_access('project', p_project_id, 'editor'), false) is not true then
    raise exception 'not authorized for this project' using errcode = '42501',
            detail = jsonb_build_object('project_id', p_project_id)::text;
  end if;
  if p_entity_type is not null and p_entity_id is not null
     and coalesce(iam.has_access(p_entity_type, p_entity_id, 'editor'), false) is not true then
    raise exception 'not authorized for %', p_entity_type using errcode = '42501',
            detail = jsonb_build_object('entity_id', p_entity_id)::text;
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_scope_ids, '{}'::uuid[])) requested(scope_id)
    left join context.scopes s on s.id = requested.scope_id and s.deleted_at is null
    where s.id is null or coalesce(iam.has_org_access(s.organization_id), false) is not true
  ) then
    raise exception 'one or more requested scopes are not accessible' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_priority := case
      when v_item->>'priority' in ('low','medium','high') then (v_item->>'priority')::task_priority
      else null
    end;
    insert into workspace.tasks (
      title, description, project_id, organization_id, priority, due_date, status, created_by
    ) values (
      coalesce(nullif(trim(v_item->>'title'), ''), 'Untitled task'),
      v_item->>'description', p_project_id, p_organization_id, v_priority,
      case when v_item->>'due_date' is not null then (v_item->>'due_date')::date else null end,
      coalesce(v_item->>'status', 'incomplete'), v_uid
    ) returning * into v_task;

    if p_entity_type is not null and p_entity_id is not null then
      perform public.assoc_add(
        p_entity_type, p_entity_id, 'task', v_task.id, v_task.organization_id,
        v_item->>'title',
        coalesce(p_metadata, '{}'::jsonb)
          || jsonb_build_object('item_index', coalesce((v_item->>'index')::int, 0))
      );
    end if;
    foreach v_scope_id in array coalesce(p_scope_ids, '{}'::uuid[]) loop
      perform public.assoc_add('task', v_task.id, 'scope', v_scope_id, p_organization_id);
    end loop;
    v_tasks := v_tasks || jsonb_build_array(to_jsonb(v_task));
  end loop;
  return jsonb_build_object('tasks', v_tasks);
end;
$function$
;

CREATE OR REPLACE FUNCTION platform._search_item_filed_tags(p_token text, p_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce(array_agg(distinct s.name order by s.name), '{}'::text[])
    from platform.associations a
    join context.scopes s on s.id = a.target_id and s.deleted_at is null
    join context.scope_types st on st.id = s.scope_type_id and st.slug = 'tag'
   where a.source_type = p_token and a.source_id = p_id and a.target_type = 'scope' and a.deleted_at is null
$function$
;

CREATE OR REPLACE FUNCTION custom.table_facts(p_organization_id uuid)
 RETURNS TABLE(table_id uuid, visibility text, mine boolean, kept_by_the_app boolean, kept_for text, offered_as_context boolean, keeper_group text, keeper_says text, used_in_kind text, used_in_id uuid, used_in_table_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_facts');
  return query
    with t as (
      select r.id, r.visibility, r.created_by, r.data,
             custom.table_placement(r.organization_id, r.id, r.data, r.data_class = 'kernel') as p
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.table_kernel_id()
         and r.deleted_at is null
         and r.id in (select v from custom.query_visible_ids(p_organization_id,
                                                             custom.table_kernel_id()) v)
    ),
    -- WHICH COLUMN USES EACH CHOICES TABLE: the list Field whose config names it. The first
    -- one made, when several share it.
    uses as (
      select distinct on (nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid)
             nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid as options_table_id,
             coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') as column_label,
             nullif(f.data ->> 'entity_definition_id', '')::uuid as of_table
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.data ->> 'type' = 'list'
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
       order by nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid, f.created_at
    )
    select t.id,
           t.visibility::text,
           (v_me is not null and t.created_by = v_me),
           (t.p ->> 'kept_by_the_app')::boolean,
           t.p ->> 'kept_for',
           (t.p ->> 'offered_as_context')::boolean,
           s.keeper_group,
           s.keeper_says,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null else coalesce(s.used_in_kind, 'table') end,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null else coalesce(s.used_in_id, t.id) end,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null
                else coalesce(s.used_in_table_id, case when coalesce(s.used_in_kind, 'table') = 'table' then coalesce(s.used_in_id, t.id) end) end
      from t
      left join lateral (
        select t.p ->> 'kept_for' as word,
               case t.p ->> 'kept_for'
                 when 'context'  then nullif(t.data -> 'scope_binding' ->> 'scope_id', '')
                 when 'workflow' then nullif(t.data ->> 'parent_id', '')
                 when 'app'      then substring(coalesce(t.data ->> 'slug', '') from '^records_ui_([a-z]+)')
               end as ref
      ) kw on true
      left join uses u on u.options_table_id = t.id
      left join t ut on ut.id = u.of_table                     -- only a table the caller can open is named
      left join t wt on kw.word = 'workflow' and wt.id::text = kw.ref
      left join context.scopes sc on kw.word = 'context' and sc.id::text = kw.ref
                                  and sc.organization_id = p_organization_id and sc.deleted_at is null
      left join lateral (
        select
          case
            when not (t.p ->> 'kept_by_the_app')::boolean then null
            when kw.word = 'choices' then 'The choices behind your columns'
            when kw.word = 'context' then 'The context system'
            when kw.word = 'checklists' then 'Checklists'
            when kw.word = 'bookings' then 'Bookings'
            when kw.word = 'workflow' then 'Workflows'
            when kw.word = 'store' then 'The store itself'
            when kw.word = 'app' then 'The app'
            else initcap(replace(kw.word, '_', ' '))
          end as keeper_group,
          case
            when not (t.p ->> 'kept_by_the_app')::boolean then null
            when kw.word = 'choices' and u.options_table_id is not null and ut.id is not null
              then format('Kept by the %s column of %s: it holds that column''s choices and opens from there.',
                          u.column_label, coalesce(nullif(ut.data ->> 'name', ''), 'a table'))
            when kw.word = 'choices' and u.options_table_id is not null
              then format('Kept by the %s column of a table you cannot open: it holds that column''s choices.', u.column_label)
            when kw.word = 'choices'
              then 'Kept for a column''s choices. No column uses it now, so only its own page opens it.'
            when kw.word = 'context' and sc.id is not null
              then format('Kept by the context system: it belongs to %s and opens from there.', sc.name)
            when kw.word = 'context' and coalesce((t.p ->> 'offered_as_context')::boolean, false)
              then format('Kept by the context system: each %s in it is a context you can pick for an agent, and opens on its own page.',
                          lower(coalesce(nullif(t.data ->> 'label_singular', ''), 'record')))
            when kw.word = 'context'
              then 'Kept by the context system.'
            when kw.word = 'checklists'
              then 'Kept by checklists: the steps of every checklist run in this organization.'
            when kw.word = 'bookings'
              then format('Kept by bookings: the times people are holding on %s.',
                          coalesce(nullif(regexp_replace(coalesce(t.data ->> 'name', ''), '^Slots for ', ''), ''), 'a booking page'))
            when kw.word = 'workflow' and wt.id is not null
              then format('Kept by the workflow of %s: the states its records move through.', coalesce(nullif(wt.data ->> 'name', ''), 'a table'))
            when kw.word = 'workflow'
              then 'Kept by a table''s workflow: the states its records move through.'
            when kw.word = 'store'
              then 'Part of the store itself: every table is built on it.'
            when kw.word = 'app' and kw.ref is not null
              then 'Kept by the app: ' || case kw.ref
                     when 'view' then 'the saved views of the tables here.'
                     when 'comment' then 'the comments people leave on records.'
                     when 'form' then 'the forms made on the tables here.'
                     when 'dashboard' then 'the dashboards made on the tables here.'
                     when 'action' then 'the action inbox.'
                     when 'checklist' then 'the checklist runs.'
                     when 'slots' then 'the times people are holding on a booking page.'
                     when 'demo' then 'a demonstration of the app''s screens.'
                     when 'shapeproof' then 'a demonstration of the app''s screens.'
                     else 'its own bookkeeping.' end
            when kw.word = 'app' then 'Kept by the app.'
            else format('Kept by %s.', replace(kw.word, '_', ' '))
          end as keeper_says,
          case
            when kw.word = 'context' and sc.id is not null then 'scope'
            when kw.word = 'choices' and ut.id is not null then 'table'
            when kw.word = 'workflow' and wt.id is not null then 'table'
          end as used_in_kind,
          case
            when kw.word = 'context' and sc.id is not null then sc.id
            when kw.word = 'choices' and ut.id is not null then ut.id
            when kw.word = 'workflow' and wt.id is not null then wt.id
          end as used_in_id,
          case
            when kw.word = 'choices' and ut.id is not null then ut.id
            when kw.word = 'workflow' and wt.id is not null then wt.id
          end as used_in_table_id
      ) s on true;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.agent_context_value(p_doc jsonb, p_key text, p_type text, p_organization_id uuid, p_record_id uuid, p_cap bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_val    jsonb := p_doc -> p_key;
  v_ptr    jsonb;
  v_text   text;
  v_bytes  bigint;
  v_size   text;
  v_capped boolean;
  v_files  jsonb;
  v_n      integer;
  v_list   jsonb;
  v_len    integer;
  v_kinds  integer;
  v_kind   text;
  v_items  jsonb;
begin
  -- 1. A VALUE KEPT AS A FILE. The cell holds its first words; the whole text is the file. The
  --    door cannot read a file's bytes, so it hands the words with the file NAMED — an honest
  --    value on its own — and `whole_value.expand` tells the store's client to hand the whole
  --    text instead (matrx_records RecordStore.resolve_context). Under the cap it stays the words
  --    and the file to open, announced.
  if jsonb_typeof(v_val) = 'string' then
    v_ptr := custom.whole_value_pointer_of(p_doc -> '_values', p_doc -> '_sources', p_key);
  end if;
  if v_ptr is not null then
    v_bytes := coalesce((v_ptr ->> 'bytes')::bigint, 0);
    v_size := case when v_bytes >= 1048576 then to_char(round(v_bytes / 1048576.0, 1), 'FM999990.0') || ' MB'
                   else greatest(round(v_bytes / 1024.0), 1)::text || ' KB' end;
    v_capped := p_cap > 0 and v_bytes > p_cap;
    v_text := v_val #>> '{}';
    if v_capped then
      v_text := custom.text_head_bytes(v_text, p_cap);
    end if;
    return jsonb_build_object(
      'value', to_jsonb(v_text || E'…\n\n' || case
        when v_capped then format(
          '[This value is %s, over this organization''s limit of %s bytes for one value handed to an agent, so only its start is here. The whole text is file %s; open it with the files tool to read all of it.]',
          v_size, p_cap, v_ptr ->> 'file_id')
        else format(
          '[This is the start of a %s text. The whole text is file %s; open it with the files tool to read all of it.]',
          v_size, v_ptr ->> 'file_id') end),
      'whole_value', v_ptr || jsonb_build_object(
        'expand', not v_capped, 'cap_bytes', nullif(p_cap, 0),
        'record_id', p_record_id, 'key', p_key));
  end if;

  -- 2. A TEXT IN THE CELL, over the organization's cap: its start and where the rest is, announced.
  if p_cap > 0 and jsonb_typeof(v_val) = 'string' and octet_length(v_val #>> '{}') > p_cap then
    v_bytes := octet_length(v_val #>> '{}');
    return jsonb_build_object(
      'value', to_jsonb(custom.text_head_bytes(v_val #>> '{}', p_cap) || E'…\n\n' || format(
        '[This value is %s bytes, over this organization''s limit of %s bytes for one value handed to an agent, so only its start is here. The whole value is the "%s" field of record %s.]',
        v_bytes, p_cap, p_key, p_record_id)),
      'whole_value', jsonb_build_object(
        'kind', 'capped_in_record', 'record_id', p_record_id, 'key', p_key,
        'bytes', v_bytes, 'cap_bytes', p_cap, 'expand', false));
  end if;

  -- 3. A RELATION TO FILES is the file reference the current context system hands for the same
  --    value (```matrx {kind: reference, type: file, items: [{file_id}]}```), so the agent opens
  --    the file with the files tool instead of being handed a File record id it cannot open.
  if p_type in ('relation', 'entity_reference') and jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) > 0 then
    select jsonb_agg(jsonb_build_object('file_id', fr.data ->> 'file_id') order by x.ord), count(*)
      into v_files, v_n
      from jsonb_array_elements(v_val) with ordinality x(e, ord)
      join custom.record fr
        on jsonb_typeof(x.e) = 'string'
       and (x.e #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and fr.organization_id = p_organization_id
       and fr.id = (x.e #>> '{}')::uuid
       and fr.table_id = custom.file_kernel_id()
       and fr.deleted_at is null
       and coalesce(fr.data ->> 'file_id', '') <> '';
    if v_n = jsonb_array_length(v_val) then
      return jsonb_build_object('value', to_jsonb(E'```matrx\n' || jsonb_pretty(jsonb_build_object(
        'kind', 'reference', 'type', 'file', 'items', v_files, 'matrx_version', 1)) || E'\n```'));
    end if;
  end if;

  -- 4. A REFERENCE THE COPY MADE A RELATION (lane CONTEXT-PARITY). The current context system
  --    holds a reference as its ```matrx reference fence and hands the agent that fence; the copy
  --    rightly lands it as a relation (the Field's target), so the store must hand the SAME fence
  --    back, or the agent sees a bare id with no kind (Castellano & Reyes Matters `client` /
  --    `practice_area`, Titanium Team Members `department` / `reports_to`).
  --    a. An ENTITY REFERENCE ([{id, token, label}], one token): the fence of that kind, with the
  --       label the read door already resolved for this person (never a name they may not read).
  --    b. A RELATION TO COPIED SCOPES (each id a record the scope copy made from context.scopes):
  --       the scope fence, ids only — exactly the shape the current system's backfill wrote.
  --    Anything else (a native store relation) stays the store's own value.
  if p_type in ('relation', 'entity_reference') and jsonb_typeof(v_val) in ('string', 'array', 'object') then
    v_list := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_len := jsonb_array_length(v_list);
    if v_len > 0 then
      select count(*), count(distinct x.e ->> 'token'), min(x.e ->> 'token'),
             jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', x.e ->> 'id', 'label', x.e ->> 'label'))
                       order by x.ord)
        into v_n, v_kinds, v_kind, v_items
        from jsonb_array_elements(v_list) with ordinality x(e, ord)
       where jsonb_typeof(x.e) = 'object'
         and coalesce(x.e ->> 'id', '') <> ''
         and coalesce(x.e ->> 'token', '') <> '';
      if v_n = v_len and v_kinds = 1 then
        return jsonb_build_object('value', to_jsonb(E'```matrx\n' || jsonb_pretty(jsonb_build_object(
          'kind', 'reference', 'type', v_kind, 'items', v_items, 'matrx_version', 1)) || E'\n```'));
      end if;
      select count(*), jsonb_agg(jsonb_build_object('id', r.id::text) order by x.ord)
        into v_n, v_items
        from jsonb_array_elements(v_list) with ordinality x(e, ord)
        join custom.record r
          on jsonb_typeof(x.e) = 'string'
         and (x.e #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and r.id = (x.e #>> '{}')::uuid
         and r.data_class = 'record'
         and r.metadata -> 'moved_from' ->> 'table' = 'context.scopes';
      if v_n = v_len then
        return jsonb_build_object('value', to_jsonb(E'```matrx\n' || jsonb_pretty(jsonb_build_object(
          'kind', 'reference', 'type', 'scope', 'items', v_items, 'matrx_version', 1)) || E'\n```'));
      end if;
    end if;
  end if;

  -- 5. ONE FENCE IN A LIST FIELD (lane CONTEXT-PARITY). The current system let an `array` item
  --    hold one string, a ```matrx picklist fence; the copy lands it as a list of one, word for
  --    word (a list Field holds a list). A fence is itself the list of its items, so the agent is
  --    handed the fence exactly as the current system hands it (AI Matrx Features `included_apps`).
  if p_type not in ('relation', 'entity_reference') and jsonb_typeof(v_val) = 'array'
     and jsonb_array_length(v_val) = 1 and jsonb_typeof(v_val -> 0) = 'string'
     and (v_val ->> 0) ~ '^\s*```matrx\s' then
    return jsonb_build_object('value', v_val -> 0);
  end if;

  return jsonb_build_object('value', v_val);
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.resolve_id(p_id uuid, p_side text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_side      text := lower(nullif(btrim(coalesce(p_side, '')), ''));
  v_store     jsonb;
  v_has_new   boolean;
  v_has_old   boolean;
  v_old_org   uuid;
  v_old_live  boolean;
  v_pick      text;
  v_kind      text;
  v_org       uuid;
  v_path      text;
  v_live      boolean := true;
  v_type      uuid;
  v_sides     jsonb;
  c_not_yours constant text :=
    'This link does not open anything for the account you are signed in with. It may belong to '
    'somebody else, or it may have been mistyped. Check which account you are signed in as, or '
    'ask whoever sent it to share it with you.';
begin
  if p_id is null then
    raise exception 'platform.resolve_id: which id?' using errcode = '22004';
  end if;
  if v_side is not null and v_side not in ('new', 'old') then
    raise exception 'A table has an older side and a new side, and "%" is neither.', p_side
      using errcode = '22023',
            hint = 'Ask for side=new or side=old, or leave it out to open the one the id lives on.';
  end if;
  if (select auth.uid()) is null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);
  end if;

  -- The record store answers for its own objects, walled by its own doors.
  v_store := custom.where_id_opens(p_id);

  -- The older store answers through its own row security: this function is SECURITY INVOKER,
  -- so the SELECT below sees exactly the datasets /data/<id> itself would read.
  select d.organization_id, d.deleted_at is null
    into v_old_org, v_old_live
    from workbench.udt_datasets d
   where d.id = p_id;
  v_has_old := found;
  v_has_new := v_store is not null and v_store ->> 'kind' = 'table';

  if v_has_old or v_has_new then
    v_sides := jsonb_build_object('old', v_has_old, 'new', v_has_new);
    if (v_side = 'new' and not v_has_new) or (v_side = 'old' and not v_has_old) then
      return jsonb_build_object(
        'state', 'no_such_side', 'kind', 'table',
        'organization_id', case when v_has_new then (v_store ->> 'organization_id')::uuid else v_old_org end,
        'sides', v_sides,
        'says', case v_side
                  when 'new' then 'This table has no new side yet: it is still only in the older tables. Open it without side= to see it there.'
                  else 'This table has no older side: it was made in the new tables. Open it without side= to see it.'
                end);
    end if;
    v_pick := coalesce(v_side,
                case
                  when v_has_new and v_has_old then
                    case when coalesce((v_store ->> 'live')::boolean, true) and not v_old_live
                         then 'new' else 'old' end
                  when v_has_new then 'new'
                  else 'old'
                end);
    if v_pick = 'new' then
      v_kind := 'table';
      v_org  := (v_store ->> 'organization_id')::uuid;
      v_path := v_store ->> 'path';
      v_live := coalesce((v_store ->> 'live')::boolean, true);
    else
      v_kind := 'older_table';
      v_org  := v_old_org;
      v_path := '/data/' || p_id::text;
      v_live := v_old_live;
    end if;
    -- Asked for by name, a side opens even archived: comparing is the point of asking.
    if v_side is not null then
      v_live := true;
    end if;

  elsif v_side is not null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);

  elsif v_store is not null then
    v_kind := v_store ->> 'kind';
    v_org  := (v_store ->> 'organization_id')::uuid;
    v_path := v_store ->> 'path';
    v_live := coalesce((v_store ->> 'live')::boolean, true);

  else
    -- Everything else, asked as the person through each table's own row security.
    select 'document', d.organization_id, '/documents/' || d.id::text, d.deleted_at is null
      into v_kind, v_org, v_path, v_live
      from workbench.udt_documents d where d.id = p_id;
    if v_kind is null then
      select 'conversation', c.organization_id, '/chat/' || c.id::text, c.deleted_at is null
        into v_kind, v_org, v_path, v_live
        from chat.conversation c where c.id = p_id;
    end if;
    if v_kind is null then
      select 'scope', s.organization_id, '/scopes/s/' || s.id::text, s.deleted_at is null
        into v_kind, v_org, v_path, v_live
        from context.scopes s where s.id = p_id;
    end if;
    if v_kind is null then
      select 'context_item', st.organization_id, ci.scope_type_id,
             ci.deleted_at is null and coalesce(ci.is_active, true)
        into v_kind, v_org, v_type, v_live
        from context.context_items ci
        join context.scope_types st on st.id = ci.scope_type_id
       where ci.id = p_id;
      if v_kind is not null then
        v_path := '/organizations/' || v_org::text || '/scopes/' || v_type::text
                  || '/context-items/' || p_id::text;
      end if;
    end if;
  end if;

  if v_kind is null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);
  end if;

  if v_path is null then
    return jsonb_build_object(
      'state', 'no_screen', 'kind', v_kind, 'organization_id', v_org,
      'says', 'This is part of how a table is built — a column, a rule or a person row — and it has no screen of its own. Open the table it belongs to.');
  end if;

  if not v_live then
    return jsonb_build_object(
      'state', 'in_trash', 'kind', v_kind, 'organization_id', v_org,
      'says', 'This was archived. Nothing was deleted: it can be brought back from where it lived.');
  end if;

  -- THE OBJECT'S ORGANIZATION, NAMED ON THE ADDRESS, through the platform's one rule for it
  -- (platform.link_carries_its_organization, `?org=`) — never the caller's selection.
  if v_org is not null then
    v_path := platform.link_carries_its_organization(v_path, v_org);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'state', 'opens', 'kind', v_kind, 'organization_id', v_org, 'path', v_path,
    'sides', v_sides));
end;
$function$
;

CREATE OR REPLACE FUNCTION public._trash_kind_rows(p_uid uuid, p_org uuid, p_member uuid, p_kinds text[], p_limit integer, p_offset integer)
 RETURNS TABLE(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean, owner_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. The person (personal mode) or the organization (organization mode, gated by the
-- caller) is the filter; there is no per-row access check and no organization-wide walk here.
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) is titled
-- "<title> (in <parent>)" — it is listed, never hidden, and its restore brings the parent back first.
-- A scope type's Field (context_item) carries no organization_id; in organization mode its
-- organization is its scope type's.
-- lane TRASH-COVERAGE-2 (second file): the "(in <parent>)" suffix is computed AFTER the page is cut —
-- an outer select over the limited rows — so it costs one parent lookup per LISTED row, never one per
-- candidate row (org_trash_list file for AI Matrx measured 890.7 ms with it inside the sort; ceiling 300).
-- lane TRASH-COVERAGE-2 (third file): Organization Trash reads a table that carries visibility as TWO
-- bounded index walks — the organization's shared rows, and the caller's own personal rows — instead
-- of one walk that filters out every member's personal row (AI Matrx: 75,540 archived personal files,
-- 3 shared; the one walk read all of them to find three).
-- lane STORE-RESTORE-DOORS: five more record-store kinds — a Field, a Rule, a link between Records, a
-- document template and a dashboard, each removed on its own — read through public._trash_store_children
-- (one predicate with the counts) and titled by public._trash_store_title; restored through their own
-- store door (public._trash_store_restore).
declare
  rec record;
  v_rel regclass;
  v_title text;
  v_org text;
  v_cols text;
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_window int;
  v_title_expr text;
  v_parented boolean;
  v_q text;
  v_wrap text;
  v_kind text[];
begin
  if p_uid is null then return; end if;
  v_window := v_limit + v_offset;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.title_column, e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null
       and e.is_active
       and (p_kinds is null or e.user_artifact_kind = any(p_kinds))
     order by e.user_artifact_kind
  loop
    begin
      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        -- Vault credentials: the owner's own, only. Organization mode never lists them.
        if p_org is not null then continue; end if;
        return query execute format(
          'select %L::text, %L::text, %L::text, t.id, t.display_name::text,
                  t.deleted_at, t.organization_id, true, t.user_id
             from users.credential_items t
            where t.user_id = $1 and t.deleted_at is not null
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_limit, v_offset)
          using p_uid;
        continue;
      end if;

      v_title := null;
      -- A scope type's own name is its plural label ("Service areas"); its title_column is the slug.
      select a.attname into v_title
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['label_plural', coalesce(rec.title_column, '')])
       order by (a.attname <> 'label_plural')
       limit 1;
      if v_title is null then
        select a.attname into v_title
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
         order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
         limit 1;
      end if;
      v_org := null;
      select a.attname into v_org
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = 'organization_id'
       limit 1;

      v_title_expr := case when v_title is null then 'null::text' else format('left(t.%I::text, 200)', v_title) end;
      -- The comment kind's title rule (a suggestion shows its replacement, a comment its body, else the quote).
      if rec.token = 'comment' then v_title_expr := 'left(platform.comment_trash_title(t), 200)'; end if;
      -- A Data table row has no title column: its own words, then the table it sits in.
      if rec.token = 'udt_dataset_rows' then
        v_title_expr := 'left(coalesce(nullif(btrim(coalesce(t.data ->> ''name'', t.data ->> ''title'', custom._first_words(t.data))), ''''), ''Untitled row'')'
          || ' || '' (in '' || coalesce((select nullif(btrim(d.table_name), '''') from workbench.udt_datasets d where d.id = t.table_id), ''a table'') || '')'', 200)';
      end if;
      v_parented := rec.token in ('folder', 'file', 'hr_employment', 'workflow_trigger', 'processed_document')
        or exists (select 1 from platform.soft_delete_edge s
                    where s.child_schema = rec.sch and s.child_table = rec.tbl and s.action = 'cascade');
      v_wrap := null;
      if v_parented then
        v_wrap := format(
          'select y.a, y.b, y.c, y.id, '
          || 'coalesce((select coalesce(nullif(btrim(y.t), ''''), ''Untitled'') || '' (in '' || '
          || 'coalesce(nullif(btrim(ap.parent_title), ''''), ''an archived item'') || '')'' '
          || 'from platform.archived_parent_of(%L, y.id) ap limit 1), y.t), '
          || 'y.d, y.o, y.m, y.w from (%%s) y(a, b, c, id, t, d, o, m, w) order by y.d desc, y.id',
          rec.token);
      end if;

      if rec.token = 'context_item' and p_org is not null then
        v_q := format(
          'select %L::text, %L::text, %L::text, t.id, %s, t.deleted_at, st.organization_id, (t.%I = $1), t.%I
             from context.context_items t
             join context.scope_types st on st.id = t.scope_type_id
            where st.organization_id = $2 and t.deleted_at is not null
              and ($3::uuid is null or t.%I = $3)
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_title_expr, rec.owner_col, rec.owner_col, rec.owner_col,
          v_limit, v_offset);
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid, p_org, p_member;
        continue;
      end if;

      if p_org is not null and v_org is null then continue; end if;

      v_cols := format('%L::text, %L::text, %L::text, t.id, %s, t.deleted_at, %s, (t.%I = $1), t.%I',
        rec.kind, rec.token, rec.label,
        v_title_expr,
        case when v_org is null then 'null::uuid' else format('t.%I', v_org) end,
        rec.owner_col, rec.owner_col);

      if p_org is null then
        -- PERSONAL: what I own, plus what was named to me. Each branch is its own indexed read.
        v_q := format(
          'select * from (
             (select %1$s from %2$I.%3$I t
               where t.%4$I = $1 and t.deleted_at is not null
               order by t.deleted_at desc, t.id limit %5$s)
             union all
             (select %1$s from %2$I.%3$I t
               where t.deleted_at is not null
                 and t.%4$I is distinct from $1
                 and t.id in (select g.resource_id from iam.permissions g
                               where g.granted_to_user_id = $1
                                 and g.resource_type = %6$L
                                 and coalesce(g.status, ''active'') <> ''rejected''
                                 and (g.expires_at is null or g.expires_at > now()))
               order by t.deleted_at desc, t.id limit %5$s)
           ) x
           order by x.deleted_at desc, x.id
           limit %7$s offset %8$s',
          v_cols, rec.sch, rec.tbl, rec.owner_col, v_window, rec.token, v_limit, v_offset);
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid;
      else
        -- ORGANIZATION: this organization's archived rows, optionally one member's. The caller gated it.
        -- A PERSONAL row (visibility = personal) belongs to its owner alone — a member's private
        -- highlight or note never shows in the organization's Trash (verify RC-B11 round 3; access
        -- is personal, Arman 2026-09-23). Its owner still sees it in their own Trash.
        if iam.table_has_visibility(rec.sch, rec.tbl) then
          v_q := format(
            'select * from (
               (select %1$s from %2$I.%3$I t
                 where t.%4$I = $2 and t.deleted_at is not null
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility is distinct from ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
               union all
               (select %1$s from %2$I.%3$I t
                 where t.%5$I = $1 and t.deleted_at is not null
                   and t.%4$I = $2
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility = ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
             ) x
             order by x.deleted_at desc, x.id
             limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset, v_window);
        else
          v_q := format(
            'select %1$s from %2$I.%3$I t
              where t.%4$I = $2 and t.deleted_at is not null
                and ($3::uuid is null or t.%5$I = $3)
              order by t.deleted_at desc, t.id
              limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset);
        end if;
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid, p_org, p_member;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;

  -- ── THE RECORD STORE (lane TRASH-TABLES) ────────────────────────────────────────────────────
  -- One physical table (custom.record) holds every Table and Record, so the registry loop above
  -- cannot describe them. Same two modes, same person/organization filter, restored by
  -- custom.record_restore through entity_undelete / org_trash_restore (token `record`).
  -- ── PASSAGE LINKS (annotation trash) ─────────────────────────────────────────────────────────
  -- Only anchored_to associations the person made, removed on their own; personal Trash only (see
  -- the file header). The rest of platform.associations never reaches /trash.
  if p_kinds is null or 'passage_link' = any (p_kinds) then
    return query
    select 'passage_link'::text, 'passage_link'::text, 'Passage link'::text, a.id,
           left(platform.passage_link_trash_title(a), 200),
           a.deleted_at, a.organization_id, (a.created_by = p_uid), a.created_by
      from platform.associations a
     where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null
       and p_org is null and a.created_by = p_uid
     order by a.deleted_at desc, a.id
     limit v_limit offset v_offset;
  end if;

  if to_regclass('custom.record') is null then return; end if;

  if p_kinds is null or 'table' = any (p_kinds) then
    if p_org is null then
      return query
      select 'table'::text, 'record'::text, 'Table'::text, x.id,
             coalesce(nullif(btrim(x.data ->> 'name'), ''), 'Untitled table'),
             x.deleted_at, x.organization_id, (x.created_by = p_uid), x.created_by
        from (
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null
            order by t.deleted_at desc, t.id limit v_window)
          union all
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.data_class = 'table' and t.deleted_at is not null
              and t.created_by is distinct from p_uid
              and t.id in (select g.resource_id from iam.permissions g
                            where g.granted_to_user_id = p_uid
                              and g.resource_type = 'record'
                              and coalesce(g.status, 'active') <> 'rejected'
                              and (g.expires_at is null or g.expires_at > now()))
            order by t.deleted_at desc, t.id limit v_window)
        ) x
       order by x.deleted_at desc, x.id
       limit v_limit offset v_offset;
    else
      return query
      select 'table'::text, 'record'::text, 'Table'::text, t.id,
             coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
             t.deleted_at, t.organization_id, (t.created_by = p_uid), t.created_by
        from custom.record t
       where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
         and (p_member is null or t.created_by = p_member)
       order by t.deleted_at desc, t.id
       limit v_limit offset v_offset;
    end if;
  end if;

  if p_kinds is null or 'record' = any (p_kinds) then
    -- A Record archived on its own, while its Table is live. One inside an archived Table comes
    -- back with the Table, so it is not a second Trash row.
    return query
    select 'record'::text, 'record'::text, 'Record'::text, y.id,
           format('%s (in %s)',
                  coalesce(nullif(btrim(custom.record_words(y.organization_id, y.id)), ''), 'Untitled record'),
                  coalesce(nullif(btrim(y.table_name), ''), 'a table')),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (
        select x.id, x.deleted_at, x.organization_id, x.created_by, x.table_name
          from (
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name' as table_name
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.data_class = 'record' and r.deleted_at is not null
                and r.created_by is distinct from p_uid
                and r.id in (select g.resource_id from iam.permissions g
                              where g.granted_to_user_id = p_uid
                                and g.resource_type = 'record'
                                and coalesce(g.status, 'active') <> 'rejected'
                                and (g.expires_at is null or g.expires_at > now()))
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is not null
                and r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
                and (p_member is null or r.created_by = p_member)
              order by r.deleted_at desc, r.id limit v_window)
          ) x
         order by x.deleted_at desc, x.id
         limit v_limit offset v_offset
      ) y
     order by y.deleted_at desc, y.id;
  end if;

  -- ── THE STORE'S OWN THINGS, removed on their own (lane STORE-RESTORE-DOORS) ──────────────────
  foreach v_kind slice 1 in array array[['field','Field'],['rule','Rule'],['relation','Link'],['doc_template','Document template'],['dashboard','Dashboard']] loop
    continue when p_kinds is not null and not (v_kind[1] = any (p_kinds));
    return query
    select v_kind[1], 'record'::text, v_kind[2], y.id,
           coalesce(public._trash_store_title(y.organization_id, y.id), 'Untitled'),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (select c.id, c.organization_id, c.deleted_at, c.created_by
              from public._trash_store_children(p_uid, p_org, p_member, v_kind[1], v_window) c
             order by c.deleted_at desc, c.id
             limit v_limit offset v_offset) y
     order by y.deleted_at desc, y.id;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._trash_kind_counts(p_uid uuid, p_org uuid, p_member uuid)
 RETURNS TABLE(artifact_kind text, label text, n bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. Mirrors public._trash_kind_rows row for row; no per-row access check.
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
-- lane TRASH-COVERAGE-2: context_item's organization is its scope type's (it has no organization_id).
-- lane STORE-RESTORE-DOORS: the five store kinds, counted through the SAME predicate the listing reads
-- (public._trash_store_children).
declare
  rec record;
  v_rel regclass;
  v_org text;
  v_n bigint;
  v_kind text[];
begin
  if p_uid is null then return; end if;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null and e.is_active
     order by e.user_artifact_kind
  loop
    begin
      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;
      v_n := 0;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        if p_org is not null then continue; end if;
        select count(*) into v_n from users.credential_items t
         where t.user_id = p_uid and t.deleted_at is not null;
      else
        v_org := null;
        select a.attname into v_org
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = 'organization_id'
         limit 1;
        if p_org is null then
          execute format(
            'select (select count(*) from %1$I.%2$I t where t.%3$I = $1 and t.deleted_at is not null)
                  + (select count(*) from %1$I.%2$I t
                      where t.deleted_at is not null and t.%3$I is distinct from $1
                        and t.id in (select g.resource_id from iam.permissions g
                                      where g.granted_to_user_id = $1
                                        and g.resource_type = %4$L
                                        and coalesce(g.status, ''active'') <> ''rejected''
                                        and (g.expires_at is null or g.expires_at > now())))',
            rec.sch, rec.tbl, rec.owner_col, rec.token)
            into v_n using p_uid;
        elsif rec.token = 'context_item' then
          select count(*) into v_n
            from context.context_items t
            join context.scope_types st on st.id = t.scope_type_id
           where st.organization_id = p_org and t.deleted_at is not null
             and (p_member is null or t.created_by = p_member);
        else
          if v_org is null then continue; end if;
          execute format(
            'select count(*) from %1$I.%2$I t
              where t.%3$I = $1 and t.deleted_at is not null
                and ($2::uuid is null or t.%4$I = $2)',
            rec.sch, rec.tbl, v_org, rec.owner_col)
            into v_n using p_org, p_member;
        end if;
      end if;

      if v_n > 0 then
        artifact_kind := rec.kind; label := rec.label; n := v_n; return next;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;

  -- ── THE RECORD STORE (lane TRASH-TABLES) — the same predicates as _trash_kind_rows ──────────
  -- ── PASSAGE LINKS — the same predicate as _trash_kind_rows ─────────────────────────────────
  select count(*) into v_n from platform.associations a
   where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null
     and p_org is null and a.created_by = p_uid;
  if v_n > 0 then
    artifact_kind := 'passage_link'; label := 'Passage link'; n := v_n; return next;
  end if;

  if to_regclass('custom.record') is null then return; end if;

  if p_org is null then
    select (select count(*) from custom.record t
             where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null)
         + (select count(*) from custom.record t
             where t.data_class = 'table' and t.deleted_at is not null
               and t.created_by is distinct from p_uid
               and t.id in (select g.resource_id from iam.permissions g
                             where g.granted_to_user_id = p_uid and g.resource_type = 'record'
                               and coalesce(g.status, 'active') <> 'rejected'
                               and (g.expires_at is null or g.expires_at > now())))
      into v_n;
  else
    select count(*) into v_n from custom.record t
     where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
       and (p_member is null or t.created_by = p_member);
  end if;
  if v_n > 0 then
    artifact_kind := 'table'; label := 'Table'; n := v_n; return next;
  end if;

  if p_org is null then
    select (select count(*) from custom.record r
              join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                                  and t.data_class = 'table' and t.deleted_at is null
             where r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null)
         + (select count(*) from custom.record r
              join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                                  and t.data_class = 'table' and t.deleted_at is null
             where r.data_class = 'record' and r.deleted_at is not null
               and r.created_by is distinct from p_uid
               and r.id in (select g.resource_id from iam.permissions g
                             where g.granted_to_user_id = p_uid and g.resource_type = 'record'
                               and coalesce(g.status, 'active') <> 'rejected'
                               and (g.expires_at is null or g.expires_at > now())))
      into v_n;
  else
    select count(*) into v_n from custom.record r
      join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                          and t.data_class = 'table' and t.deleted_at is null
     where r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
       and (p_member is null or r.created_by = p_member);
  end if;
  if v_n > 0 then
    artifact_kind := 'record'; label := 'Record'; n := v_n; return next;
  end if;

  foreach v_kind slice 1 in array array[['field','Field'],['rule','Rule'],['relation','Link'],['doc_template','Document template'],['dashboard','Dashboard']] loop
    select count(*) into v_n from public._trash_store_children(p_uid, p_org, p_member, v_kind[1], null);
    if v_n > 0 then
      artifact_kind := v_kind[1]; label := v_kind[2]; n := v_n; return next;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.org_trash_restore(p_organization_id uuid, p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. An owner or admin of the organization restores one member's archived item that sits
-- in THIS organization. One audit row (iam.org_admin_audit, action trash.restore) and, when the item
-- is somebody else's, an in-app notice to its owner. Never a purge.
-- lane TRASH-TABLES: a record-store Table or Record (token `record`) is restored by
-- custom.record_restore, which asks the store's own ladder for the caller and brings back exactly what
-- its archive took; a refusal is returned as restored=false with the store's sentence.
-- lane TRASH-COVERAGE-2: a row whose parent is archived brings the parent back first, through this
-- same door (audited and noticed as the parent). Kinds with their own restore door go through it:
-- folder (public.restore_folder), scope type (public.restore_scope_type), scope (public.restore_scope),
-- scope type Field (public.restore_context_item), library document (rag.fn_restore_library_document),
-- HR employee (public.hr_employee_restore); a door's
-- refusal is restored=false with a sentence, never a raw update around it.
-- lane STORE-RESTORE-DOORS: a Field, Rule, link, document template or dashboard (token `record`) goes
-- through its own store door (public._trash_store_restore) and a mandate through
-- mandate.definition_restore; the door's own refusal sentence is the answer.
-- lane DOORS-DECIDE-LAST: a Meeting through communication.meet_restore_meeting.
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  e record;
  v_rel regclass;
  v_title_col text;
  v_owner uuid;
  v_title text;
  v_label text;
  v_me_name text;
  v_org_name text;
  v_subject text;
  v_body text;
  v_class text;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_ptitle text;
  v_via_parent boolean := false;
  v_res jsonb;
  v_at timestamptz;
  v_title_expr text;
  v_found boolean;
  v_n int;
  v_why text;
begin
  if p_token = 'record' then
    select r.created_by, r.data_class,
           case when r.data_class = 'table'
                then coalesce(nullif(btrim(r.data ->> 'name'), ''), 'Untitled table')
                when r.data_class = 'record'
                then coalesce(nullif(btrim(custom.record_words(r.organization_id, r.id)), ''), 'Untitled record')
                else coalesce(public._trash_store_title(r.organization_id, r.id), 'Untitled') end
      into v_owner, v_class, v_title
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id
       and r.deleted_at is not null
       and r.data_class in ('table', 'record', 'field', 'rule', 'relation', 'doc_template', 'dashboard');
    if not found then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;
    begin
      perform public._trash_store_restore(p_organization_id, p_id);
    exception
      when insufficient_privilege then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      when check_violation or unique_violation or no_data_found or raise_exception then
        get stacked diagnostics v_why = message_text;
        return jsonb_build_object('restored', false, 'message', v_why);
    end;
    v_label := case v_class when 'table' then 'Table' when 'record' then 'Record' when 'field' then 'Field'
                            when 'rule' then 'Rule' when 'relation' then 'Link'
                            when 'doc_template' then 'Document template' else 'Dashboard' end;
    select 'record'::text as token, v_label as label into e;
  else
    select t.token, t.user_artifact_kind, t.label, t.schema_name, t.table_name,
           coalesce(t.retention_owner_column, 'created_by') as owner_col, t.title_column, t.feature_owned_restore
      into e
      from platform.entity_types t
     where t.token = p_token and t.is_active and t.user_artifact_kind is not null;
    if not found then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;
    if coalesce(e.feature_owned_restore, false) or e.token in ('credential_item', 'user_secret', 'credential_attachment') then
      raise exception 'Vault items are restored by their owner from their own Trash.' using errcode = '42501';
    end if;
    v_rel := to_regclass(format('%I.%I', e.schema_name, e.table_name));
    if v_rel is null then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;

    select a.attname into v_title_col from pg_attribute a
     where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
       and a.attname = any (array['label_plural', coalesce(e.title_column, '')])
     order by (a.attname <> 'label_plural') limit 1;
    if v_title_col is null then
      select a.attname into v_title_col from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
       order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
       limit 1;
    end if;

    v_title_expr := case when v_title_col is null then 'null::text' else format('left(t.%I::text, 200)', v_title_col) end;

    -- The parent first: a child of an archived parent only comes back with it.
    for v_i in 1..8 loop
      v_pid := null;
      select ap.parent_token, ap.parent_id, ap.parent_title into v_ptok, v_pid, v_ptitle
        from platform.archived_parent_of(e.token, p_id) ap limit 1;
      exit when v_pid is null;
      if not exists (select 1 from platform.entity_types t
                      where t.token = v_ptok and t.is_active and t.user_artifact_kind is not null) then
        return jsonb_build_object('restored', false,
          'message', format('It is inside %s, which is archived and is not in this organization''s Trash. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_ptitle), ''), 'something')));
      end if;
      v_res := public.org_trash_restore(p_organization_id, v_ptok, v_pid);
      if not coalesce((v_res ->> 'restored')::boolean, false) then
        return v_res;
      end if;
      v_via_parent := true;
    end loop;

    -- The row, in THIS organization (a scope type's Field reads its organization from its scope type).
    if e.token = 'context_item' then
      select true, ci.created_by, left(ci.display_name::text, 200), ci.deleted_at
        into v_found, v_owner, v_title, v_at
        from context.context_items ci
        join context.scope_types st on st.id = ci.scope_type_id
       where ci.id = p_id and st.organization_id = p_organization_id;
    else
      execute format('select true, t.%I, %s, t.deleted_at from %I.%I t where t.id = $1 and t.organization_id = $2',
                     e.owner_col, v_title_expr, e.schema_name, e.table_name)
        into v_found, v_owner, v_title, v_at
        using p_id, p_organization_id;
    end if;
    if not coalesce(v_found, false) or (v_at is null and not v_via_parent) then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;

    if v_at is null then
      -- It came back with its parent (audited and noticed there). A Field comes back in use.
      if e.token = 'context_item' then
        perform public.restore_context_item(p_id);
      end if;
      return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
        'message', format('%s came back with %s.', coalesce(nullif(btrim(v_title), ''), e.label),
                          coalesce(nullif(btrim(v_ptitle), ''), 'what it sits in')));
    end if;

    if e.token in ('folder', 'scope_type', 'scope', 'context_item', 'processed_document', 'hr_employee', 'mandate', 'meet_meeting') then
      begin
        case e.token
          when 'folder' then perform public.restore_folder(p_id);
          when 'scope_type' then perform public.restore_scope_type(p_id);
          when 'scope' then perform public.restore_scope(p_id);
          when 'context_item' then perform public.restore_context_item(p_id);
          when 'processed_document' then perform rag.fn_restore_library_document(p_id);
          when 'mandate' then perform mandate.definition_restore(p_id);
          -- lane DOORS-DECIDE-LAST: a Meeting through Meet's own door (host or co-host).
          when 'meet_meeting' then perform communication.meet_restore_meeting(p_id, null);
          when 'hr_employee' then
            v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
            if not coalesce((v_res ->> 'ok')::boolean, false) then
              return jsonb_build_object('restored', false,
                'message', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                    'Only someone HR allows to restore this person can bring them back.'));
            end if;
        end case;
      exception when insufficient_privilege or raise_exception or no_data_found then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      end;
    else
      execute format(
        'update %I.%I t set deleted_at = null
          where t.id = $1 and t.organization_id = $2 and t.deleted_at is not null
          returning t.%I, %s',
        e.schema_name, e.table_name, e.owner_col, v_title_expr)
        into v_owner, v_title
        using p_id, p_organization_id;
      get diagnostics v_n = row_count;

      -- (EXECUTE never sets FOUND; the row count is the answer.)
      if v_n = 0 then
        return jsonb_build_object('restored', false,
          'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
      end if;
      if e.token = 'workflow' then
        perform workflow.restore_triggers_archived_with(p_id, v_at);
      end if;
    end if;
    v_label := e.label;
  end if;

  perform iam._org_audit(p_organization_id, v_owner, 'trash.restore',
    jsonb_build_object('entity_token', e.token, 'id', p_id, 'label', v_label, 'title', v_title));

  if v_owner is not null and v_owner is distinct from v_me then
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(btrim(u.email), ''), 'An organization admin')
      into v_me_name from auth.users u where u.id = v_me;
    select coalesce(nullif(btrim(o.name), ''), 'your organization') into v_org_name
      from iam.organizations o where o.id = p_organization_id;
    v_subject := format('%s restored your %s', coalesce(v_me_name, 'An organization admin'), lower(v_label));
    v_body := format('%s restored "%s" from %s''s Trash. It is back where it was.',
                     coalesce(v_me_name, 'An organization admin'),
                     coalesce(nullif(btrim(v_title), ''), 'Untitled'), coalesce(v_org_name, 'your organization'));
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind,
       dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
    values
      (p_organization_id, 'trash.restored_by_org_admin', 'in_app', v_owner, 'user',
       format('trash.restore:%s:%s:%s', e.token, p_id, extract(epoch from clock_timestamp())::bigint),
       v_subject, left(v_body, 600),
       jsonb_build_object('entity_token', e.token, 'id', p_id, 'by', v_me, 'source', 'org_trash_restore',
                          'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
       e.token, p_id, null, 'personal'::platform.visibility)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
    'message', format('%s restored.', coalesce(nullif(btrim(v_title), ''), v_label)));
end;
$function$
;

delete from platform.client_callable_door
 where schema_name = 'public' and function_name in ('_dict_context_owners', '_dict_context_owner_org', '_trash_context_rows', 'kg_caller_can_target_scope');
drop function if exists public._trash_context_rows(text, uuid, uuid, uuid);
drop function if exists public._dict_context_owner_org(text, uuid);
drop function if exists public._dict_context_owners(uuid[], uuid[]);
