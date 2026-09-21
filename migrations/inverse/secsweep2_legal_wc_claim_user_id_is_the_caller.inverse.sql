-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on legal.wc_claim.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "wc_claim_user_id_is_the_caller_insert" on legal.wc_claim;
drop policy if exists "wc_claim_user_id_is_the_caller_update" on legal.wc_claim;
