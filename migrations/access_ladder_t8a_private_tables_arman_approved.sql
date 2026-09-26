-- lane: access-ladder T-8
-- Access ladder T-8a (2026-09-26): Arman's approval of the 8 Private tables is recorded and applied.
--
-- Arman, 2026-09-26, verbatim: "I agree, including the part about the basic employee list."
-- That approves the independent table review's Private list
-- (common-docs/projects/access-ladder/table-review.md): each table below is one person's own
-- communications or own thinking (the law's canonical examples: AI chat, email inbox).
-- communication.calendar_event is Private by the same ruling.
--
-- Through the named approval door only (platform.set_table_private_arman_explicitly_approved),
-- which writes his words and the date to platform.class_approval_by_arman. Six tables are already
-- Private: the call records the approval and changes nothing else. sms_conversations and
-- notification move Confidential -> Private (their policies regenerate).
-- rls_variant is kept (entity): the Private class is what emits the owner-only lane set
-- (iam.class_lanes); moving live tables onto the `personal` variant is not needed for the level
-- and would regenerate every write lane on the platform's busiest tables.
set local lock_timeout = '3s';
select platform.set_table_private_arman_explicitly_approved(p_token => 'conversation', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_private_arman_explicitly_approved(p_token => 'cx_agent_memory', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_private_arman_explicitly_approved(p_token => 'user_memory', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_private_arman_explicitly_approved(p_token => 'emails', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_private_arman_explicitly_approved(p_token => 'dm_conversation', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_private_arman_explicitly_approved(p_token => 'sms_conversation', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_private_arman_explicitly_approved(p_token => 'notification', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_private_arman_explicitly_approved(p_token => 'calendar_event', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');

do $$
declare n int;
begin
  select count(*) into n from platform.entity_types
   where token in ('conversation','cx_agent_memory','user_memory','emails','dm_conversation','sms_conversation','notification','calendar_event')
     and data_class = 'private';
  if n <> 8 then raise exception 'T-8a: expected 8 Private tables, found %', n; end if;
end $$;
