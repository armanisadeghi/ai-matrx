-- INVERSE of migrations/campaign/argsruled_the_eighteen_that_reach_no_ladder.sql.
--
-- It removes this lane's rulings from the eighteen doors by setting argument_rules back to NULL
-- on every row this file declared. Two of them (context/hr wrappers written by
-- 0851_every_door_names_every_argument.sql) are restored to NULL as well, which is what the
-- 2026-09-17 declared-unchecked rows become; their own inverse is the migration that wrote them.
--
-- With this applied the per-argument census rises by up to 15 and the ratchet fails again.

set lock_timeout = '2s';

update platform.client_callable_door d
   set argument_rules = null
 where (d.schema_name, d.function_name) in (
   ('custom','anon_publish'),
   ('custom','capture_submit'),
   ('custom','io_comment_resolve'),
   ('custom','read_record'),
   ('public','checklist_run_save'),
   ('public','flexible_data_archive'),
   ('public','hr_attendance_exception_resolve'),
   ('public','hr_authority_delegation_request'),
   ('public','hr_incident_assign'),
   ('public','hr_kiosk_pairing_code_create'),
   ('public','hr_leave_case_open'),
   ('public','hr_leave_enroll'),
   ('public','hr_leave_policy_deactivate'),
   ('public','hr_role_assign'),
   ('public','hr_wf_request'),
   ('public','provider_account_attach_credential'),
   ('public','provider_account_set_status'),
   ('public','udt_backfill_autonumber'))
   and d.argument_rules ->> 'declared_by' = 'argsruled_the_eighteen_that_reach_no_ladder.sql';
