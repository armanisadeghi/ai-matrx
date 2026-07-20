-- Final cutover: disposable legacy crawl data has been wiped and every future
-- persisted artifact is represented only by a canonical files.files UUID.

alter table web.snapshot
  alter column body_file_id set not null,
  drop column body_ref;

alter table web.screenshot
  alter column file_id set not null,
  drop column storage_bucket,
  drop column storage_path;

alter table web.snapshot
  add constraint snapshot_extracted_has_no_legacy_file_refs
  check (not (extracted ? 'markdown_ref'));
