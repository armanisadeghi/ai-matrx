-- chair-step: withdraws the SECURITY-SWEEP-2 addressability check on
-- interview.decision_interview.respondent_user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "decision_interview_respondent_user_id_is_addressable_insert" on interview.decision_interview;
drop policy if exists "decision_interview_respondent_user_id_is_addressable_update" on interview.decision_interview;
