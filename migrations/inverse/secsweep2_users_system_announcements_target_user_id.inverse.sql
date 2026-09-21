-- chair-step: withdraws the SECURITY-SWEEP-2 addressability check on
-- users.system_announcements.target_user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "system_announcements_target_user_id_is_addressable_insert" on users.system_announcements;
drop policy if exists "system_announcements_target_user_id_is_addressable_update" on users.system_announcements;
