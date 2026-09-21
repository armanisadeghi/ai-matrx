-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on workbench.heatmap_saves.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "heatmap_saves_user_id_is_the_caller_insert" on workbench.heatmap_saves;
drop policy if exists "heatmap_saves_user_id_is_the_caller_update" on workbench.heatmap_saves;
