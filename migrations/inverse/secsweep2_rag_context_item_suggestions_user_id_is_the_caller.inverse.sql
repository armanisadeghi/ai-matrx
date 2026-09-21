-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on rag.context_item_suggestions.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "context_item_suggestions_user_id_is_the_caller_insert" on rag.context_item_suggestions;
drop policy if exists "context_item_suggestions_user_id_is_the_caller_update" on rag.context_item_suggestions;
