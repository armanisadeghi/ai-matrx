-- A crawler artifact may only reference a canonical file owned by the same
-- organization. The single-column FKs from the additive cutover are replaced
-- with tenant-safe composite FKs before the writer begins using the columns.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'files.files'::regclass
      and conname = 'files_files_id_organization_id_key'
  ) then
    alter table files.files
      add constraint files_files_id_organization_id_key
      unique (id, organization_id);
  end if;
end
$$;

alter table web.snapshot
  drop constraint if exists snapshot_body_file_id_fkey,
  drop constraint if exists snapshot_markdown_file_id_fkey;

alter table web.screenshot
  drop constraint if exists screenshot_file_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'web.snapshot'::regclass
      and conname = 'snapshot_body_file_org_fkey'
  ) then
    alter table web.snapshot
      add constraint snapshot_body_file_org_fkey
      foreign key (body_file_id, organization_id)
      references files.files (id, organization_id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'web.snapshot'::regclass
      and conname = 'snapshot_markdown_file_org_fkey'
  ) then
    alter table web.snapshot
      add constraint snapshot_markdown_file_org_fkey
      foreign key (markdown_file_id, organization_id)
      references files.files (id, organization_id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'web.screenshot'::regclass
      and conname = 'screenshot_file_org_fkey'
  ) then
    alter table web.screenshot
      add constraint screenshot_file_org_fkey
      foreign key (file_id, organization_id)
      references files.files (id, organization_id)
      on delete restrict;
  end if;
end
$$;
