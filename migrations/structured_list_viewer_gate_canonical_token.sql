-- get_user_list_with_items: the viewer gate asked has_permission() for the wrong
-- resource type, so a shared list was a door to a 404.
--
-- The function pair disagreed with ITSELF:
--   get_user_list_with_items        -> has_permission('udt_structured_lists', …)  -- table name
--   _d31_impl_get_user_list_with_items -> has_permission('structured_list',   …)  -- canonical token
--
-- `has_permission` takes a free-text resource type and delegates to
-- has_permission_for, so an unregistered string does not error — it simply
-- never matches. The canonical token is `structured_list`:
--
--   platform.shareable_resource_registry
--     -> resource_type='structured_list', schema=workbench,
--        table=udt_structured_lists, is_active=true, url='/lists/{id}'
--
-- and every live row in iam.permissions uses canonical tokens (agent, note,
-- task, file, …) — never a table name.
--
-- Effect before this fix: a list shared by permission passed the table's RLS
-- SELECT policy (which correctly checks has_permission('structured_list', …)),
-- so it APPEARED in the switcher and every list read — but opening /lists/<id>
-- raised 42501, which the route turns into notFound(). Listed, named, and
-- unreachable: the exact dead end the no-dead-ends campaign exists to remove,
-- and an over-tightening defect under the security philosophy (a legitimate
-- user blocked from data that was deliberately shared with them).
--
-- Blast radius today is zero: `select resource_type, count(*) from
-- iam.permissions where resource_type ilike '%structured_list%'` returns no
-- rows, so nothing currently depends on either spelling. Fixing it while it is
-- latent is the cheap moment.
--
-- No new check, no new layer — the same tier, asked the correct question.
-- Body is otherwise byte-identical to the live definition.

CREATE OR REPLACE FUNCTION public.get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id
        and (l.is_public or l.public_read or l.user_id = auth.uid())
    )
    or coalesce(public.has_permission('structured_list', p_list_id, 'viewer'), false)
  ) is not true then
    raise exception 'viewer access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_list_with_items(p_list_id);
end;
$function$;
