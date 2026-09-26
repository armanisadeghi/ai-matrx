-- RC-A5d census, batch 6 (catalogs) — THE TOOL CATALOG LISTS ONLY TOOLS THE CALLER MAY OPEN.
-- Register row RC-A5d. Census: aidream db/tests/test_definer_doors_ask_each_record.py (backlog).
--
-- THE DEFECT (measured on production 2026-09-26 as test@test.com, rolled back): public.get_tools_list returned
-- every row of tool.definition (certified) — 696 to test@test.com, 3 of them INTERNAL tools of organizations she
-- is not in (their names, descriptions, categories, tags).
--
-- THE FIX: a public tool is listed to anyone (the public lane the kernel itself grants); any other tool only
-- when iam.has_access('tool', id, viewer) says so — the kernel is asked only for the non-public rows.
-- Inverse: migrations/inverse/rca5d_k_tool_catalog_lists_only_tools_you_may_open_down.sql.
-- based-on: public.get_tools_list(boolean) 1d06fc49e3e04b2eed453465566852baac800c3a167e99d917b59d363cdabe7d

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.get_tools_list(p_active_only boolean DEFAULT true)
 RETURNS TABLE(id uuid, name text, description text, category text, tags text[], is_active boolean, source_kind text, tool_group text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT d.id, d.name, d.description, d.category, d.tags, d.is_active,
           d.source_kind, d.tool_group
    FROM tool.definition d
    WHERE (NOT p_active_only OR d.is_active = true)
      -- rca5d_k: a tool the caller may not open is not listed (public ones need no question)
      AND (d.visibility = 'public'::platform.visibility
           OR iam.has_access('tool', d.id, 'viewer'::public.permission_level))
    ORDER BY d.name;
$function$;
