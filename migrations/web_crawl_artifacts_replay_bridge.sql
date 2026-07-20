-- Immutable-history replay bridge. Lexically, files_only drops these legacy
-- columns before the older additive use_files migration executes. Recreate
-- nullable placeholders so that already-ledgered migration can replay without
-- editing its checksum; the zz finalizer drops them again immediately.

alter table web.screenshot
  add column if not exists storage_bucket text,
  add column if not exists storage_path text;
