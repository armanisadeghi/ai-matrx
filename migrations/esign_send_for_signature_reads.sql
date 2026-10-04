-- SEND FOR SIGNATURE — the three reads aidream's `/esign/envelopes` asks before it sends.
--
-- `esign_create_envelope` / `esign_send_envelope` carry no rights check of their own (they are
-- server-only; being unreachable from a client IS their gate). aidream runs these reads under the
-- caller's identity (`rls_session` with the caller's claims) and refuses before it creates anything:
--   esign.may_send_in(org)        — the caller belongs to the organization the envelope is filed in;
--   esign.sendable_file(file)     — the caller may read that file, and what the send needs of it;
--   esign.org_member_by_email()   — a signer whose email is a member of that organization signs as
--                                   themself (/sign/e/…); anyone else is an outsider (/x/sign).
-- SECURITY INVOKER: they read only with the privileges of whoever runs them.

create or replace function esign.may_send_in(p_organization_id uuid)
returns boolean
language sql stable
set search_path to ''
as $fn$
  select auth.uid() is not null and (iam.has_org_access(p_organization_id) or public.is_platform_admin());
$fn$;

create or replace function esign.sendable_file(p_file_id uuid)
returns jsonb
language sql stable
set search_path to ''
as $fn$
  select jsonb_build_object(
           'file_id', f.id, 'name', f.file_name, 'mime_type', f.mime_type,
           'version', coalesce(v.version_number, f.current_version, 1),
           'storage_uri', coalesce(v.storage_uri, f.storage_uri), 'size_bytes', f.size_bytes)
    from files.files f
    left join files.file_versions v on v.file_id = f.id and v.version_number = f.current_version
   where f.id = p_file_id
     and f.deleted_at is null
     and auth.uid() is not null
     and (f.created_by = auth.uid() or iam.has_access('file', f.id, 'viewer'::public.permission_level)
          or public.is_platform_admin());
$fn$;

create or replace function esign.org_member_by_email(p_organization_id uuid, p_email text)
returns uuid
language sql stable
set search_path to ''
as $fn$
  select u.id
    from auth.users u
    join iam.organization_member m on m.user_id = u.id and m.organization_id = p_organization_id
   where lower(u.email) = lower(btrim(p_email))
   limit 1;
$fn$;
