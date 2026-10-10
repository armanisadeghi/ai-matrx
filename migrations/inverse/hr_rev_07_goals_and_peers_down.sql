-- chair-step: THE INVERSE of migrations/campaign/hr_rev_07_goals_and_peers.sql (lane HR-REVIEWS). Refuses while any goal, peer nomination or peer response exists, so no person's goal or feedback is destroyed. Drops the nine wave-3 doors and three helpers with their door rows, hr.review.peer_feedback_shared_at, and the tables hr.review_peer_nomination and hr.goal with their entity_types rows. The six replaced bodies are restored by re-applying their earlier definitions (hr_rev_05 for hr._rev_response_visible; hr_rev_02 for hr._rev_lane, hr_review_get, hr_review_save_response, hr_review_submit_response; hr_rev_05 for hr._rev_template_problems) as CREATE OR REPLACE; this file does not restate them. Not yet rehearsed.
do $$
begin
  if exists (select 1 from hr.goal) or exists (select 1 from hr.review_peer_nomination)
     or exists (select 1 from hr.review_response where role = 'peer') then
    raise exception 'hr_rev_07 inverse: goals, nominations or peer responses exist; nothing is destroyed';
  end if;
end $$;
delete from platform.client_callable_door where schema_name = 'hr' and function_name in
  ('hr_goal_list','hr_goal_list_team','hr_goal_save','hr_goal_update_progress','hr_goal_archive','hr_review_peer_nominate',
   'hr_review_peer_approve','hr_review_peer_requests_mine','hr_review_peer_share','_goal_can_read','_goal_can_edit','_rev_notify_peer');
drop function hr.hr_goal_list(uuid);
drop function hr.hr_goal_list_team(uuid);
drop function hr.hr_goal_save(jsonb);
drop function hr.hr_goal_update_progress(uuid, numeric, numeric, text, text);
drop function hr.hr_goal_archive(uuid);
drop function hr.hr_review_peer_nominate(uuid, uuid[]);
drop function hr.hr_review_peer_approve(uuid, uuid[], boolean);
drop function hr.hr_review_peer_requests_mine();
drop function hr.hr_review_peer_share(uuid, boolean);
drop function hr._rev_notify_peer(uuid);
drop function hr._goal_json(hr.goal);
drop function hr._goal_can_edit(uuid, uuid);
drop function hr._goal_can_read(uuid, uuid);
alter table hr.review drop column peer_feedback_shared_at;
drop table hr.review_peer_nomination;
drop table hr.goal;
delete from platform.entity_types where token in ('hr_review_peer_nomination', 'hr_goal');
