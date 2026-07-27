-- agx_list_scope_counts now returns the LABEL of each narrowing option.
--
-- The scope tab bar needs the NAME of each org (later: industry) it can narrow
-- to, not just a count. It used to read names from the organizations Redux
-- slice — which is hydrated by `fetchFullContext`, a thunk that only runs on
-- tasks / org-settings surfaces. On /agents/all that slice was empty, so the
-- "My Orgs" dropdown silently never rendered at all, for anyone.
--
-- Returning label + count from ONE query makes the tab bar self-sufficient:
-- no hydration ordering to get wrong, and every future list surface inherits
-- the fix instead of re-discovering the bug.
--
-- `scope_counts.org_id` is renamed `narrow_id` because the same column will
-- carry an industry id once a feature wires the Industry scope.

DROP FUNCTION IF EXISTS public.agx_list_scope_counts(text, boolean, text, jsonb);

CREATE OR REPLACE FUNCTION public.agx_list_scope_counts(
  p_search   text    DEFAULT NULL,
  p_deep     boolean DEFAULT false,
  p_archived text    DEFAULT 'active',
  p_filters  jsonb   DEFAULT '{}'::jsonb
)
RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.agx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1, 0) r;
  END LOOP;

  -- One row per non-personal org the caller belongs to, WITH its name.
  -- Personal orgs are excluded: their content IS "Mine", and surfacing it
  -- again under My Orgs would double-count the same rows in two tabs.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = auth.uid()
  LEFT JOIN LATERAL public.agx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.agx_list_scope_counts(text,boolean,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.agx_list_scope_counts(text,boolean,text,jsonb) TO authenticated;
