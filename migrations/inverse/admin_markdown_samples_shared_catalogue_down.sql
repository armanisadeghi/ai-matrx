-- chair-step: inverse of admin_markdown_samples_shared_catalogue.sql — puts admin.admin_markdown_samples back to its bespoke super-admin-only shape (no base columns, no generated lanes); refuses while any soft-deleted row exists, because dropping deleted_at would bring it back to life.
-- window-class: regenerates and recreates policies on admin.admin_markdown_samples — policy DDL takes the 23-relation supautils set; run it only in the 1–4 AM Pacific window.

do $$
begin
  if exists (select 1 from admin.admin_markdown_samples where deleted_at is not null) then
    raise exception 'admin_markdown_samples down: % soft-deleted row(s) exist; dropping deleted_at would resurrect them. Hard-decide them first.',
      (select count(*) from admin.admin_markdown_samples where deleted_at is not null);
  end if;
end $$;

-- The registry goes back FIRST: a class change regenerates the table's policies, and that
-- regeneration needs the base columns, which are dropped below.
update platform.entity_types
   set rls_variant = 'system',
       data_class = 'confidential',
       data_class_reason = 'Platform-operator tooling content. Registered by DD-159 batch 1 (B-48) as part of closing the "client-readable but unregistered" class: this table had an anon or authenticated SELECT grant and no registry row at all, so it had no class, no generated policy and no guard. REGISTERED, NOT REGENERATED — its live policies are untouched and unproven. Read iam.verify_canonical on this token before running iam.apply_rls on it: apply_rls DROPS every policy first. | STAFF LANE OPEN BY DESIGN (2026-09-18, staff_door_six_tokens_dd137b): platform-operator tooling content read by the admin markdown tester as a super admin; the table has no organization_id, so no class lane but the staff lane can describe it. Named residue in scripts/check-staff-door.ts.',
       default_visibility = null,
       has_soft_delete = false,
       is_versioned = false
 where token = 'admin_markdown_sample';

-- Every policy on the table goes; the two that stood before come back verbatim.
do $$
declare p record;
begin
  for p in select polname from pg_policy where polrelid = 'admin.admin_markdown_samples'::regclass loop
    execute format('drop policy %I on admin.admin_markdown_samples', p.polname);
  end loop;
end $$;

create policy admin_markdown_samples_super_admin_all on admin.admin_markdown_samples
  for all to public
  using ((select is_platform_admin()) or (select is_super_admin()))
  with check ((select is_platform_admin()) or (select is_super_admin()));
create policy platform_admin_all on admin.admin_markdown_samples
  for all to authenticated
  using ((select is_platform_admin()))
  with check ((select is_platform_admin()));

drop trigger if exists _touch_row on admin.admin_markdown_samples;
drop trigger if exists _stamp_actor on admin.admin_markdown_samples;
drop trigger if exists admin_markdown_samples_set_updated_at on admin.admin_markdown_samples;
create trigger admin_markdown_samples_set_updated_at before update on admin.admin_markdown_samples
  for each row execute function handle_updated_at();

drop index if exists admin.admin_markdown_samples_organization_id_idx;
drop index if exists admin.admin_markdown_samples_created_by_idx;
drop index if exists admin.admin_markdown_samples_updated_by_idx;
alter table admin.admin_markdown_samples drop constraint if exists admin_markdown_samples_org_fk;
alter table admin.admin_markdown_samples drop constraint if exists admin_markdown_samples_created_by_fk;
alter table admin.admin_markdown_samples drop constraint if exists admin_markdown_samples_updated_by_fk;
alter table admin.admin_markdown_samples drop column if exists organization_id;
alter table admin.admin_markdown_samples drop column if exists updated_by;
alter table admin.admin_markdown_samples drop column if exists version;
alter table admin.admin_markdown_samples drop column if exists metadata;
alter table admin.admin_markdown_samples drop column if exists deleted_at;
alter table admin.admin_markdown_samples drop column if exists visibility;
