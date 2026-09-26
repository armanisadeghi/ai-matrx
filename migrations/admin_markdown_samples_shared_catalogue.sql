-- chair-step: canonicalize admin.admin_markdown_samples as the platform's shared markdown sample catalogue — every signed-in person reads it (the Markdown Studio's read-only starter samples), writes stay with platform admins; the bespoke super-admin-only policy is superseded by the generated system lanes (chair ruling 2026-09-26, rich-content unification round 2).
-- window-class: iam.apply_rls regenerates the policies on admin.admin_markdown_samples — policy DDL takes the 23-relation supautils set (measured 507–529 ms on the clone); apply it in the 1–4 AM Pacific window.
--
-- WHY. The Markdown Studio shows the team's shared samples to everyone as starter samples;
-- today a bespoke `ALL` policy lets only platform/super admins read them, so every other
-- person's Samples panel silently gets `[]`. The chair ruled: read only, every signed-in
-- person, through iam.apply_rls — never a hand-written policy.
--
-- WHAT (db-canonicalize-table, schema-homed hand roll, `system` variant):
--   1. base columns: organization_id (the Matrx System org — the platform's own catalogue),
--      updated_by, version, metadata, deleted_at (soft delete), visibility (default 'public');
--   2. NOT NULL + the three base FKs; _touch_row + _stamp_actor replace the legacy
--      handle_updated_at trigger;
--   3. registry: data_class = public (a published catalogue), has_soft_delete, not versioned
--      (the table never versioned; behavior preserved — raised to the chair as the one
--      question this recipe says to ask);
--   4. supersede the bespoke policy, then iam.apply_rls(..., 'system').
-- Writers: the app sends organization_id explicitly (the system org) — no default, no
-- resolver chooses it (no-db-assigned-org). A person who is not a member of the system org
-- fails std_insert's has_org_access check; platform admins pass the admin lane.
-- Inverse: migrations/inverse/admin_markdown_samples_shared_catalogue_down.sql

alter table admin.admin_markdown_samples add column if not exists organization_id uuid;
alter table admin.admin_markdown_samples add column if not exists updated_by uuid;
alter table admin.admin_markdown_samples add column if not exists version int not null default 1;
alter table admin.admin_markdown_samples add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table admin.admin_markdown_samples add column if not exists deleted_at timestamptz;
alter table admin.admin_markdown_samples add column if not exists visibility platform.visibility not null default 'public';

-- Backfill before any trigger is attached, so the rows are not stamped as edited.
update admin.admin_markdown_samples
   set organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 where organization_id is null;

alter table admin.admin_markdown_samples alter column organization_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_markdown_samples_org_fk') then
    alter table admin.admin_markdown_samples
      add constraint admin_markdown_samples_org_fk foreign key (organization_id) references iam.organizations(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_markdown_samples_created_by_fk') then
    alter table admin.admin_markdown_samples
      add constraint admin_markdown_samples_created_by_fk foreign key (created_by) references auth.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_markdown_samples_updated_by_fk') then
    alter table admin.admin_markdown_samples
      add constraint admin_markdown_samples_updated_by_fk foreign key (updated_by) references auth.users(id);
  end if;
end $$;

-- Every foreign key gets a covering index (provision_shape_guard).
create index if not exists admin_markdown_samples_organization_id_idx on admin.admin_markdown_samples (organization_id);
create index if not exists admin_markdown_samples_created_by_idx on admin.admin_markdown_samples (created_by);
create index if not exists admin_markdown_samples_updated_by_idx on admin.admin_markdown_samples (updated_by);

drop trigger if exists admin_markdown_samples_set_updated_at on admin.admin_markdown_samples;
drop trigger if exists _touch_row on admin.admin_markdown_samples;
drop trigger if exists _stamp_actor on admin.admin_markdown_samples;
create trigger _touch_row before insert or update on admin.admin_markdown_samples
  for each row execute function platform._touch_row();
create trigger _stamp_actor before insert or update on admin.admin_markdown_samples
  for each row execute function platform._stamp_actor();

update platform.entity_types
   set rls_variant = 'system',
       data_class = 'public',
       data_class_reason = 'The platform''s shared markdown sample catalogue: every signed-in person reads it as read-only starter samples in the Markdown Studio; platform admins write it from the studio''s admin lane (chair ruling 2026-09-26).',
       default_visibility = 'public',
       has_soft_delete = true,
       is_versioned = false
 where token = 'admin_markdown_sample';

select iam.supersede_bespoke_policies('admin', 'admin_markdown_samples', array['admin_markdown_samples_super_admin_all'],
  'Folded into the generated system lanes: platform admins keep full access through the admin lanes and platform_admin_read; every signed-in person now reads the public catalogue (chair ruling 2026-09-26).');

select iam.apply_rls('admin', 'admin_markdown_samples', 'admin_markdown_sample', 'system');

do $$
begin
  if exists (select 1 from admin.admin_markdown_samples where organization_id is null) then
    raise exception 'admin_markdown_samples: null organization_id remains';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'admin.admin_markdown_samples'::regclass and tgname = '_touch_row') then
    raise exception 'admin_markdown_samples: _touch_row not attached';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'admin.admin_markdown_samples'::regclass and tgname = '_stamp_actor') then
    raise exception 'admin_markdown_samples: _stamp_actor not attached';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'admin.admin_markdown_samples'::regclass and polname = 'platform_admin_read') then
    raise exception 'admin_markdown_samples: platform_admin_read missing — our own admin access is never removed';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'admin.admin_markdown_samples'::regclass and polname = 'admin_markdown_samples_super_admin_all') then
    raise exception 'admin_markdown_samples: the bespoke super-admin policy is still present';
  end if;
end $$;
