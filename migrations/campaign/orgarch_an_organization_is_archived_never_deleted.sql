-- chair-step: it GRANTS EXECUTE on two NEW functions to `authenticated` and ALTERs two existing
--   SELECT policies to widen what they let a member read, which is the shape the runner's
--   allow-list refuses by name. Nothing is dropped, nothing is revoked, no row of any feature is
--   deleted or rewritten. The inverse is
--   migrations/inverse/orgarch_an_organization_is_archived_never_deleted_down.sql.
-- additive: yes
-- guard: custom/system_enabled
-- based-on: iam.my_orgs() 1cc267f2edf61fb600222173a8bd2cdbc91abb146d5950e59c48a5ee1eca4ae1
--
-- ORG-ARCHIVE — AN ORGANIZATION IS ARCHIVED, NEVER DELETED.
--
-- THE OWNER'S RULING, 2026-09-20, verbatim:
--   "Deleting anything important in our system should be a soft-delete. I'm pretty sure we've
--    already set that for many tables. We certainly would not delete organizations directly.
--    It's absolutely an archive and we would store it for much more than 30 days just in case.
--    The only reason we limit anything to 30 days is to comply with some policies for retention.
--    so... YES."
--
-- WHAT THIS REPLACES. The previous lane (ORG-DELETE) built a supported path to EMPTY an
-- organization and then hard-delete it. That path stands as engineering but the owner has ruled
-- the product shape: the button archives. A hard delete of an organization was never reachable
-- anyway — 79 foreign keys "set null" into columns that forbid null and 638 more refuse outright
-- (census: common-docs/operations/for-arman/2026-09-20/deleting-an-organization.md).
--
-- THE ONE PLACE ARCHIVING CLOSES AN ORGANIZATION.
--
-- `iam.my_orgs()` is the platform's answer to "which organizations is this person inside". SEVEN
-- HUNDRED AND THIRTY row-level-security policies ask it. So archiving is enforced THERE, once,
-- for the whole platform, instead of in seven hundred and thirty readers: an archived
-- organization simply stops being one of your organizations, and every row scoped to it becomes
-- invisible in the same instant, to every client, through every door — web, server, MCP, agent.
-- That is the class fix; a reader added tomorrow inherits it with no code change.
--
-- WHAT MUST STILL BE VISIBLE, or the archive would be a black hole:
--   · the organization ROW itself — the picker has to be able to reveal it in one click (THE
--     ARCHIVED-ITEMS LAW), and its settings page has to show the banner and the Restore action;
--   · `iam.org_admin_audit` — who archived it, when and why.
-- Both now ask `iam.my_orgs_all()`, which is `my_orgs()` WITHOUT the archive test. Nothing else
-- is widened: membership rows, records, agents, schedules, files, conversations all go dark.
--
-- NOTHING IS DELETED. Every row inside the organization stays exactly where it is. Restore puts
-- the organization back into `my_orgs()` and every one of those rows reappears, untouched.

-- Adding a column takes ACCESS EXCLUSIVE on a table every signed-in request reads, so wait for
-- the readers in front of us rather than giving up after the connection default.
set local lock_timeout = '90s';

-- ── 1. The archive columns, the same three every archivable entity carries ────────────────────
alter table iam.organizations
  add column if not exists archived_at    timestamptz,
  add column if not exists archived_by    uuid,
  add column if not exists archive_reason text;

comment on column iam.organizations.archived_at is
  'When this organization was archived (THE ARCHIVED-ITEMS LAW). Null = live. An archived '
  'organization is closed, not deleted: it leaves iam.my_orgs(), so every row scoped to it is '
  'invisible everywhere, and iam.organization_restore() brings all of it back with no expiry.';
comment on column iam.organizations.archived_by is
  'The person who archived it. Read back by iam.organization_archive_state() for the banner.';
comment on column iam.organizations.archive_reason is
  'What they typed as the reason, shown on the archived organization''s own settings page.';

create index if not exists organizations_archived_at_idx
  on iam.organizations (archived_at)
  where archived_at is not null;

-- ── 2. my_orgs_all() — membership as it stands, archive or no archive ─────────────────────────
create or replace function iam.my_orgs_all()
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
-- Every organization this person belongs to, INCLUDING archived ones. Only three things may ask
-- it: the organization row's own SELECT policy (so an archived organization can be revealed in
-- one click and restored), its admin audit trail, and iam.my_orgs() below. Everything else asks
-- iam.my_orgs(), which is the access answer.
begin
  return query
    select organization_id from iam.organization_member where user_id = (select auth.uid())
    union
    select s.organization_id from iam.system_orgs s
     where s.global_readable and public.is_super_admin_for((select auth.uid()));
end
$function$;

-- The access decision, in data, before the grant (DD-223 / §6d-4).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values
  ('iam', 'my_orgs_all', '', array[]::oid[],
   'Caller-identity reader, the same shape as iam.my_orgs(): it takes no argument and returns '
   'only the organizations the CALLER belongs to (auth.uid()), so with no session it returns zero '
   'rows and there is nothing to check an entity id against. It exists so the organization row''s '
   'own SELECT policy and its admin audit trail can still show an ARCHIVED organization to its '
   'own members — iam.my_orgs() now excludes archived organizations and is the access answer '
   'everywhere else. Signed-in callers only; unlike my_orgs() nothing anonymous reaches it.',
   'ORG-ARCHIVE / orgarch_an_organization_is_archived_never_deleted.sql',
   true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function iam.my_orgs_all() to authenticated, service_role;

-- ── 3. my_orgs() — the access answer, and it stops at the archive ─────────────────────────────
create or replace function iam.my_orgs()
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
-- THE ACCESS ANSWER for the whole platform. An archived organization is not one of yours: the
-- 730 policies that ask this question all close in the same instant, and they all reopen the
-- instant it is restored. Nothing is deleted on either side of that line.
begin
  return query
    select o.id
      from iam.my_orgs_all() as m(id)
      join iam.organizations o on o.id = m.id
     where o.archived_at is null;
end
$function$;

-- ── 4. The two readers that must still see an archived organization ───────────────────────────
alter policy org_select_policy on iam.organizations
  using (
    (select public.is_platform_admin())
    or created_by = (select auth.uid())
    or id in (select iam.my_orgs_all())
  );

alter policy std_select on iam.org_admin_audit
  using (
    organization_id is not null
    and organization_id in (select iam.my_orgs_all())
  );

