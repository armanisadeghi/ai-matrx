-- research_canon_05_move_to_research_schema
-- Applied once `research` was exposed to PostgREST (Settings -> API -> Exposed schemas).
-- Relocate the fully-canonical research cluster public.rs_* -> research.rs_*.
-- SET SCHEMA carries columns/PK/indexes/constraints/inbound FKs/RLS policies/triggers/sequences.
-- The view tracks deps by OID so SET SCHEMA is safe; the 4 functions hardcode public.rs_* and are repointed below.

-- Schema is pre-created; ensure grants (idempotent).
create schema if not exists research;
grant usage on schema research to authenticated, anon, service_role;
grant all on all tables in schema research to service_role;
grant select, insert, update, delete on all tables in schema research to authenticated;
alter default privileges in schema research grant all on tables to service_role;
alter default privileges in schema research grant select, insert, update, delete on tables to authenticated;

-- Move the 12 base tables (entity + components + junctions).
alter table public.rs_topic           set schema research;
alter table public.rs_template         set schema research;
alter table public.rs_keyword          set schema research;
alter table public.rs_source           set schema research;
alter table public.rs_tag              set schema research;
alter table public.rs_synthesis        set schema research;
alter table public.rs_document         set schema research;
alter table public.rs_content          set schema research;
alter table public.rs_analysis         set schema research;
alter table public.rs_media            set schema research;
alter table public.rs_source_tag       set schema research;
alter table public.rs_keyword_source   set schema research;
-- Move the denormalized view (deps are by OID, keeps resolving).
alter view  public.rs_source_keywords  set schema research;

-- Re-assert grants on the now-moved tables (privileges follow SET SCHEMA, but be explicit).
grant select, insert, update, delete on all tables in schema research to authenticated;
grant all on all tables in schema research to service_role;

-- Registry schema_name must follow (verify_canonical / has_access resolve schema from entity_types).
update platform.entity_types set schema_name='research'
 where token in ('research_topic','research_template','research_keyword','research_source','research_tag',
                 'research_synthesis','research_document','research_content','research_analysis',
                 'research_media','research_source_tag','research_keyword_source');
update public.shareable_resource_registry set schema_name='research'
 where resource_type in ('research_topic','research_template');

-- Repoint the 4 functions that hardcode public.rs_* (only the rs_* refs change; pc_episodes/dm_messages stay public).
CREATE OR REPLACE FUNCTION public.get_user_dashboard_metrics()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    'transcripts',      (select count(*) from transcripts.transcripts where user_id = uid and coalesce(is_deleted, false) = false),
    'scopes',           (select count(*) from context.scopes         where created_by = uid),
    'shortcuts',        (select count(*) from agent.shortcut         where created_by = uid and coalesce(is_active, false) = true),
    'research_reports', (select count(*) from research.rs_topic      where created_by = uid),
    'podcasts',         (select count(*) from public.pc_episodes     where user_id = uid),
    'messages',         (select count(*) from public.dm_messages     where sender_id = uid and deleted_at is null)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_keywords(p_topic_id uuid, p_keyword_ids uuid[])
 RETURNS void LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(p_keyword_ids) WITH ORDINALITY AS u(id, ord)
      LEFT JOIN research.rs_keyword k
        ON k.id = u.id AND k.topic_id = p_topic_id
     WHERE k.id IS NULL
  ) THEN
    RAISE EXCEPTION 'reorder_keywords: one or more ids do not belong to topic %', p_topic_id;
  END IF;
  UPDATE research.rs_keyword k
     SET position = u.ord
    FROM unnest(p_keyword_ids) WITH ORDINALITY AS u(id, ord)
   WHERE k.id = u.id
     AND k.topic_id = p_topic_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rs_keyword_assign_position()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.position IS NULL OR NEW.position = 0 THEN
        SELECT COALESCE(MAX(position), 0) + 1
          INTO NEW.position
          FROM research.rs_keyword
         WHERE topic_id = NEW.topic_id;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rs_topic_append_output(p_topic_id uuid, p_kind text, p_asset jsonb)
 RETURNS jsonb LANGUAGE plpgsql
AS $function$
declare
  v_outputs jsonb; v_assets jsonb; v_kind_obj jsonb; v_asset_id text;
begin
  if p_kind is null or p_kind = '' then raise exception 'p_kind is required'; end if;
  if p_asset is null or jsonb_typeof(p_asset) <> 'object' then raise exception 'p_asset must be a JSON object'; end if;
  select coalesce(outputs, '{}'::jsonb) into v_outputs from research.rs_topic where id = p_topic_id for update;
  if not found then raise exception 'rs_topic % not found', p_topic_id; end if;
  v_asset_id := p_asset->>'id';
  v_assets := coalesce(v_outputs -> p_kind -> 'assets', '[]'::jsonb);
  v_assets := (select coalesce(jsonb_agg(elem), '[]'::jsonb) from jsonb_array_elements(v_assets) elem
                where v_asset_id is null or elem->>'id' is distinct from v_asset_id);
  v_assets := jsonb_build_array(p_asset) || v_assets;
  v_kind_obj := coalesce(v_outputs -> p_kind, '{}'::jsonb);
  v_kind_obj := jsonb_set(v_kind_obj, array['assets'], v_assets, true);
  v_outputs := jsonb_set(v_outputs, array[p_kind], v_kind_obj, true);
  update research.rs_topic set outputs = v_outputs where id = p_topic_id;
  return v_outputs;
end;
$function$;

-- Functions with BARE (unqualified) rs_* refs found by the pre-move re-scan — repoint to research.*.
CREATE OR REPLACE FUNCTION public.get_topic_overview(p_topic_id uuid)
 RETURNS json LANGUAGE plpgsql STABLE
AS $function$
DECLARE
  _sources_by_status json; _total_sources bigint; _total_eligible bigint;
BEGIN
  SELECT coalesce(json_object_agg(scrape_status, cnt), '{}'::json) INTO _sources_by_status
  FROM (SELECT scrape_status, count(*) as cnt FROM research.rs_source WHERE topic_id = p_topic_id GROUP BY scrape_status) sub;
  SELECT count(*) INTO _total_sources FROM research.rs_source WHERE topic_id = p_topic_id;
  SELECT count(*) INTO _total_eligible FROM research.rs_content
   WHERE topic_id = p_topic_id AND is_good_scrape = true AND is_current = true;
  RETURN json_build_object(
    'total_keywords',              (SELECT count(*) FROM research.rs_keyword WHERE topic_id = p_topic_id),
    'stale_keywords',              (SELECT count(*) FROM research.rs_keyword WHERE topic_id = p_topic_id AND is_stale = true),
    'total_sources',               _total_sources,
    'included_sources',            (SELECT count(*) FROM research.rs_source WHERE topic_id = p_topic_id AND is_included = true),
    'sources_by_status',           _sources_by_status,
    'total_content',               (SELECT count(*) FROM research.rs_content WHERE topic_id = p_topic_id),
    'total_analyses',              (SELECT count(*) FROM research.rs_analysis WHERE topic_id = p_topic_id),
    'total_eligible_for_analysis', _total_eligible,
    'failed_analyses',             (SELECT count(*) FROM research.rs_analysis WHERE topic_id = p_topic_id AND status = 'failed'),
    'keyword_syntheses',           (SELECT count(*) FROM research.rs_synthesis WHERE topic_id = p_topic_id AND scope = 'keyword' AND is_current = true),
    'failed_keyword_syntheses',    (SELECT count(*) FROM research.rs_synthesis WHERE topic_id = p_topic_id AND scope = 'keyword' AND is_current = true AND status = 'failed'),
    'project_syntheses',           (SELECT count(*) FROM research.rs_synthesis WHERE topic_id = p_topic_id AND scope = 'project' AND is_current = true),
    'failed_project_syntheses',    (SELECT count(*) FROM research.rs_synthesis WHERE topic_id = p_topic_id AND scope = 'project' AND is_current = true AND status = 'failed'),
    'total_tags',                  (SELECT count(*) FROM research.rs_tag WHERE topic_id = p_topic_id),
    'total_documents',             (SELECT count(*) FROM research.rs_document WHERE topic_id = p_topic_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_hierarchy()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare result jsonb; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'is_personal', o.is_personal, 'role', om.role::text,
        'project_count', (select count(*) from workspace.projects p where p.organization_id = o.id
          and exists (select 1 from iam.memberships pm where pm.container_type='project' and pm.container_id = p.id and pm.user_id = uid and pm.deleted_at is null))
      ) order by o.is_personal desc, o.name asc) from organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = uid
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'organization_id', p.organization_id,
        'is_personal', coalesce(po.is_personal, false), 'role', pm.role::text,
        'topic_count', (select count(*) from research.rs_topic rt where rt.project_id = p.id))
      order by p.name asc) from workspace.projects p join iam.memberships pm on pm.container_type='project' and pm.container_id = p.id and pm.user_id = uid and pm.deleted_at is null
        left join organizations po on po.id = p.organization_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agx_usage_history_counts(p_agent_id uuid)
 RETURNS TABLE(source text, total bigint, last_used_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_super boolean; v_access text; v_vids uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'agx_usage_history_counts: not authenticated' USING ERRCODE = '42501'; END IF;
  v_super := public.is_super_admin();
  SELECT gal.access_level INTO v_access FROM public.agx_get_access_level(p_agent_id) gal;
  IF NOT (v_super OR v_access IN ('owner', 'admin', 'editor')) THEN
    RAISE EXCEPTION 'agx_usage_history_counts: edit access to the agent is required' USING ERRCODE = '42501';
  END IF;
  v_vids := ARRAY(SELECT v.id FROM agent.definition_version v WHERE v.agent_id = p_agent_id);
  RETURN QUERY
  SELECT 'conversations'::text, count(*), max(c.created_at) FROM chat.conversation c
    WHERE c.initial_agent_id = p_agent_id OR c.initial_agent_version_id = ANY (v_vids)
  UNION ALL
  SELECT 'requests', count(*), max(q.created_at) FROM chat.user_request q
    WHERE q.agent_id = p_agent_id OR q.agent_version_id = ANY (v_vids)
  UNION ALL
  SELECT 'messages', count(*), max(m.created_at) FROM chat.message m WHERE m.agent_id = p_agent_id
  UNION ALL
  SELECT 'workflow_runs', count(*), max(w.created_at) FROM workflow.run w
    WHERE w.agent_id = p_agent_id OR w.agent_version_id = ANY (v_vids)
  UNION ALL
  SELECT 'research', count(*), max(x.created_at) FROM (
    SELECT ra.created_at FROM research.rs_analysis ra WHERE ra.agent_id = p_agent_id::text
    UNION ALL SELECT rd.created_at FROM research.rs_document rd WHERE rd.agent_id = p_agent_id::text
    UNION ALL SELECT rsyn.created_at FROM research.rs_synthesis rsyn WHERE rsyn.agent_id = p_agent_id::text
  ) x
  UNION ALL
  SELECT 'page_extractions', count(*), max(pj.created_at) FROM page_extraction_jobs pj WHERE pj.agent_id = p_agent_id
  UNION ALL
  SELECT 'context_access', count(*), NULL::timestamptz FROM context.context_access_log cl WHERE cl.agent_id = p_agent_id
  UNION ALL
  SELECT 'errors', count(*), NULL::timestamptz FROM system_error se WHERE se.agent_id = p_agent_id;
END;
$function$;

-- container_resource_counts: research data-row now points at the research schema. Other rows
-- (education/workbench/etc.) are owned by their own feature moves — left exactly as-is.
CREATE OR REPLACE FUNCTION public.container_resource_counts(p_column text, p_container_id uuid)
 RETURNS TABLE(resource_key text, n bigint)
 LANGUAGE plpgsql SET search_path TO ''
AS $function$
declare
  rec record; v_count bigint; v_has_col boolean; v_has_arch boolean; v_sql text;
begin
  if p_column not in ('organization_id', 'project_id', 'task_id') then
    raise exception 'invalid container column: %', p_column;
  end if;
  if p_container_id is null then return; end if;
  for rec in
    select * from (values
      ('agent',            'agent',       'definition',        'is_archived'),
      ('agent_app',        'app',         'definition',        null),
      ('agent_shortcut',   'agent',       'shortcut',          null),
      ('skill',            'skill',       'definition',        null),
      ('content_template', 'public',      'content_template',  null),
      ('sandbox',          'public',      'sandbox_instances', null),
      ('file',             'files',       'files',             null),
      ('dataset',          'public',      'workbench.udt_datasets',      null),
      ('picklist',         'public',      'workbench.udt_picklists',     null),
      ('workbook',         'public',      'workbench.udt_workbooks',     null),
      ('transcript',       'transcripts', 'transcripts',       null),
      ('note',             'public',      'notes',             null),
      ('conversation',     'chat',        'conversation',      null),
      ('flashcard',        'education',   'flashcard_data',    null),
      ('quiz',             'education',   'quiz_sessions',     null),
      ('canvas',           'public',      'canvas_items',      'is_archived'),
      ('research',         'research',    'rs_topic',          null),
      ('project',          'workspace',   'projects',          null),
      ('task',             'workspace',   'tasks',             null),
      ('workflow',         'workflow',    'definition',        null)
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
