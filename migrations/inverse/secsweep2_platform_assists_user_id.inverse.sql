-- chair-step: withdraws the SECURITY-SWEEP-2 addressability check on
-- platform.assists.user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "assists_user_id_is_addressable_insert" on platform.assists;
drop policy if exists "assists_user_id_is_addressable_update" on platform.assists;
