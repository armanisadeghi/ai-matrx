-- Cloud Files — realtime publication for folders + versions (P0-5)
--
-- WHY: the FE realtime middleware (features/files/redux/realtime-middleware.ts)
-- subscribes to postgres_changes on cld_folders AND cld_file_versions, but those
-- two tables were never added to the `supabase_realtime` publication. Only
-- cld_files, cld_file_permissions, cld_share_links were published. Result: every
-- folder rename/move/delete and every version change from another tab/device was
-- silently dropped — the subscriptions fired against a publication that emits
-- nothing for them. This adds the missing tables so the existing handlers work.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus) via apply_migration on 2026-06-10.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cld_folders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cld_folders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cld_file_versions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cld_file_versions;
  END IF;
END $$;
