-- chair-step: withdraws the SECURITY-SWEEP-2 addressability check on
-- education.game_room.host_user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "game_room_host_user_id_is_addressable_insert" on education.game_room;
drop policy if exists "game_room_host_user_id_is_addressable_update" on education.game_room;
