-- mandate_owner_writes_restrictive_policies.sql
--
-- ONLY A MANDATE'S OWNER CHANGES IT — IN THE DATABASE, NOT ONLY ON THE SERVER (2026-09-25).
--
-- The finding: the generated row policies on mandate.definition / binding / treatment /
-- provision let `std_update` and `std_delete` through on `created_by = auth.uid()` OR
-- `iam.has_access(<token>, id, 'editor')`. Every ordinary member of an organization holds
-- `editor` on that organization's rows, so a plain member could rewrite an org-homed mandate,
-- its organization binding or its presentation by writing straight through supabase-js —
-- around the server's owner rule. The creator arm also reached code-backed and system-homed
-- mandates whose `created_by` names an ordinary person.
--
-- The rule these policies enforce is the server's (aidream services/mandates/owner_access.py
-- and services/mandates/bindings.py, commit 2e08c1f00f):
--   * DEFINITION — a super admin (admin lane) may change any mandate; anyone else only when it
--     is SOFT (origin = 'user'), NOT homed in the Matrx System organization, and they hold
--     `admin` on it through the one access answer (iam.has_access → iam.has_access_for: the
--     creator, or an owner/admin of its home organization). Creating: an organization or a
--     person creates SOFT mandates only.
--   * BINDING — an ORG binding only by an owner/admin of that organization (iam.has_org_admin);
--     a USER binding only by that user; a GLOBAL binding (the legacy system default) only by a
--     super admin.
--   * TREATMENT — a mandate's presentation is part of its definition: the definition rule,
--     asked of the parent mandate.
--   * PROVISION — the definition rule on the provision row (every live provision is
--     system-homed, so today: platform admins only).
--
-- SHAPE: RESTRICTIVE policies, TO authenticated only, for INSERT / UPDATE / DELETE.
--   * Restrictive = ANDed with the permissive policies, so nothing anyone may do today is
--     widened, and the generated std_* / platform_admin_all / pub_read policies stay exactly as
--     iam.apply_rls emits them. These names are not in iam.generated_policy_names(), so a
--     regeneration keeps them (DD-147) and this file is their policy of record (DD-172).
--   * Reads are untouched: no SELECT policy is added, removed or narrowed, so the platform-admin
--     read arms, pub_read, the member list functions (mnd_member_list) and every read door see
--     exactly what they saw before.
--   * Every restrictive arm starts with the platform-admin / super-admin arm, so an admin in the
--     admin lane keeps every write platform_admin_all gives them.
--   * service_role is not named, so svc_all (the server's writes) is untouched; SECURITY DEFINER
--     triggers and doors (guard_binding_containment, _cascade_softdelete, the communication
--     RPCs) run as their owner and are untouched.
--   * Soft delete is an UPDATE (deleted_at), so the UPDATE policy covers it; USING judges the
--     row as it was, WITH CHECK judges it as written (no moving a mandate into the system org,
--     no flipping origin to 'code', no re-pointing a binding at somebody else).
--
-- Proof, red before / green after, from each person's real seat, rolled back:
--   pnpm check:mandate-owner-writes
-- Idempotent and additive: each policy is created only when absent (no DROP), so a re-run is a
-- no-op. Policy DDL only — no function body replaced, no data touched. Rehearsed (rule 27, up →
-- inverse → up) on the dev clone; the inverse is migrations/inverse/<this>_down.sql.

set local lock_timeout = '8s';

-- ── mandate.definition ──────────────────────────────────────────────────────
do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'definition'
                    and policyname = 'definition_owner_writes_insert') then
    create policy definition_owner_writes_insert on mandate.definition
      as restrictive for insert to authenticated
      with check (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or (origin = 'user'
            and organization_id is distinct from (select public.system_org_id('system')))
      );
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'definition'
                    and policyname = 'definition_owner_writes_update') then
    create policy definition_owner_writes_update on mandate.definition
      as restrictive for update to authenticated
      using (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or (origin = 'user'
            and organization_id is distinct from (select public.system_org_id('system'))
            and iam.has_access('mandate'::text, id, 'admin'::permission_level))
      )
      with check (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or (origin = 'user'
            and organization_id is distinct from (select public.system_org_id('system'))
            and iam.has_access('mandate'::text, id, 'admin'::permission_level))
      );
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'definition'
                    and policyname = 'definition_owner_writes_delete') then
    create policy definition_owner_writes_delete on mandate.definition
      as restrictive for delete to authenticated
      using (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or (origin = 'user'
            and organization_id is distinct from (select public.system_org_id('system'))
            and iam.has_access('mandate'::text, id, 'admin'::permission_level))
      );
  end if;
end $do$;

-- ── mandate.binding ─────────────────────────────────────────────────────────
do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'binding'
                    and policyname = 'binding_owner_writes_insert') then
    create policy binding_owner_writes_insert on mandate.binding
      as restrictive for insert to authenticated
      with check (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or (principal_type = 'user' and subject_user_id = (select auth.uid()))
        or (principal_type = 'org' and iam.has_org_admin(organization_id))
      );
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'binding'
                    and policyname = 'binding_owner_writes_update') then
    create policy binding_owner_writes_update on mandate.binding
      as restrictive for update to authenticated
      using (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or (principal_type = 'user' and subject_user_id = (select auth.uid()))
        or (principal_type = 'org' and iam.has_org_admin(organization_id))
      )
      with check (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or (principal_type = 'user' and subject_user_id = (select auth.uid()))
        or (principal_type = 'org' and iam.has_org_admin(organization_id))
      );
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'binding'
                    and policyname = 'binding_owner_writes_delete') then
    create policy binding_owner_writes_delete on mandate.binding
      as restrictive for delete to authenticated
      using (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or (principal_type = 'user' and subject_user_id = (select auth.uid()))
        or (principal_type = 'org' and iam.has_org_admin(organization_id))
      );
  end if;
end $do$;

-- ── mandate.treatment (the mandate's presentation: the parent's definition rule) ──
do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'treatment'
                    and policyname = 'treatment_owner_writes_insert') then
    create policy treatment_owner_writes_insert on mandate.treatment
      as restrictive for insert to authenticated
      with check (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or exists (
          select 1 from mandate.definition d
           where d.id = treatment.mandate_id
             and d.origin = 'user'
             and d.organization_id is distinct from (select public.system_org_id('system'))
             and iam.has_access('mandate'::text, d.id, 'admin'::permission_level))
      );
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'treatment'
                    and policyname = 'treatment_owner_writes_update') then
    create policy treatment_owner_writes_update on mandate.treatment
      as restrictive for update to authenticated
      using (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or exists (
          select 1 from mandate.definition d
           where d.id = treatment.mandate_id
             and d.origin = 'user'
             and d.organization_id is distinct from (select public.system_org_id('system'))
             and iam.has_access('mandate'::text, d.id, 'admin'::permission_level))
      )
      with check (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or exists (
          select 1 from mandate.definition d
           where d.id = treatment.mandate_id
             and d.origin = 'user'
             and d.organization_id is distinct from (select public.system_org_id('system'))
             and iam.has_access('mandate'::text, d.id, 'admin'::permission_level))
      );
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'treatment'
                    and policyname = 'treatment_owner_writes_delete') then
    create policy treatment_owner_writes_delete on mandate.treatment
      as restrictive for delete to authenticated
      using (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or exists (
          select 1 from mandate.definition d
           where d.id = treatment.mandate_id
             and d.origin = 'user'
             and d.organization_id is distinct from (select public.system_org_id('system'))
             and iam.has_access('mandate'::text, d.id, 'admin'::permission_level))
      );
  end if;
end $do$;

-- ── mandate.provision ───────────────────────────────────────────────────────
do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'provision'
                    and policyname = 'provision_owner_writes_insert') then
    create policy provision_owner_writes_insert on mandate.provision
      as restrictive for insert to authenticated
      with check (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or organization_id is distinct from (select public.system_org_id('system'))
      );
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'provision'
                    and policyname = 'provision_owner_writes_update') then
    create policy provision_owner_writes_update on mandate.provision
      as restrictive for update to authenticated
      using (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or (organization_id is distinct from (select public.system_org_id('system'))
            and iam.has_access('provision'::text, id, 'admin'::permission_level))
      )
      with check (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or (organization_id is distinct from (select public.system_org_id('system'))
            and iam.has_access('provision'::text, id, 'admin'::permission_level))
      );
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'mandate' and tablename = 'provision'
                    and policyname = 'provision_owner_writes_delete') then
    create policy provision_owner_writes_delete on mandate.provision
      as restrictive for delete to authenticated
      using (
        (select public.is_platform_admin()) or (select public.is_super_admin())
        or (organization_id is distinct from (select public.system_org_id('system'))
            and iam.has_access('provision'::text, id, 'admin'::permission_level))
      );
  end if;
end $do$;
