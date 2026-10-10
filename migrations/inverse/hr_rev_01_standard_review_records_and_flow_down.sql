-- chair-step: THE INVERSE of migrations/campaign/hr_rev_01_standard_review_records_and_flow.sql (lane HR-REVIEWS). Run only after the hr_rev_02 inverse. Removes the performance_review flow type, its definition and step definitions, the two hr.review_wf_* functions and their door rows, takes performance.manage back off hr_owner / hr_admin, and drops the four tables hr.review_response, hr.review, hr.review_cycle, hr.review_template with their platform.entity_types rows. Refuses while any review or performance_review instance exists, so it never destroys a person's review. Not yet rehearsed on the clone.
do $$
begin
  if exists (select 1 from hr.workflow_instance where flow_key = 'performance_review')
     or exists (select 1 from hr.review) or exists (select 1 from hr.review_cycle) then
    raise exception 'hr_rev_01 inverse: reviews, cycles or performance_review instances exist; nothing is destroyed';
  end if;
  perform hr.arm_write();
  update hr.workflow_flow_type set default_definition_id = null where flow_key = 'performance_review';
  delete from hr.workflow_step_definition sd using hr.workflow_definition d
   where d.id = sd.workflow_definition_id and d.flow_key = 'performance_review';
  delete from hr.workflow_definition where flow_key = 'performance_review';
  delete from hr.workflow_flow_type where flow_key = 'performance_review';
  update hr.access_role set capabilities = array_remove(capabilities, 'performance.manage')
   where 'performance.manage' = any(capabilities);
end $$;
delete from platform.client_callable_door
 where schema_name = 'hr' and function_name in ('review_wf_digest', 'review_wf_apply');
drop function hr.review_wf_apply(uuid);
drop function hr.review_wf_digest(text, uuid);
drop table hr.review_response;
drop table hr.review;
drop table hr.review_cycle;
drop table hr.review_template;
delete from platform.entity_types
 where token in ('hr_review_response', 'hr_review', 'hr_review_cycle', 'hr_review_template');
