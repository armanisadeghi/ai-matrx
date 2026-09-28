-- Delete means archive (Arman, 2026-09-27): "delete MUST MEAN ARCHIVE regardless
-- of what it's called". The admin announcement table's Delete button destroyed
-- users.system_announcements rows because the table had no Trash column.
-- Adding deleted_at is a positive add (db-rules §8 THE POSITIVE-ADD RULE): no
-- existing row or read changes. Registering the kind with the Trash registry
-- lists an archived announcement in its author's /trash, restored through the
-- generic public.entity_undelete door (editor access, which the author and a
-- platform admin hold).

alter table users.system_announcements add column if not exists deleted_at timestamptz;

update platform.entity_types
   set user_artifact_kind = 'system_announcement'
 where token = 'system_announcement'
   and user_artifact_kind is null;
