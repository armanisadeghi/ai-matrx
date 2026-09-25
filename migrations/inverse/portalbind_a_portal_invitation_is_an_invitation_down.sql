-- INVERSE of migrations/campaign/portalbind_a_portal_invitation_is_an_invitation.sql.
--
-- It restores the four replaced bodies character for character — portal_invite writing only a
-- custom.portal_principal row, portal_revoke leaving the invitation standing, and inv_for_me /
-- inv_accept each with their own hand-written `<> 'custom_table'` arm — and drops the four new
-- functions, the four door rows, the notification event row and the route-manifest row. With
-- this applied there is no portal accept door at all, which is what the red twin measures.
--
-- chair-step: it replaces four live client-door bodies.

set lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.portal_invite(p_organization_id uuid, p_portal_id uuid, p_client_record_id uuid, p_email text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_p    custom.portal;
  v_pp   custom.portal_principal;
  v_id   uuid;
  v_mail text := lower(btrim(coalesce(p_email, '')));
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_invite');
  perform custom.assert_store_door(p_organization_id, 'custom.portal_invite');

  select * into v_p from custom.portal where id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal in this organization.' using errcode = '02000';
  end if;
  if not v_p.is_active then
    raise exception 'That portal is closed, so nobody new can be invited into it.'
      using errcode = '42501', hint = 'Re-open it with custom.portal_declare before inviting anyone.';
  end if;
  if position('@' in v_mail) < 2 then
    raise exception 'An invitation needs an email address to send the sign-in link to.'
      using errcode = '22004';
  end if;

  -- The same rung the portal was declared at. Letting one more outsider in is the same
  -- kind of act as letting the first one in.
  perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
            'custom.portal_invite', 'admin'::public.permission_level, 'table');

  -- THE CLIENT RECORD IS THE WHOLE OF "ONLY THEIRS", so it has to be one, and it has to
  -- be in the portal's own client Table. A principal pointed at the wrong Table would
  -- carry whatever THAT record carries, which is the leak this check exists to stop.
  if not exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id
                    and r.id = p_client_record_id
                    and r.table_id = v_p.client_table_id
                    and r.deleted_at is null) then
    raise exception 'That record is not one of this portal''s clients, so nobody can be invited as it.'
      using errcode = '02000',
            hint = 'A portal principal IS a record of the portal''s client Table. Pick the client''s own row.';
  end if;

  select * into v_pp from custom.portal_principal
   where portal_id = v_p.id and lower(email) = v_mail and is_active;
  if found then
    v_id := v_pp.id;
    update custom.portal_principal
       set client_record_id = p_client_record_id,
           user_id = coalesce(p_user_id, user_id)
     where id = v_id;
  else
    insert into custom.portal_principal (portal_id, organization_id, client_record_id, email,
                                         user_id, invited_by)
    values (v_p.id, p_organization_id, p_client_record_id, v_mail, p_user_id, custom.query_principal())
    returning id into v_id;
  end if;

  if p_user_id is not null then
    perform custom.portal_principal_bind(p_organization_id, v_id, p_user_id);
  end if;

  select * into v_pp from custom.portal_principal where id = v_id;
  return jsonb_build_object(
    'invited', true,
    'principal_id', v_id,
    'portal_id', v_p.id,
    'slug', v_p.slug,
    'email', v_mail,
    'client_record_id', p_client_record_id,
    'client', coalesce(custom.portal_record_title(p_organization_id, p_client_record_id), p_client_record_id::text),
    'bound', v_pp.user_id is not null,
    'say', case when v_pp.user_id is not null
                then format('%s can sign in to "%s" and will see their own records and nothing else.', v_mail, v_p.title)
                else format('%s is invited to "%s". They get access the moment they follow the sign-in link and the platform gives them an identity - until then this row holds nothing.', v_mail, v_p.title) end);
end $function$

;

CREATE OR REPLACE FUNCTION custom.portal_revoke(p_organization_id uuid, p_portal_id uuid, p_principal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pp custom.portal_principal;
  v_p  custom.portal;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_revoke');
  perform custom.assert_store_door(p_organization_id, 'custom.portal_revoke');

  select * into v_pp from custom.portal_principal
   where id = p_principal_id and portal_id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such person in this portal.' using errcode = '02000';
  end if;
  select * into v_p from custom.portal where id = p_portal_id;
  perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
            'custom.portal_revoke', 'admin'::public.permission_level, 'table');

  update custom.portal_principal
     set is_active = false, revoked_at = now()
   where id = v_pp.id;

  -- REVOKING TAKES THE GRANT AWAY, not just the row. A row that said "revoked" beside a
  -- grant that still read is the exact shape W2-TRUST's clause 8 was written about: a
  -- screen showing access as gone while the read path still answers.
  if v_pp.user_id is not null then
    perform custom.share_revoke(p_organization_id, v_pp.client_record_id, 'person', v_pp.user_id);
  end if;

  return jsonb_build_object(
    'revoked', true,
    'principal_id', v_pp.id,
    'email', v_pp.email,
    'say', format('%s can no longer sign in to "%s", and the records that named their client no longer reach them.',
                  v_pp.email, v_p.title));
end $function$

;

CREATE OR REPLACE FUNCTION public.inv_for_me()
 RETURNS TABLE(id uuid, organization_id uuid, target_type text, target_id uuid, email text, role text, status text, token text, expires_at timestamp with time zone, created_at timestamp with time zone, created_by uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.id, i.organization_id, i.target_type, i.target_id, i.email, i.role, i.status,
         i.token, i.expires_at, i.created_at, i.created_by
    from iam.invitations i
   where i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     -- 🚨 A TABLE SHARE IS NOT A MEMBERSHIP (SHARE-OUT, 2026-09-21). `inv_accept` turns
     -- whatever this returns into an `iam.memberships` row whose `container_type` is the
     -- invitation's `target_type`, so a `custom_table` invitation offered here would have
     -- turned "see this one table" into a membership of a container that is not one. Its
     -- own door is `custom.table_share_outside_accept`, and `custom.table_share_outside_for_me`
     -- is where it is listed.
     and i.target_type <> 'custom_table'
     and (i.invited_user_id = (select auth.uid())
          or lower(i.email) = lower((select u.email from auth.users u where u.id = (select auth.uid()))))
   order by i.created_at desc;
$function$

;

CREATE OR REPLACE FUNCTION public.inv_accept(p_token text, p_hr_half_handled boolean DEFAULT false)
 RETURNS TABLE(target_type text, target_id uuid, organization_id uuid, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'iam', 'auth'
AS $function$
declare v_inv iam.invitations; v_uid uuid := (select auth.uid()); v_email text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_uid or lower(i.email) = lower(v_email));
  if v_inv.id is null then raise exception 'invalid or expired invitation'; end if;

  -- 🚨 A TABLE SHARE HAS ITS OWN DOOR (SHARE-OUT, 2026-09-21). Accepting one here would
  -- insert a membership whose container is a Table, which is not a container — turning
  -- "see this one table" into a row in the organization's own membership table. It is
  -- refused by name, with the door that does accept it, rather than silently widened.
  if v_inv.target_type = 'custom_table' then
    raise exception 'this invitation shares one table, not a place in the organization; accept it through custom.table_share_outside_accept, which writes the table grant and nothing else'
      using errcode = '22023';
  end if;

  -- 🚨 SEE THE HEADER. An HR-tied invitation accepted here would strand the person.
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
end $function$

;

delete from platform.client_callable_door
 where (schema_name = 'public' and function_name = 'portal_share_peek')
    or (schema_name = 'custom' and function_name in ('portal_invite_accept', '_portal_invite_payload', '_portal_invite_deliver'));
drop function if exists public.portal_share_peek(text);
drop function if exists custom.portal_invite_accept(text);
drop function if exists custom._portal_invite_deliver(uuid);
drop function if exists custom._portal_invite_payload(uuid);
drop function if exists iam.invitation_has_its_own_door(text);
delete from platform.route_manifest
 where app = 'matrx-frontend' and pattern = '/invitations/portal/accept/[token]';
update communication.notification_event_type
   set deleted_at = now()
 where event_key = 'share.portal_invited' and deleted_at is null;
