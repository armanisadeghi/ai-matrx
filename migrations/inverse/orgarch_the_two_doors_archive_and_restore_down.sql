-- The inverse of migrations/campaign/orgarch_the_two_doors_archive_and_restore.sql: the four new
-- functions go away and public.get_user_organizations() goes back to the bytes it had before the
-- lane (which do not mention the archive at all).

-- A DOOR FOLLOWS ITS FUNCTION: the declarations go with the functions they describe. The row for
-- public.get_user_organizations stays, because the function itself stays (replaced, not dropped)
-- and a SECURITY DEFINER function without a declaration is refused at COMMIT.
delete from platform.client_callable_door
 where (schema_name, function_name) in (
   ('iam', 'organization_archive'), ('iam', 'organization_restore'),
   ('iam', 'organization_archive_state'), ('public', 'list_user_organizations'));

drop function if exists iam.organization_archive(uuid, text, text);
drop function if exists iam.organization_restore(uuid, text);
drop function if exists iam.organization_archive_state(uuid);
drop function if exists public.list_user_organizations(uuid, text);

create or replace function public.get_user_organizations(user_id uuid)
returns table (id uuid, name text, slug text, role org_role, is_personal boolean)
language plpgsql
security definer
as $function$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    m.role,
    o.is_personal
  FROM
    iam.organizations o
    JOIN iam.organization_member m ON o.id = m.organization_id
  WHERE
    m.user_id = $1
  ORDER BY
    o.is_personal DESC,
    o.name ASC;
END;
$function$;

