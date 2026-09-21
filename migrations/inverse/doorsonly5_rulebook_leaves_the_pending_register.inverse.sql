-- chair-step: DOORS-ONLY-5 inverse -- puts platform.rulebook back in
-- platform.doors_only_pending_cutover and regenerates, which RESTORES its client write grants
-- and its std_insert/std_update/std_delete policies. The named restrictive refusals stay, so
-- the table does NOT become writable again by running this alone; it becomes writable only if
-- doorsonly5_platform_rulebook_is_never_client_written.inverse.sql is run as well. Only run it
-- to undo a closure that broke a real path, and say which path.

set lock_timeout = '2s';
set statement_timeout = '600s';

insert into platform.doors_only_pending_cutover
  (schema_name, table_name, reason, owner_lane)
values ('platform', 'rulebook',
        'RESTORED BY THE DOORS-ONLY-5 INVERSE. The doors public.rulebook_create / rulebook_save / rulebook_meta_set / rulebook_archive / rulebook_tension_settle exist and all nine callers in features/masterwork call them; this row only exists because somebody undid the cutover. Delete it and re-run iam.apply_rls to finish the closure again.',
        'DOORS-ONLY-5')
on conflict (schema_name, table_name) do nothing;

select iam.apply_rls('platform', 'rulebook', 'rulebook', 'entity');
