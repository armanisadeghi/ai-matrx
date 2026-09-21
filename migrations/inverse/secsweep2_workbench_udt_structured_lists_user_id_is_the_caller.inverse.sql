-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on workbench.udt_structured_lists.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "udt_structured_lists_user_id_is_the_caller_insert" on workbench.udt_structured_lists;
drop policy if exists "udt_structured_lists_user_id_is_the_caller_update" on workbench.udt_structured_lists;
