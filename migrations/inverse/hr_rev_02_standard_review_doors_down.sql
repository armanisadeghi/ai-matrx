-- chair-step: THE INVERSE of migrations/campaign/hr_rev_02_standard_review_doors.sql (lane HR-REVIEWS). Drops the seventeen hr.hr_review_* doors and the hr._rev_* helpers, deletes their platform.client_callable_door rows, and puts back the two authority_action values hr_rev_01 published on the self / acknowledge steps (which makes those steps unroutable again — that is the state before hr_rev_02). Refuses while any performance_review instance exists. Not yet rehearsed on the clone.
do $$
begin
  if exists (select 1 from hr.workflow_instance where flow_key = 'performance_review') then
    raise exception 'hr_rev_02 inverse: performance_review instances exist; cancel and archive them first';
  end if;
end $$;
delete from platform.client_callable_door
 where schema_name = 'hr' and (function_name like 'hr\_review\_%' or function_name like '\_rev\_%');
drop function hr.hr_review_template_ensure_default(uuid);
drop function hr.hr_review_cycle_create(jsonb);
drop function hr.hr_review_cycle_launch(uuid, jsonb);
drop function hr.hr_review_cycle_list(uuid);
drop function hr.hr_review_cycle_get(uuid);
drop function hr.hr_review_list_mine(uuid);
drop function hr.hr_review_get(uuid);
drop function hr.hr_review_save_response(uuid, text, jsonb, integer);
drop function hr.hr_review_submit_response(uuid, text);
drop function hr.hr_review_set_overall(uuid, text);
drop function hr.hr_review_share(uuid);
drop function hr.hr_review_acknowledge(uuid, text);
drop function hr.hr_review_reopen(uuid, text);
drop function hr.hr_review_cancel(uuid, text);
drop function hr.hr_review_replace_manager(uuid, uuid);
drop function hr.hr_review_history(uuid);
drop function hr.hr_review_cycle_close(uuid);
drop function hr._rev_review_json(uuid, uuid);
drop function hr._rev_close_step(uuid, text, text, uuid, text);
drop function hr._rev_set_due(uuid, text, date);
drop function hr._rev_lane(uuid, uuid, text);
drop function hr._rev_response_visible(text, uuid, uuid, uuid);
drop function hr._rev_seat(uuid, uuid);
drop function hr._rev_can_manage(uuid, uuid);
drop function hr._rev_skip_level_on(uuid);
drop function hr._rev_person_name(uuid);
drop function hr._rev_answer_problems(jsonb, jsonb);
drop function hr._rev_default_sections();
drop function hr._rev_default_rating_scale();
do $$
begin
  perform hr.arm_write();
  update hr.workflow_step_definition sd
     set authority_action = case sd.step_key when 'self' then 'performance_review_self' else 'performance_review_ack' end
    from hr.workflow_definition d
   where d.id = sd.workflow_definition_id and d.flow_key = 'performance_review'
     and sd.step_key in ('self', 'acknowledge');
end $$;
