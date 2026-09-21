-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on scheduler.sch_task.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "sch_task_user_id_is_the_caller_insert" on scheduler.sch_task;
drop policy if exists "sch_task_user_id_is_the_caller_update" on scheduler.sch_task;
