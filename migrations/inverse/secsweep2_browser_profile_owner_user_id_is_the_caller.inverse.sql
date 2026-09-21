-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on browser.profile.owner_user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "profile_owner_user_id_is_the_caller_insert" on browser.profile;
drop policy if exists "profile_owner_user_id_is_the_caller_update" on browser.profile;
