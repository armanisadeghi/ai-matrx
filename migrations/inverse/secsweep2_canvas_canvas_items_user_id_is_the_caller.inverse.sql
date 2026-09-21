-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on canvas.canvas_items.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "canvas_items_user_id_is_the_caller_insert" on canvas.canvas_items;
drop policy if exists "canvas_items_user_id_is_the_caller_update" on canvas.canvas_items;
