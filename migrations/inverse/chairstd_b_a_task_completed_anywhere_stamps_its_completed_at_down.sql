-- Inverse of chairstd_b_a_task_completed_anywhere_stamps_its_completed_at.sql (restore the browser copy in taskService.ts with it).
set local lock_timeout = '3s';
drop trigger if exists _completed_at_follows_status on projects.tasks;
drop function if exists projects._task_completed_at_follows_status();
