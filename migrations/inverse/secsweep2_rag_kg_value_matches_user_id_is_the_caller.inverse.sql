-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on rag.kg_value_matches.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "kg_value_matches_user_id_is_the_caller_insert" on rag.kg_value_matches;
drop policy if exists "kg_value_matches_user_id_is_the_caller_update" on rag.kg_value_matches;
