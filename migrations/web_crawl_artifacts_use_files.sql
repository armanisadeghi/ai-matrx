-- Canonical web crawler artifacts are files.files rows. The browser stores and
-- reads only durable file UUIDs; native storage locations stay server-only.

alter table web.snapshot
  add column if not exists body_file_id uuid,
  add column if not exists markdown_file_id uuid;

alter table web.screenshot
  add column if not exists file_id uuid;

-- Keep the old columns nullable only for the narrow rolling cutover. They are
-- dropped after the disposable crawler data is wiped and the new writer passes.
alter table web.screenshot
  alter column storage_bucket drop not null,
  alter column storage_path drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'web.snapshot'::regclass
      and conname = 'snapshot_body_file_id_fkey'
  ) then
    alter table web.snapshot
      add constraint snapshot_body_file_id_fkey
      foreign key (body_file_id) references files.files(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'web.snapshot'::regclass
      and conname = 'snapshot_markdown_file_id_fkey'
  ) then
    alter table web.snapshot
      add constraint snapshot_markdown_file_id_fkey
      foreign key (markdown_file_id) references files.files(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'web.screenshot'::regclass
      and conname = 'screenshot_file_id_fkey'
  ) then
    alter table web.screenshot
      add constraint screenshot_file_id_fkey
      foreign key (file_id) references files.files(id) on delete restrict;
  end if;
end
$$;

create index if not exists snapshot_body_file_id_idx
  on web.snapshot (body_file_id)
  where body_file_id is not null;

create index if not exists snapshot_markdown_file_id_idx
  on web.snapshot (markdown_file_id)
  where markdown_file_id is not null;

create index if not exists screenshot_file_id_idx
  on web.screenshot (file_id)
  where file_id is not null;
