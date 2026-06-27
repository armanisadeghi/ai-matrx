-- inv_public_rpcs.sql
-- Applied during the canonical-model cutover (via Supabase MCP apply_migration).
--
-- The frontend data path to iam.invitations (invite a user to a target:
-- project / org / etc). `authenticated` has NO direct grant on iam.invitations,
-- so all client reads/writes go through these PUBLIC SECURITY-DEFINER RPCs,
-- org-gated via iam.has_org_access (except token/self lookups, which are gated
-- by the caller's own email/uid). Consumed exclusively by
-- features/organizations/service/invitationsService.ts. Idempotent.

-- READ: invitations for a target (org-gated — for the target's admin view).
create or replace function public.inv_list(p_target_type text, p_target_id uuid)
returns table(id uuid, organization_id uuid, target_type text, target_id uuid, email text,
              invited_user_id uuid, role text, status text, token text,
              expires_at timestamptz, accepted_at timestamptz,
              created_at timestamptz, created_by uuid)
language sql stable security definer set search_path to 'public' as $fn$
  select i.id, i.organization_id, i.target_type, i.target_id, i.email, i.invited_user_id,
         i.role, i.status, i.token, i.expires_at, i.accepted_at, i.created_at, i.created_by
    from iam.invitations i
   where i.target_type = p_target_type and i.target_id = p_target_id
     and i.deleted_at is null and iam.has_org_access(i.organization_id)
   order by i.created_at desc;
$fn$;

-- READ: a single invitation by token — gated to the invited party (email/uid),
-- so the accept page can load it before the caller is a member of anything.
create or replace function public.inv_get_by_token(p_token text)
returns table(id uuid, organization_id uuid, target_type text, target_id uuid, email text,
              invited_user_id uuid, role text, status text,
              expires_at timestamptz, accepted_at timestamptz, created_at timestamptz, created_by uuid)
language sql stable security definer set search_path to 'public' as $fn$
  select i.id, i.organization_id, i.target_type, i.target_id, i.email, i.invited_user_id,
         i.role, i.status, i.expires_at, i.accepted_at, i.created_at, i.created_by
    from iam.invitations i
   where i.token = p_token and i.deleted_at is null
     and (i.invited_user_id = auth.uid()
          or lower(i.email) = lower((select u.email from auth.users u where u.id = auth.uid())));
$fn$;

-- READ: invitations addressed to the current user (pending, unexpired).
create or replace function public.inv_for_me()
returns table(id uuid, organization_id uuid, target_type text, target_id uuid, email text,
              role text, status text, token text, expires_at timestamptz,
              created_at timestamptz, created_by uuid)
language sql stable security definer set search_path to 'public' as $fn$
  select i.id, i.organization_id, i.target_type, i.target_id, i.email, i.role, i.status,
         i.token, i.expires_at, i.created_at, i.created_by
    from iam.invitations i
   where i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = auth.uid()
          or lower(i.email) = lower((select u.email from auth.users u where u.id = auth.uid())))
   order by i.created_at desc;
$fn$;

-- WRITE: create (or refresh) an invitation. Org resolved from target when null;
-- caller must have org access. Idempotent per (target, email) pending invite.
create or replace function public.inv_create(
  p_target_type text, p_target_id uuid, p_email text, p_role text default 'member',
  p_org_id uuid default null, p_invited_user_id uuid default null,
  p_expires_at timestamptz default (now() + interval '7 days')
) returns iam.invitations
language plpgsql security definer set search_path to 'public' as $fn$
declare v_org uuid := p_org_id; v_row iam.invitations;
begin
  if v_org is null then
    if p_target_type = 'project' then select organization_id into v_org from workspace.projects where id = p_target_id; end if;
  end if;
  if v_org is null or not iam.has_org_access(v_org) then
    raise exception 'inv_create: no org access (org=%, %/%)', v_org, p_target_type, p_target_id
      using errcode = '42501';
  end if;
  -- Refresh an existing pending invite for the same target+email rather than duplicate.
  update iam.invitations
     set role = coalesce(p_role, role), expires_at = p_expires_at,
         token = (gen_random_uuid())::text, status = 'pending',
         invited_user_id = coalesce(p_invited_user_id, invited_user_id), updated_by = auth.uid()
   where target_type = p_target_type and target_id = p_target_id
     and lower(email) = lower(p_email) and status = 'pending' and deleted_at is null
   returning * into v_row;
  if v_row.id is not null then return v_row; end if;

  insert into iam.invitations (organization_id, target_type, target_id, email, invited_user_id,
                               role, status, expires_at, created_by, updated_by)
  values (v_org, p_target_type, p_target_id, lower(p_email), p_invited_user_id,
          coalesce(p_role, 'member'), 'pending', p_expires_at, auth.uid(), auth.uid())
  returning * into v_row;
  return v_row;
end $fn$;

-- WRITE: accept an invitation by token — creates the membership and marks accepted.
-- Atomic: invite -> membership in one call. Returns the target ids.
create or replace function public.inv_accept(p_token text)
returns table(target_type text, target_id uuid, organization_id uuid, role text)
language plpgsql security definer set search_path to 'public' as $fn$
declare v_inv iam.invitations; v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_uid or lower(i.email) = lower(v_email));
  if v_inv.id is null then raise exception 'invalid or expired invitation'; end if;

  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, updated_by)
  values (v_inv.organization_id, v_inv.target_type, v_inv.target_id, v_uid, coalesce(v_inv.role, 'member'), 'active', v_uid, v_uid)
  on conflict (container_type, container_id, user_id)
  do update set status = 'active', deleted_at = null, updated_by = v_uid;

  update iam.invitations
     set status = 'accepted', accepted_at = now(), invited_user_id = v_uid, updated_by = v_uid
   where id = v_inv.id;

  return query select v_inv.target_type, v_inv.target_id, v_inv.organization_id, v_inv.role;
end $fn$;

-- WRITE: revoke an invitation (soft delete; org-checked).
create or replace function public.inv_revoke(p_invitation_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  update iam.invitations
     set status = 'revoked', deleted_at = now(), updated_by = auth.uid()
   where id = p_invitation_id and deleted_at is null and iam.has_org_access(organization_id);
end $fn$;

-- WRITE: resend — regenerate token + extend expiry; returns the fresh token so the
-- caller (server email sender) can build the link. Org-checked.
create or replace function public.inv_resend(
  p_invitation_id uuid, p_expires_at timestamptz default (now() + interval '7 days')
) returns text
language plpgsql security definer set search_path to 'public' as $fn$
declare v_token text;
begin
  update iam.invitations
     set token = (gen_random_uuid())::text, expires_at = p_expires_at,
         status = 'pending', updated_by = auth.uid()
   where id = p_invitation_id and deleted_at is null and iam.has_org_access(organization_id)
   returning token into v_token;
  return v_token;
end $fn$;

revoke all on function public.inv_list(text,uuid) from public;
revoke all on function public.inv_get_by_token(text) from public;
revoke all on function public.inv_for_me() from public;
revoke all on function public.inv_create(text,uuid,text,text,uuid,uuid,timestamptz) from public;
revoke all on function public.inv_accept(text) from public;
revoke all on function public.inv_revoke(uuid) from public;
revoke all on function public.inv_resend(uuid,timestamptz) from public;
grant execute on function public.inv_list(text,uuid) to authenticated;
grant execute on function public.inv_get_by_token(text) to authenticated;
grant execute on function public.inv_for_me() to authenticated;
grant execute on function public.inv_create(text,uuid,text,text,uuid,uuid,timestamptz) to authenticated;
grant execute on function public.inv_accept(text) to authenticated;
grant execute on function public.inv_revoke(uuid) to authenticated;
grant execute on function public.inv_resend(uuid,timestamptz) to authenticated;
