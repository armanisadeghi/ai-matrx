-- chair-step: inverse of rca5d_k_tool_catalog_lists_only_tools_you_may_open — puts back the doors it closed (they name records the caller may not open again).
-- based-on: public.get_tools_list(boolean) fb20835fb39883c24f0df6f718197ba2e4d4a968db0f688c8c98b7c8343227fe

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
    ORDER BY d.name;
$function$;
