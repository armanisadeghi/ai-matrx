-- get_cx_conversation_source_facets — the chat sidebar's source-filter counts.
--
-- THE BUG CLASS (remember this shape): a bare `auth.uid()` inside a SQL
-- function's WHERE clause is re-evaluated PER ROW (current_setting + jsonb
-- parse each time), and because the planner does not treat it as a constant it
-- also refuses the created_by index. Result here: a seq scan over every
-- conversation row, with the RLS policy's iam.has_access arm firing for all
-- ~7,000 non-owned rows — 2,869 ms for a 144-row GROUP BY.
--
-- THE FIX: `(select auth.uid())` — an InitPlan, evaluated once. Same rows,
-- same security, 18 ms (measured live as the owner identity, 2026-08-22).
--
-- A live census the same day found ~270 functions whose source matches the
-- bare pattern (upper bound; plpgsql `v_uid := auth.uid()` assignments are
-- benign). The sweep is tracked as its own campaign — do not hand-fix
-- stragglers without measuring, and never change SECURITY DEFINER/INVOKER
-- while touching one.

CREATE OR REPLACE FUNCTION public.get_cx_conversation_source_facets()
 RETURNS TABLE(source_app text, source_feature text, n bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    c.source_app,
    c.source_feature,
    count(*)::bigint as n
  from chat.conversation c
  where c.created_by = (select auth.uid())
    and c.deleted_at is null
    and c.is_ephemeral = false
  group by c.source_app, c.source_feature
  order by count(*) desc;
$function$;
