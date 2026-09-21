-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on rag.ner_canonicalizer_shadow.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "ner_canonicalizer_shadow_user_id_is_the_caller_insert" on rag.ner_canonicalizer_shadow;
drop policy if exists "ner_canonicalizer_shadow_user_id_is_the_caller_update" on rag.ner_canonicalizer_shadow;
