-- chair-step: SHARE-OUT item 1's inverse — it DROPS six live client doors and takes the table-grant arm out of custom.portal_admits, so every outside person who was given a table loses their access to it in the same statement
--
-- It restores `custom.portal_admits`, `public.inv_for_me` and `public.inv_accept` byte for
-- byte as they stood before
-- `migrations/campaign/shareout_a_table_can_be_shared_outside_the_organization.sql`, drops
-- the six `custom.table_share_outside*` doors and their declarations, and leaves the
-- `custom/outside_invite_who` knob row in place (a knob nothing reads is inert; deleting a
-- row an override may hang off is not something an inverse should do).
--
-- IT DOES NOT DELETE ANYBODY'S DATA. The `iam.invitations` rows and the `iam.permissions`
-- grants stay exactly as they are — they simply stop admitting anyone at the organization
-- wall, which is the state the platform was in before this work.

drop function if exists custom.table_share_outside_for_me();
drop function if exists custom.table_share_outside_accept(text);
drop function if exists custom.table_share_outside_revoke(uuid, uuid);
drop function if exists custom.table_share_outside_resend(uuid, uuid);
drop function if exists custom.table_share_outside_invite(uuid, uuid, text, permission_level);
drop function if exists custom.table_share_outside(uuid, uuid);
drop function if exists custom.may_invite_outside(uuid, uuid);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name like 'table\_share\_outside%';

create or replace function custom.portal_admits(p_organization_id uuid, p_user_id uuid default null::uuid)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $fn$
#variable_conflict use_column
begin
  return (
  select coalesce(
           (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean,
           false)
     and exists (
           select 1
             from custom.portal_principal pp
             join custom.portal p on p.id = pp.portal_id and p.is_active
            where pp.organization_id = p_organization_id
              and pp.user_id = coalesce(p_user_id, (select auth.uid()))
              and pp.user_id is not null
              and pp.is_active)
  );
end
$fn$;

create or replace function public.inv_for_me()
returns table(id uuid, organization_id uuid, target_type text, target_id uuid, email text,
              role text, status text, token text, expires_at timestamptz,
              created_at timestamptz, created_by uuid)
language sql
stable security definer
set search_path to 'public'
as $fn$
  select i.id, i.organization_id, i.target_type, i.target_id, i.email, i.role, i.status,
         i.token, i.expires_at, i.created_at, i.created_by
    from iam.invitations i
   where i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = (select auth.uid())
          or lower(i.email) = lower((select u.email from auth.users u where u.id = (select auth.uid()))))
   order by i.created_at desc;
$fn$;

create or replace function public.inv_accept(p_token text, p_hr_half_handled boolean default false)
returns table(target_type text, target_id uuid, organization_id uuid, role text)
language plpgsql
security definer
set search_path to 'public', 'iam', 'auth'
as $fn$
declare v_inv iam.invitations; v_uid uuid := (select auth.uid()); v_email text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_uid or lower(i.email) = lower(v_email));
  if v_inv.id is null then raise exception 'invalid or expired invitation'; end if;

  if (v_inv.metadata ? 'hr_employee_id') and not coalesce(p_hr_half_handled, false) then
    raise exception 'this invitation links an employee record; accept it through hr_invite_accept, which also binds the login'
      using errcode = '22023';
  end if;

  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, updated_by)
  values (v_inv.organization_id, v_inv.target_type, v_inv.target_id, v_uid, coalesce(v_inv.role, 'member'), 'active', v_uid, v_uid)
  on conflict (container_type, container_id, user_id)
  do update set status = 'active', deleted_at = null, updated_by = v_uid;

  update iam.invitations
     set status = 'accepted', accepted_at = now(), invited_user_id = v_uid, updated_by = v_uid
   where id = v_inv.id;

  return query select v_inv.target_type, v_inv.target_id, v_inv.organization_id, v_inv.role;
end $fn$;
