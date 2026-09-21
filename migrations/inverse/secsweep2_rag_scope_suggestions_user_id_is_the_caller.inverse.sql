-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on rag.scope_suggestions.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "scope_suggestions_user_id_is_the_caller_insert" on rag.scope_suggestions;
drop policy if exists "scope_suggestions_user_id_is_the_caller_update" on rag.scope_suggestions;
