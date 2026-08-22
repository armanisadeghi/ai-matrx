-- bare auth.uid() -> (select auth.uid()) : InitPlan sweep, batch 2 of 3 (remaining read/list paths)
--
-- THE BUG CLASS. A bare `auth.uid()` in a query is re-evaluated PER ROW
-- (current_setting + jsonb parse each time) and the planner will not treat it
-- as a constant, so it also refuses an index on the compared column. On a
-- SECURITY DEFINER helper that RLS calls per row, that is a whole-table scan
-- with iam.has_access firing for every row.
--
-- THE FIX. `(select auth.uid())` is an InitPlan: evaluated once per query,
-- then a constant the planner can index against. Identical rows, identical
-- security. Proven on public.get_cx_conversation_source_facets:
-- 2,869 ms -> 18 ms (migrations/cx_source_facets_initplan_uid.sql).
--
-- EQUIVALENCE. Every body below was produced mechanically from the LIVE
-- pg_get_functiondef by wrapping bare occurrences and nothing else. The
-- generator asserts the round trip: unwrapping only the occurrences it
-- inserted must reproduce the previous prosrc BYTE FOR BYTE. Occurrences
-- inside string literals, `--` comments, and plpgsql scalar assignments /
-- IF guards were deliberately left bare -- they are not per-row predicates,
-- and in iam.apply_rls / iam.verify_canonical the literal text IS the product.
-- SECURITY DEFINER/INVOKER, volatility, search_path and signatures are
-- carried through unchanged by construction (whole definition reused).
--
-- Idempotent: CREATE OR REPLACE, and re-running finds nothing left to wrap.
-- Campaign: docs/handoffs/access-kernel-scan-performance.md (ATTACHED CAMPAIGN).

-- 16 functions, 23 occurrences.

-- public._d31_impl_get_user_list_with_items(p_list_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public._d31_impl_get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
    v_is_editor boolean := false;
BEGIN
    SELECT (l.user_id = (select auth.uid())
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

-- public.dict_get_settings(p_level text, p_owner_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.dict_get_settings(p_level text, p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT public.dict_get_settings_for((select auth.uid()), p_level, p_owner_id);
$function$;

-- public.dict_list_entries(p_level text, p_owner_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.dict_list_entries(p_level text, p_owner_id uuid)
 RETURNS SETOF dictionary.dict_entries
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT * FROM public.dict_list_entries_for((select auth.uid()), p_level, p_owner_id);
$function$;

-- public.dict_list_owners() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.dict_list_owners()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT public.dict_list_owners_for((select auth.uid()));
$function$;

-- public.dict_resolve(p_include_user boolean, p_all boolean, p_organization_ids uuid[], p_scope_type_ids uuid[], p_scope_ids uuid[]) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.dict_resolve(p_include_user boolean DEFAULT true, p_all boolean DEFAULT false, p_organization_ids uuid[] DEFAULT '{}'::uuid[], p_scope_type_ids uuid[] DEFAULT '{}'::uuid[], p_scope_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT public.dict_resolve_for((select auth.uid()), p_include_user, p_all, p_organization_ids, p_scope_type_ids, p_scope_ids);
$function$;

-- public.game_room_by_code(p_code text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.game_room_by_code(p_code text)
 RETURNS TABLE(id uuid, host_user_id uuid, join_code text, status text, source_kind text, source_set_id uuid, source_title text, config jsonb, started_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.id, r.host_user_id, r.join_code, r.status, r.source_kind, r.source_set_id, r.source_title, r.config, r.started_at, r.created_at
  FROM education.game_room r
  WHERE upper(r.join_code) = upper(p_code) AND r.status IN ('lobby','active') AND r.deleted_at IS NULL AND (select auth.uid()) IS NOT NULL
  ORDER BY r.created_at DESC LIMIT 1;
$function$;

-- public.game_room_players(p_room_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.game_room_players(p_room_id uuid)
 RETURNS TABLE(created_by uuid, display_name text, score integer, correct_count integer, answered_count integer, best_streak integer, mastery_gain numeric, currency_earned integer, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT gr.created_by, gr.display_name, gr.score, gr.correct_count, gr.answered_count, gr.best_streak, gr.mastery_gain, gr.currency_earned, gr.created_at
  FROM education.game_result gr
  WHERE gr.room_id = p_room_id AND gr.deleted_at IS NULL
    AND (EXISTS (SELECT 1 FROM education.game_result me WHERE me.room_id = p_room_id AND me.created_by = (select auth.uid()) AND me.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM education.game_room rm WHERE rm.id = p_room_id AND rm.host_user_id = (select auth.uid())))
  ORDER BY gr.score DESC, gr.mastery_gain DESC;
$function$;

-- public.get_agent_core_batch(p_ids uuid[], p_sources text[]) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_agent_core_batch(p_ids uuid[], p_sources text[])
 RETURNS TABLE(id uuid, source text, name text, description text, tags text[], category text, is_archived boolean, is_favorite boolean, is_active boolean, output_format text, created_at timestamp with time zone, updated_at timestamp with time zone, version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prompt_ids uuid[];
  builtin_ids uuid[];
BEGIN
  SELECT array_agg(p_ids[i])
    INTO prompt_ids
    FROM generate_subscripts(p_ids, 1) AS i
    WHERE p_sources[i] = 'prompts';

  SELECT array_agg(p_ids[i])
    INTO builtin_ids
    FROM generate_subscripts(p_ids, 1) AS i
    WHERE p_sources[i] IN ('builtins', 'shared');

  IF prompt_ids IS NOT NULL THEN
    RETURN QUERY
    SELECT
      d.id,
      CASE WHEN d.created_by = (select auth.uid()) THEN 'prompts' ELSE 'shared' END::text,
      d.name::text,
      d.description,
      d.tags,
      d.category,
      d.is_archived,
      d.is_favorite,
      false AS is_active,
      NULL::text AS output_format,
      d.created_at,
      d.updated_at,
      d.version
    FROM agent.definition d
    WHERE d.id = ANY(prompt_ids)
      AND d.agent_type = 'user'
      AND (d.created_by = (select auth.uid()) OR has_permission('agent', d.id, 'viewer'));
  END IF;

  IF builtin_ids IS NOT NULL THEN
    RETURN QUERY
    SELECT
      d.id,
      'builtins'::text,
      d.name::text,
      d.description,
      d.tags,
      d.category,
      d.is_archived,
      d.is_favorite,
      d.is_active,
      NULL::text AS output_format,
      d.created_at,
      d.updated_at,
      d.version
    FROM agent.definition d
    WHERE d.id = ANY(builtin_ids) AND d.agent_type = 'builtin';
  END IF;
END;
$function$;

-- public.get_agent_operational(p_id uuid, p_source text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_agent_operational(p_id uuid, p_source text)
 RETURNS TABLE(id uuid, source text, variable_defaults jsonb, dynamic_model boolean, settings jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_source IN ('prompts', 'shared') THEN
    RETURN QUERY
    SELECT
      d.id,
      p_source::text,
      d.variable_definitions AS variable_defaults,
      NULL::boolean AS dynamic_model,
      d.settings
    FROM agent.definition d
    WHERE d.id = p_id
      AND d.agent_type = 'user'
      AND (d.created_by = (select auth.uid()) OR has_permission('agent', d.id, 'viewer'));
  ELSE
    RETURN QUERY
    SELECT
      d.id,
      'builtins'::text,
      d.variable_definitions AS variable_defaults,
      NULL::boolean AS dynamic_model,
      d.settings
    FROM agent.definition d
    WHERE d.id = p_id AND d.agent_type = 'builtin';
  END IF;
END;
$function$;

-- public.get_agents_for_chat(p_limit integer, p_cursor uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_agents_for_chat(p_limit integer DEFAULT 50, p_cursor uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT d.id, d.name::text, 'prompts'::text AS source
  FROM agent.definition d
  WHERE d.agent_type = 'user'
    AND d.created_by = (select auth.uid())
    AND NOT d.is_archived
    AND d.deleted_at IS NULL
    AND (p_cursor IS NULL OR d.id > p_cursor)
  ORDER BY d.id
  LIMIT p_limit;

  RETURN QUERY
  SELECT d.id, d.name::text, 'builtins'::text AS source
  FROM agent.definition d
  WHERE d.agent_type = 'builtin' AND d.is_active = true AND NOT d.is_archived
    AND d.deleted_at IS NULL
  ORDER BY d.name;
END;
$function$;

-- public.get_cx_conversations_shared_with_me() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_cx_conversations_shared_with_me()
 RETURNS TABLE(id uuid, title text, status text, message_count integer, created_at timestamp with time zone, updated_at timestamp with time zone, permission_level text, owner_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT c.id, c.title, c.status, c.message_count, c.created_at, c.updated_at,
    p.permission_level::text, u.email::text as owner_email
  FROM iam.permissions p
  JOIN chat.conversation c ON c.id = p.resource_id
  JOIN auth.users u ON u.id = c.created_by
  WHERE p.resource_type = 'cx_conversation' AND p.granted_to_user_id = (select auth.uid())
    AND c.deleted_at IS NULL AND c.status != 'archived'
  ORDER BY c.updated_at DESC;
END;
$function$;

-- public.get_user_hierarchy() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_user_hierarchy()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result jsonb; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'is_personal', o.is_personal, 'role', om.role::text,
        'project_count', (select count(*) from workspace.projects p where p.organization_id = o.id
          and exists (select 1 from iam.memberships pm where pm.container_type='project' and pm.container_id = p.id and pm.user_id = uid and pm.deleted_at is null))
      ) order by o.is_personal desc, o.name asc) from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = uid
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'organization_id', p.organization_id,
        'is_personal', coalesce(po.is_personal, false), 'role', pm.role::text,
        'topic_count', (select count(*) from platform.associations_live a
           join research.rs_topic rt on rt.id = a.source_id and rt.deleted_at is null
           where a.source_type='research_topic' and a.target_type='project' and a.target_id = p.id))
      order by p.name asc) from workspace.projects p join iam.memberships pm on pm.container_type='project' and pm.container_id = p.id and pm.user_id = uid and pm.deleted_at is null
        left join iam.organizations po on po.id = p.organization_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$function$;

-- public.get_user_tables() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_user_tables()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result JSONB;
BEGIN
    SELECT jsonb_agg(jsonb_build_object(
        'id', ut.id, 'table_name', ut.table_name, 'description', ut.description, 'version', ut.version,
        'user_id', ut.user_id, 'is_public', ut.is_public, 'row_ordering_config', ut.row_ordering_config,
        'visibility', ut.visibility::text,
        'organization_id', ut.organization_id,
        'created_at', ut.created_at, 'updated_at', ut.updated_at,
        'row_count', (SELECT COUNT(*) FROM workbench.udt_dataset_rows WHERE table_id = ut.id),
        'field_count', (SELECT COUNT(*) FROM workbench.udt_dataset_fields WHERE table_id = ut.id)
    ) ORDER BY ut.created_at DESC) INTO v_result
    FROM workbench.udt_datasets ut
    WHERE ut.user_id = (select auth.uid());
    RETURN jsonb_build_object('success', true, 'tables', COALESCE(v_result, '[]'::jsonb));
END;
$function$;

-- public.guardian_has_active_link(p_student_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.guardian_has_active_link(p_student_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from education.guardian_link
    where guardian_user_id = (select auth.uid()) and student_user_id = p_student_id and status = 'active'
  );
$function$;

-- public.guardian_list_links() — 5 occurrence(s)
CREATE OR REPLACE FUNCTION public.guardian_list_links()
 RETURNS TABLE(id uuid, guardian_user_id uuid, student_user_id uuid, status text, relationship text, requested_by text, created_at timestamp with time zone, reviewed_at timestamp with time zone, role text, counterpart_user_id uuid, counterpart_email text, counterpart_name text, verified_at timestamp with time zone, consent_method text, student_age_band text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'education', 'users', 'public', 'pg_temp'
AS $function$
  select
    l.id, l.guardian_user_id, l.student_user_id, l.status, l.relationship,
    l.requested_by, l.created_at, l.reviewed_at,
    case when l.guardian_user_id = (select auth.uid()) then 'guardian' else 'student' end as role,
    case when l.guardian_user_id = (select auth.uid()) then l.student_user_id else l.guardian_user_id end as counterpart_user_id,
    u.email::text as counterpart_email,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as counterpart_name,
    l.verified_at,
    l.consent_method,
    sp.age_band as student_age_band
  from education.guardian_link l
  join auth.users u
    on u.id = case when l.guardian_user_id = (select auth.uid()) then l.student_user_id else l.guardian_user_id end
  left join users.profiles sp
    on sp.id = l.student_user_id
  where (l.guardian_user_id = (select auth.uid()) or l.student_user_id = (select auth.uid()))
    and l.status <> 'revoked'
  order by l.status, l.created_at desc;
$function$;

-- public.league_leaderboard(p_week_start date) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.league_leaderboard(p_week_start date)
 RETURNS TABLE(created_by uuid, display_name text, mastery_gain numeric, games_played integer, is_me boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'education', 'pg_temp'
AS $function$
  WITH mine AS (
    SELECT lm.cohort_key
      FROM education.league_membership lm
     WHERE lm.created_by = (select auth.uid())
       AND lm.week_start = p_week_start
       AND lm.opted_in = true
       AND lm.deleted_at IS NULL
  )
  SELECT lm.created_by, lm.display_name, lm.mastery_gain, lm.games_played,
         lm.created_by = (select auth.uid()) AS is_me
    FROM education.league_membership lm
    JOIN mine ON mine.cohort_key = lm.cohort_key
   WHERE lm.week_start = p_week_start
     AND lm.opted_in = true
     AND lm.deleted_at IS NULL
   ORDER BY lm.mastery_gain DESC, lm.games_played DESC, lm.created_at
   LIMIT 30;
$function$;

