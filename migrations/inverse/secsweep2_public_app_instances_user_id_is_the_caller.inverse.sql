-- chair-step: withdraws the SECURITY-SWEEP-2 caller pin on public.app_instances.user_id, which
-- re-opens the column to a client naming somebody else. Only run this to undo the pin.

drop policy if exists "app_instances_user_id_is_the_caller_insert" on public.app_instances;
drop policy if exists "app_instances_user_id_is_the_caller_update" on public.app_instances;
