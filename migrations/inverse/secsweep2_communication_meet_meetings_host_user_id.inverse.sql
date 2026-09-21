-- chair-step: withdraws the SECURITY-SWEEP-2 addressability check on
-- communication.meet_meetings.host_user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "meet_meetings_host_user_id_is_addressable_insert" on communication.meet_meetings;
drop policy if exists "meet_meetings_host_user_id_is_addressable_update" on communication.meet_meetings;
