-- admin_list_audit: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated SECURITY DEFINER RPC whose ORDER BY is not a TOTAL order. Each
-- LIMIT/OFFSET page is a separate query execution and Postgres uses a bounded
-- top-N sort, so tied rows are ordered arbitrarily and differently on each page
-- — rows get duplicated onto one page and silently skipped from another. On
-- agx_get_list, paging a 365-row result 100 at a time returned only 306
-- DISTINCT ids.
--
-- An audit log is exactly where this bites: bulk writes share a created_at.
--
-- FIX: append `l.id` as a final tiebreaker so the sort key is unique per row.
-- The tiebreaker is load-bearing. Do not remove it.

CREATE OR REPLACE FUNCTION public.admin_list_audit(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, actor_user_id uuid, actor_email text, action text, target_user_id uuid, target_email text, before jsonb, after jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      l.id,
      l.actor_user_id,
      au.email::text AS actor_email,
      l.action,
      l.target_user_id,
      tu.email::text AS target_email,
      l.before,
      l.after,
      l.created_at
    FROM admin.admin_audit_log l
    LEFT JOIN auth.users au ON au.id = l.actor_user_id
    LEFT JOIN auth.users tu ON tu.id = l.target_user_id
    -- `l.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT p_limit OFFSET p_offset;
END;
$function$;
