-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on ui.ui_surface_config.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "ui_surface_config_user_id_is_the_caller_insert" on ui.ui_surface_config;
drop policy if exists "ui_surface_config_user_id_is_the_caller_update" on ui.ui_surface_config;
