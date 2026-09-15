-- based-on: iam.has_org_access_for(uuid, uuid) b892ef239e3d338841f4797f6b8ae4c8c6fae4ce84f39ecf4d2aca8ac9c04177
-- based-on: iam.my_orgs() ad1699618b1a2bd517cb65206b76851937356ff20c1541cf8aaeb325f41ce424
-- ============================================================================
-- iam_org_access_platform_admins_manage_global_system_org
--
-- THE RULING (Arman, 2026-09-14): the Matrx System organization "has no users
-- and should never have users … the purpose of that organization is to be the
-- one that's recorded for things that we want the system to own. If something
-- is requiring it to have a user before it can store things, then THAT is the
-- problem we need to fix."
--
-- THE DEFECT. The org lane — `iam.has_org_access(o)` / `has_org_access_for(u,o)`
-- / `my_orgs()` — was pure membership in `iam.organization_member`. Every
-- `std_insert` policy the canonical generator emits is
-- `created_by = auth.uid() AND (organization_id IS NULL OR iam.has_org_access(organization_id))`,
-- so NOBODY could create a row owned by the system org through the product's
-- own write path: seeding the data-tables example tables as the super admin
-- failed with "new row violates row-level security policy for table
-- udt_datasets" (2026-09-14). Reads already had the answer — the platform-
-- global tier in `iam.has_access` (db-rules FEATURE.md §6e) grants every
-- signed-in user viewer and every SUPER ADMIN full manage on a
-- `global_readable` system org's content — but the org lane never learned it.
--
-- THE FIX, once, for the whole class: the org lane admits a super admin on a
-- `global_readable` system org, in all three spellings, so they stay the SAME
-- check (§6d: "a rewrite, never a widening" — this widens all three together,
-- identically). Membership semantics for every other org are untouched; the
-- system org still has zero members and never needs one. The Library org
-- (`global_readable = false`, grant-governed) is deliberately NOT included.
-- ============================================================================

create or replace function iam.has_org_access_for(p_user_id uuid, p_org uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  return exists (select 1 from iam.organization_member m
                 where m.organization_id = p_org and m.user_id = p_user_id)
      or (
        -- Platform-global tier for WRITES: a super admin manages what the
        -- system owns. Mirrors the read tier in iam.has_access (§6e).
        exists (select 1 from iam.system_orgs s
                 where s.organization_id = p_org and s.global_readable)
        and public.is_super_admin_for(p_user_id)
      );
end;
$function$;

create or replace function iam.my_orgs()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select organization_id from iam.organization_member where user_id = (select auth.uid())
  union
  select s.organization_id from iam.system_orgs s
   where s.global_readable and public.is_super_admin_for((select auth.uid()));
$function$;

-- Self-check, in the same transaction: the three spellings agree, the tier is
-- real for a super admin, and a stranger still gets nothing.
do $$
declare
  v_sys uuid := (select organization_id from iam.system_orgs where key = 'system');
  v_super uuid := (select a.user_id from admin.admins a where a.level = 'super_admin' limit 1);
  v_member record;
begin
  if v_sys is null then raise exception 'self-check: no system org registered'; end if;
  if v_super is null then raise exception 'self-check: no super admin to test with'; end if;
  if not iam.has_org_access_for(v_super, v_sys) then
    raise exception 'self-check: a super admin must have org access to the global system org';
  end if;
  if iam.has_org_access_for(gen_random_uuid(), v_sys) then
    raise exception 'self-check: a stranger must NOT have org access to the system org';
  end if;
  select m.user_id, m.organization_id into v_member from iam.organization_member m limit 1;
  if v_member.user_id is not null and not iam.has_org_access_for(v_member.user_id, v_member.organization_id) then
    raise exception 'self-check: membership access regressed';
  end if;
end $$;
