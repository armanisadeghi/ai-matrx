-- chair-step: it GRANTS EXECUTE on four NEW functions to `authenticated`, which is the shape the
--   runner's allow-list refuses by name. Nothing is dropped, nothing is revoked, no row of any
--   feature is deleted or rewritten. The inverse is
--   migrations/inverse/orgarch_the_two_doors_archive_and_restore_down.sql.
-- additive: yes
-- guard: custom/system_enabled
-- based-on: public.get_user_organizations(uuid) b627bbc1d2645002128674c05f82f1a915a7e3f6deb5dbc0e0a23cdfcb8998f6
--
-- ORG-ARCHIVE — THE TWO DOORS, AND THE READER THAT HIDES BY DEFAULT.
--
-- `iam.organization_archive(org, typed_name, reason)` closes an organization. `iam.organization
-- _restore(org, typed_name)` reopens it. Both are the owner's or a super admin's to call, both
-- want the organization's name typed back character for character, both write one row to
-- `iam.org_admin_audit`, and both hand back a SENTENCE a screen can show — never a constraint
-- name, never an error code.
--
-- THERE IS NO PURGE. Restore has no window and no expiry. Retention is a platform knob whose
-- default is "keep forever"; an organization is removed for good only by a separate,
-- super-admin-only retention action that exists to satisfy a stated retention policy, is off by
-- default, and is NOT built here (register: common-docs/projects/data-doctrine-adoption/v5/
-- SOFT-DELETE-REGISTER.md).
--
-- `iam.organization_archive_state(org)` is what the archived organization's own settings page
-- reads for its banner: is it archived, who did it, when, why, and may THIS person restore it.
--
-- `public.list_user_organizations(user, archived)` is the archive-aware list reader. It takes the
-- platform archive filter's own three values — 'active' (the default, hides archived),
-- 'archived', 'all' — so every picker and list gets the law's one-or-two-click reveal from one
-- door instead of inventing its own predicate. `public.get_user_organizations(user)`, which live
-- code already calls, keeps its signature and simply hides archived organizations, because the
-- law's default is to hide.

-- ── 1. Archive ────────────────────────────────────────────────────────────────────────────────
create or replace function iam.organization_archive(
  p_org          uuid,
  p_confirm_name text,
  p_reason       text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid  uuid := (select auth.uid());
  v_org  iam.organizations%rowtype;
begin
  select * into v_org from iam.organizations where id = p_org;
  if not found then
    raise exception 'That organization no longer exists.' using errcode = 'P0002';
  end if;

  if not ((select public.is_platform_admin()) or iam.is_org_owner(p_org, v_uid)) then
    raise exception 'Only an owner of % can archive it.', v_org.name using errcode = '42501';
  end if;

  if coalesce(v_org.is_personal, false) then
    raise exception
      'Your personal workspace cannot be archived — it is where your own work lives.'
      using errcode = '23514';
  end if;

  if v_org.is_system then
    raise exception
      '% is a system organization and cannot be archived.', v_org.name using errcode = '23514';
  end if;

  if p_confirm_name is distinct from v_org.name then
    raise exception
      'Type the organization''s name exactly — % — to archive it.', v_org.name
      using errcode = '23514';
  end if;

  if v_org.archived_at is not null then
    return jsonb_build_object(
      'archived', true,
      'changed', false,
      'archived_at', v_org.archived_at,
      'sentence', format('%s was already archived on %s.',
                         v_org.name, to_char(v_org.archived_at, 'DD Month YYYY')));
  end if;

  update iam.organizations
     set archived_at    = now(),
         archived_by    = v_uid,
         archive_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at     = now(),
         updated_by     = coalesce(v_uid, updated_by)
   where id = p_org
  returning * into v_org;

  insert into iam.org_admin_audit (organization_id, actor_user_id, action, detail)
  values (p_org, v_uid, 'organization.archived',
          jsonb_build_object('reason', v_org.archive_reason, 'name', v_org.name));

  return jsonb_build_object(
    'archived', true,
    'changed', true,
    'archived_at', v_org.archived_at,
    'sentence', format(
      '%s is archived. Its members cannot open it and nothing inside it runs, but nothing was '
      'deleted — an owner can restore it at any time.', v_org.name));
end
$function$;

-- ── 2. Restore ────────────────────────────────────────────────────────────────────────────────
create or replace function iam.organization_restore(
  p_org          uuid,
  p_confirm_name text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org iam.organizations%rowtype;
begin
  select * into v_org from iam.organizations where id = p_org;
  if not found then
    raise exception 'That organization no longer exists.' using errcode = 'P0002';
  end if;

  -- is_org_owner answers about YOURSELF without asking my_orgs(), so an owner can still be
  -- recognised as the owner of an organization the archive has taken out of my_orgs().
  if not ((select public.is_platform_admin()) or iam.is_org_owner(p_org, v_uid)) then
    raise exception
      'Only an owner of %, or a super admin, can restore it.', v_org.name using errcode = '42501';
  end if;

  if p_confirm_name is distinct from v_org.name then
    raise exception
      'Type the organization''s name exactly — % — to restore it.', v_org.name
      using errcode = '23514';
  end if;

  if v_org.archived_at is null then
    return jsonb_build_object(
      'archived', false, 'changed', false,
      'sentence', format('%s is not archived.', v_org.name));
  end if;

  update iam.organizations
     set archived_at    = null,
         archived_by    = null,
         archive_reason = null,
         updated_at     = now(),
         updated_by     = coalesce(v_uid, updated_by)
   where id = p_org
  returning * into v_org;

  insert into iam.org_admin_audit (organization_id, actor_user_id, action, detail)
  values (p_org, v_uid, 'organization.restored', jsonb_build_object('name', v_org.name));

  return jsonb_build_object(
    'archived', false, 'changed', true,
    'sentence', format(
      '%s is open again. Its members have their access back and everything inside it — records, '
      'agents, schedules — is exactly as they left it.', v_org.name));
end
$function$;

-- ── 3. What the banner reads ──────────────────────────────────────────────────────────────────
create or replace function iam.organization_archive_state(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org iam.organizations%rowtype;
  v_who text;
  v_may boolean;
begin
  select * into v_org from iam.organizations where id = p_org;
  if not found then
    return jsonb_build_object('known', false);
  end if;

  -- Only somebody who belongs to it (archived or not) may ask.
  if not ((select public.is_platform_admin())
          or v_org.created_by = v_uid
          or p_org in (select iam.my_orgs_all())) then
    return jsonb_build_object('known', false);
  end if;

  v_may := (select public.is_platform_admin()) or iam.is_org_owner(p_org, v_uid);

  if v_org.archived_by is not null then
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email)
      into v_who
      from auth.users u where u.id = v_org.archived_by;
  end if;

  return jsonb_build_object(
    'known', true,
    'archived', v_org.archived_at is not null,
    'archived_at', v_org.archived_at,
    'archived_by_name', v_who,
    'reason', v_org.archive_reason,
    'may_restore', coalesce(v_may, false),
    'sentence', case
      when v_org.archived_at is null then null
      else format(
        '%s was archived%s on %s%s. Nothing was deleted — everything inside it is exactly as it '
        'was, and restoring it gives every member their access back.',
        v_org.name,
        case when v_who is null then '' else ' by ' || v_who end,
        to_char(v_org.archived_at, 'DD Month YYYY'),
        case when v_org.archive_reason is null then '' else ' — "' || v_org.archive_reason || '"' end)
    end);
end
$function$;

-- ── 4. The archive-aware list reader, and the old one hiding by default ───────────────────────
create or replace function public.list_user_organizations(
  p_user_id  uuid,
  p_archived text default 'active'
)
returns table (
  id             uuid,
  name           text,
  slug           text,
  role           org_role,
  is_personal    boolean,
  archived_at    timestamptz,
  archive_reason text
)
language plpgsql
stable
security definer
as $function$
-- THE ARCHIVED-ITEMS LAW's three values, and no fourth: 'active' (the default — hides archived),
-- 'archived', 'all'. One door so no picker has to invent its own predicate.
begin
  -- THE ACCESS DECISION, before any read and before existence: you may list YOUR OWN
  -- memberships, and a platform admin may list anyone's. A foreign id and an invented one are
  -- refused identically, so this answers nothing about who exists.
  if not (p_user_id = (select auth.uid()) or (select public.is_platform_admin())) then
    raise exception 'You can only list your own organizations.' using errcode = '42501';
  end if;

  if p_archived not in ('active', 'archived', 'all') then
    raise exception 'The archive filter is one of active, archived or all — not %.', p_archived
      using errcode = '22023';
  end if;

  return query
  select o.id, o.name, o.slug, m.role, o.is_personal, o.archived_at, o.archive_reason
    from iam.organizations o
    join iam.organization_member m on o.id = m.organization_id
   where m.user_id = p_user_id
     and case p_archived
           when 'active'   then o.archived_at is null
           when 'archived' then o.archived_at is not null
           else true
         end
   order by (o.archived_at is not null), o.is_personal desc, o.name asc;
end
$function$;

create or replace function public.get_user_organizations(user_id uuid)
returns table (id uuid, name text, slug text, role org_role, is_personal boolean)
language plpgsql
security definer
as $function$
-- Unchanged shape, unchanged callers. It now hides archived organizations, because THE
-- ARCHIVED-ITEMS LAW's default is to hide; a caller that wants them asks
-- public.list_user_organizations(user, 'all' | 'archived').
begin
  return query
  select o.id, o.name, o.slug, m.role, o.is_personal
    from iam.organizations o
    join iam.organization_member m on o.id = m.organization_id
   where m.user_id = $1
     and o.archived_at is null
   order by o.is_personal desc, o.name asc;
end
$function$;

-- ── 5. The access decisions, in data, before the grants (DD-223 / §6d-4) ─────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', 'organization_archive', 'p_org uuid, p_confirm_name text, p_reason text',
   array['uuid'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
   'p_org is checked against the caller: it proceeds only when public.is_platform_admin() or '
   'iam.is_org_owner(p_org, auth.uid()) — an owner of THAT organization. A null p_org finds no '
   'row and raises "That organization no longer exists."; a null auth.uid() fails is_org_owner '
   'and is refused. p_confirm_name and p_reason are the person''s own typing, checked against the '
   'organization''s stored name, never used to select a row. Personal and system organizations '
   'are refused outright.',
   'ORG-ARCHIVE / orgarch_the_two_doors_archive_and_restore.sql', null, true, false),
  ('iam', 'organization_restore', 'p_org uuid, p_confirm_name text',
   array['uuid'::regtype, 'text'::regtype]::oid[],
   'Same decision as iam.organization_archive: p_org is checked against the caller through '
   'public.is_platform_admin() or iam.is_org_owner(p_org, auth.uid()). A null p_org or a null '
   'auth.uid() is refused. p_confirm_name is the person''s typing, compared with the stored name '
   'and never used to select a row.',
   'ORG-ARCHIVE / orgarch_the_two_doors_archive_and_restore.sql', null, true, false),
  ('iam', 'organization_archive_state', 'p_org uuid', array['uuid'::regtype]::oid[],
   'Read-only. p_org is checked against the caller before anything is returned: platform admin, '
   'the organization''s creator, or a member through iam.my_orgs_all(). Anyone else — and a null '
   'p_org — gets {"known": false}, which says nothing about whether the organization exists.',
   'ORG-ARCHIVE / orgarch_the_two_doors_archive_and_restore.sql', null, true, false),
  ('public', 'list_user_organizations', 'p_user_id uuid, p_archived text',
   array['uuid'::regtype, 'text'::regtype]::oid[],
   'Read-only, and it returns ONLY rows joined to iam.organization_member for p_user_id, exactly '
   'as public.get_user_organizations(uuid) beside it has always done — an organization row '
   'carries no secret beyond its name and slug, which every member already sees. p_user_id is '
   'p_user_id is checked against the caller BEFORE any read and before existence: it must equal '
   'auth.uid(), or the caller must be a platform admin — so a foreign id and an invented one are '
   'refused identically, and a null p_user_id is refused for everyone but a platform admin (for '
   'whom it then matches no membership and returns zero rows). p_archived is the archive filter '
   'and accepts only active, archived or all.',
   'ORG-ARCHIVE / orgarch_the_two_doors_archive_and_restore.sql', null, true, false),
  -- Pre-existing debt this file inherits by replacing the body: get_user_organizations has
  -- never carried a declaration. It holds no client grant (postgres and service_role only) and
  -- this file does not give it one, so it is declared as the server-lane function it is.
  ('public', 'get_user_organizations', 'user_id uuid', array['uuid'::regtype]::oid[],
   'user_id is the row filter and nothing else: the function returns only organizations joined '
   'to iam.organization_member for that user, and a null user_id matches no membership and '
   'returns zero rows. It is checked against no caller because no client may call it.',
   'ORG-ARCHIVE / orgarch_the_two_doors_archive_and_restore.sql',
   'server_only: it holds EXECUTE for postgres and service_role alone — the browser reads a '
   'person''s organizations through public.list_user_organizations(uuid, text) or through '
   'iam.organizations under its own RLS policy, never through this one.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function iam.organization_archive(uuid, text, text)   to authenticated;
grant execute on function iam.organization_restore(uuid, text)         to authenticated;
grant execute on function iam.organization_archive_state(uuid)         to authenticated;
grant execute on function public.list_user_organizations(uuid, text)   to authenticated;

