-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on ops.ops_issue_event.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "ops_issue_event_user_id_is_the_caller_insert" on ops.ops_issue_event;
drop policy if exists "ops_issue_event_user_id_is_the_caller_update" on ops.ops_issue_event;
