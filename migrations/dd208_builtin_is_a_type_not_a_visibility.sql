-- DD-208 — A DOOR IS NEVER WIDER THAN ITS TABLE: `agent_type = 'builtin'` is a
-- TYPE, not a visibility.
--
-- ═══ THE FACT ════════════════════════════════════════════════════════════════
-- Four SECURITY DEFINER doors granted to `authenticated` read `agent.definition`
-- with `agent_type = 'builtin'` as their ONLY test and hand the row back. Because
-- they are DEFINER, RLS never runs, so the doors' population is "every builtin
-- row in the database" while the table's own `std_select` policy admits a builtin
-- row to a stranger through exactly one clause:
--
--     organization_id IS NOT NULL
--     AND visibility >= 'internal'::platform.visibility
--     AND organization_id IN (SELECT so.organization_id
--                               FROM iam.system_orgs so WHERE so.global_readable)
--
-- Measured live 2026-09-13 on db.matrxserver.com: 422 active, non-deleted
-- builtins, ALL of them in the one global-readable system organization
-- "Matrx System" (39c38960-d30c-4840-b0c1-c9960de95582). 421 are `internal` and
-- the table already shows them to every signed-in caller — the doors were adding
-- nothing there. The 422nd is `visibility = 'personal'`: agent
-- 0315e53f-54ab-40fe-aa66-0dc003badce3, "Content Plan Writer (E2E test)",
-- created_by admin@admin.com. RLS hides it. The doors handed it to
-- test@test.com and to a caller who belongs to no organization at all, proven by
-- hand in rolled-back transactions as `role authenticated` with each caller's
-- real JWT claims, and by `pnpm check:door-rows --population=signed-in`.
--
-- ═══ THE DECISION ════════════════════════════════════════════════════════════
-- The extra reach is NOT a product need. The platform's shared agents are the
-- ones in the global-readable system organization at `internal` or above, and the
-- table already grants exactly those. A `personal` agent that happens to carry
-- `agent_type = 'builtin'` is one person's private row. So the DOORS narrow; the
-- table's policy of record is untouched and stays the single statement of who may
-- read an agent.
--
-- ═══ THE FIX ═════════════════════════════════════════════════════════════════
-- Every builtin arm gets the same predicate, which is two disjuncts of the
-- table's own `std_select`, nothing invented:
--
--     (created_by = (select auth.uid())          -- your own row, always
--      OR (organization_id IS NOT NULL
--          AND visibility >= 'internal'::platform.visibility
--          AND organization_id IN (SELECT so.organization_id
--                                    FROM iam.system_orgs so
--                                   WHERE so.global_readable)))
--
-- Nothing a caller may read is lost (the own-row disjunct is why), and nothing a
-- caller may not read survives. Set-based, so no per-row function call is added
-- to a 422-row list read.
--
-- Census of the class, over every function in the database whose body matches
-- `agent_type ... builtin` (2026-09-13): these four and no others. The prompt/
-- user arms of `get_agent_core_batch` and `get_agent_operational` were ALREADY
-- bounded (`created_by = auth.uid() OR has_permission(...)`) — only their builtin
-- arms were open, which is the whole point: somebody read "builtin" as "public".

CREATE OR REPLACE FUNCTION public.agx_get_list_full()
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, created_by uuid, organization_id uuid, task_id uuid, source_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, shared_by_email text, orchestra jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT * FROM agx_get_list();
  -- Builtins get the badge too: a system agent can be a conductor, and a badge
  -- that appeared on your own agents but not on the platform's would be a lie
  -- about the platform's, not a saving.
  RETURN QUERY SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags, a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at, false, 'system'::text, NULL::text, o.orchestra
  FROM agent.definition a
  LEFT JOIN agx_orchestra_badges() o ON o.agent_id = a.id
  WHERE a.agent_type = 'builtin' AND a.is_active = true AND a.deleted_at IS NULL
    -- 🚨 DD-208: a door is never wider than its table. `builtin` is a TYPE, not a
    -- visibility. These two disjuncts are agent.definition's own std_select.
    AND (
      a.created_by = (select auth.uid())
      OR (a.organization_id IS NOT NULL
          AND a.visibility >= 'internal'::platform.visibility
          AND a.organization_id IN (SELECT so.organization_id
                                      FROM iam.system_orgs so WHERE so.global_readable))
    );
END;
$function$;

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
    -- 🚨 DD-208: agent.definition's own std_select, not a wider door.
    AND (
      d.created_by = (select auth.uid())
      OR (d.organization_id IS NOT NULL
          AND d.visibility >= 'internal'::platform.visibility
          AND d.organization_id IN (SELECT so.organization_id
                                      FROM iam.system_orgs so WHERE so.global_readable))
    )
  ORDER BY d.name;
END;
$function$;

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
    WHERE d.id = p_id AND d.agent_type = 'builtin'
      -- 🚨 DD-208: agent.definition's own std_select, not a wider door. This door
      -- returns the agent's SETTINGS and variable definitions, so the leak here
      -- is the private agent's configuration, not just its name.
      AND (
        d.created_by = (select auth.uid())
        OR (d.organization_id IS NOT NULL
            AND d.visibility >= 'internal'::platform.visibility
            AND d.organization_id IN (SELECT so.organization_id
                                        FROM iam.system_orgs so WHERE so.global_readable))
      );
  END IF;
END;
$function$;

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
    WHERE d.id = ANY(builtin_ids) AND d.agent_type = 'builtin'
      -- 🚨 DD-208: agent.definition's own std_select, not a wider door.
      AND (
        d.created_by = (select auth.uid())
        OR (d.organization_id IS NOT NULL
            AND d.visibility >= 'internal'::platform.visibility
            AND d.organization_id IN (SELECT so.organization_id
                                        FROM iam.system_orgs so WHERE so.global_readable))
      );
  END IF;
END;
$function$;
