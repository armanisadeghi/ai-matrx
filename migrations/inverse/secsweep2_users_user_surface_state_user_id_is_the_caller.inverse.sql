-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on users.user_surface_state.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "user_surface_state_user_id_is_the_caller_insert" on users.user_surface_state;
drop policy if exists "user_surface_state_user_id_is_the_caller_update" on users.user_surface_state;
