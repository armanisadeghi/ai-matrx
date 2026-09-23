-- chair-step: THE INVERSE of migrations/campaign/hrloopcleanup_c_a_publish_is_a_change_so_workflow_definition_keeps_its_number.sql.
--   It takes `zzzzz_no_change_keeps_its_version` back off workflow.definition (the function itself
--   is STORE-VERSION-NOOP's and stays). A save that changes nothing moves a workflow's version
--   again. It exists for rule 27.
-- window-class: DROP TRIGGER fires the supautils hook — ACCESS EXCLUSIVE on auth, storage and
--   realtime relations, sign-in stops for the length of the transaction. At production 01:00–04:00
--   Pacific only.
-- lock: platform
-- lane: HR-LOOP-CLEANUP

set local lock_timeout = '5s';

drop trigger if exists zzzzz_no_change_keeps_its_version on workflow.definition;
