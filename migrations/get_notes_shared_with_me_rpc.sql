-- get_notes_shared_with_me — list notes shared WITH the calling user.
--
-- The notes list query (`fetchNotesList`) is deliberately owner-only
-- (`created_by = auth.uid()`), so notes shared via iam.permissions were
-- invisible: the grantee could open one by direct link but never see it in
-- /notes. This RPC is the per-resource "shared with me" lister, following the
-- established pattern (get_prompts_shared_with_me,
-- get_cx_conversations_shared_with_me) but covering BOTH direct user grants
-- and org-targeted grants, honoring status/expiry, and returning the
-- grantee's EFFECTIVE (max) permission level so the client can render
-- read-only vs editable without a second RPC.
--
-- List fields only (no content) — the client fetches content on open via the
-- normal RLS-authorized select (std_select already grants viewer access).

create or replace function public.get_notes_shared_with_me()
returns table (
  id uuid,
  label text,
  folder_name text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  organization_id uuid,
  project_id uuid,
  task_id uuid,
  visibility text,
  version integer,
  created_by uuid,
  permission_level text,
  owner_email text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    n.id,
    n.label,
    n.folder_name,
    n.tags,
    n.created_at,
    n.updated_at,
    n.organization_id,
    n.project_id,
    n.task_id,
    n.visibility::text,
    n.version,
    n.created_by,
    max(p.permission_level)::text as permission_level,
    u.email::text as owner_email
  from iam.permissions p
  join workbench.notes n on n.id = p.resource_id
  left join auth.users u on u.id = n.created_by
  where p.resource_type = 'note'
    and (
      p.granted_to_user_id = auth.uid()
      or p.granted_to_organization_id in (select iam.my_orgs())
    )
    and coalesce(p.status, 'active') = 'active'
    and (p.expires_at is null or p.expires_at > now())
    and n.created_by is distinct from auth.uid()
    and n.deleted_at is null
  group by n.id, u.email
  order by n.updated_at desc;
$$;

revoke execute on function public.get_notes_shared_with_me() from anon, public;
grant execute on function public.get_notes_shared_with_me() to authenticated;
