-- chair-step: THE INVERSE of migrations/campaign/hr_rev_05_standard_review_wave2.sql (lane HR-REVIEWS). Drops the five wave-2 doors and their door rows (the helpers hr._rev_knob, _rev_mean_rating, _rev_template_problems and _rev_ensure_cadence stay; drop them after the hr_rev_02 bodies are restored), drops hr.review.calibrated_by / calibrated_at, and restores the platform definition's 72-hour cadence. The five replaced bodies (hr._rev_response_visible, hr_review_cycle_create, hr_review_cycle_launch, hr_review_share, hr_review_acknowledge) are restored by re-applying their hr_rev_02 definitions from migrations/campaign/hr_rev_02_standard_review_doors.sql as CREATE OR REPLACE; this file does not restate them. Organization-owned cadence copies of the definition are left in place (instances may be pinned to them). Not yet rehearsed.
delete from platform.client_callable_door where schema_name = 'hr'
   and function_name in ('hr_review_template_list','hr_review_template_save','hr_review_template_archive',
                         'hr_review_calibration','hr_review_calibrate','_rev_ensure_cadence');
drop function hr.hr_review_template_list(uuid);
drop function hr.hr_review_template_save(jsonb);
drop function hr.hr_review_template_archive(uuid);
drop function hr.hr_review_calibration(uuid, jsonb);
drop function hr.hr_review_calibrate(uuid, text, text);
alter table hr.review drop column calibrated_by;
alter table hr.review drop column calibrated_at;
do $$
begin
  perform hr.arm_write();
  update hr.workflow_definition set reminder_cadence_hours = 72
   where flow_key = 'performance_review' and status = 'published'
     and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
end $$;
