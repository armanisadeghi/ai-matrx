-- chair-step: the inverse of hubfix_an_archived_organizations_shares_go_with_it.sql. It puts back the two door bodies without the archived-organization condition, so shares from archived organizations are listed again. Nothing is written or dropped.
-- lane: HUB-FIX
create or replace function custom.table_share_outside_for_me()
 returns table(invitation_id uuid, organization_id uuid, organization text, table_id uuid, table_name text, level text, level_label text, token text, expires_at timestamp with time zone, say text)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me   uuid := custom.query_principal();
  v_mail text;
begin
  if v_me is null then return; end if;
  select lower(u.email) into v_mail from auth.users u where u.id = v_me;

  return query
    select i.id, i.organization_id, o.name,
           i.target_id,
           -- The Table's NAME travels in the invitation's own metadata, stamped when it
           -- was made. Reading `custom.record` here would be a read of an organization
           -- this person is not in yet, through a door that is not the ladder.
           coalesce(nullif(i.metadata ->> 'table_name', ''), 'a table'),
           coalesce(nullif(i.metadata ->> 'level', ''), 'viewer'),
           iam.level_label('table', coalesce(nullif(i.metadata ->> 'level', ''), 'viewer')::public.permission_level),
           i.token, i.expires_at,
           format('%s shared %s with you as a %s. Open it and it is yours to see; nothing else of theirs is.',
                  coalesce(o.name, 'An organization'),
                  coalesce(nullif(i.metadata ->> 'table_name', ''), 'a table'),
                  coalesce(nullif(i.metadata ->> 'level', ''), 'viewer'))
      from iam.invitations i
      left join iam.organizations o on o.id = i.organization_id
     where i.target_type = 'custom_table'
       and i.deleted_at is null
       and i.status = 'pending'
       and (i.expires_at is null or i.expires_at > now())
       and (i.invited_user_id = v_me or lower(i.email) = v_mail)
     order by i.created_at desc;
end;
$function$;

create or replace function custom.tables_shared_with_me()
returns table(table_id uuid, organization_id uuid, organization text, table_name text,
              level text, level_label text, shared_at timestamptz, opens boolean, say text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me uuid := custom.query_principal();
begin
  if v_me is null then return; end if;

  return query
    select t.id,
           t.organization_id,
           coalesce(o.name, 'An organization'),
           coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
           g.permission_level::text,
           iam.level_label('table', g.permission_level),
           g.created_at,
           custom.portal_admits(t.organization_id, v_me),
           case
             when custom.portal_admits(t.organization_id, v_me)
               then format('%s shared %s with you. You can open it as a %s; nothing else of theirs is yours to see.',
                           coalesce(o.name, 'An organization'),
                           coalesce(nullif(t.data ->> 'name', ''), 'a table'),
                           g.permission_level::text)
             else format('%s shared %s with you, and has since closed its door to people outside it, so it will not open right now. Ask them to open it again.',
                         coalesce(o.name, 'An organization'),
                         coalesce(nullif(t.data ->> 'name', ''), 'a table'))
           end
      from iam.permissions g
      join custom.record t
        on t.id = g.resource_id
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null
      left join iam.organizations o on o.id = t.organization_id
     where g.resource_type = 'record'
       and g.granted_to_user_id = v_me
       and g.status = 'active'
       and (g.expires_at is null or g.expires_at > now())
       and not exists (
         select 1 from iam.organization_member m
          where m.organization_id = t.organization_id
            and m.user_id = v_me)
     order by g.created_at desc;
end;
$fn$;

