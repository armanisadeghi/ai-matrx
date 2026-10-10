-- chair-step: THE INVERSE of migrations/campaign/hr_rev_08_template_get_and_peer_link.sql (lane HR-REVIEWS). Drops hr.hr_review_template_get and its door row and puts the peer_feedback_requested deep_link_template back to the 360 route it carried. hr._rev_notify_peer is restored by re-applying its hr_rev_07 definition (the extra review.id payload key is harmless if left). Not yet rehearsed.
delete from platform.client_callable_door where schema_name = 'hr' and function_name = 'hr_review_template_get';
drop function hr.hr_review_template_get(uuid);
update communication.notification_event_type
   set config = jsonb_set(config, '{deep_link_template}', '"/hr/performance/{{cycle.id}}?org={{organization.id}}&part=peer&of={{subject.id}}"'::jsonb)
 where event_key = 'hr.performance.peer_feedback_requested' and deleted_at is null;
