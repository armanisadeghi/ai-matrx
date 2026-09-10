with reviewed as materialized (
  select queue.*, conversation.created_by as audit_user_id,
         conversation.organization_id as conversation_org_id
  from agent.review_queue queue
  join communication.dm_conversations conversation
    on conversation.id = queue.conversation_id
  where queue.id = '09af6ffa-5662-4105-9e40-2cac570e23c9'
    and queue.status = 'agent_review'
    and queue.metadata->'triage'->'assignment'->>'owner' =
      'agent-review-first-pass:codex-desktop-20260909T204206:2026-09-09T20:30'
  for update
), updated as (
  update agent.review_queue queue
  set metadata = jsonb_set(
        jsonb_set(queue.metadata, '{triage,assignment,state}', '"fixing"'::jsonb),
        '{triage,verification,notes}',
        to_jsonb('2026-09-09 20:48 PDT production reproduction: the Voice Casting trigger form requested the registered text/dropdown variant and supplied choices, but the shared served-field renderer discarded the per-input options and rendered a free-text textarea. The initial registry-loading paint also briefly emitted a false unregistered-variant warning. Repairing the shared served-input control before completing the review.'::text)
      )
  from reviewed
  where queue.id = reviewed.id
  returning queue.*, reviewed.audit_user_id, reviewed.conversation_org_id
), message as (
  insert into communication.dm_messages (
    conversation_id, sender_id, content, message_type, status,
    client_message_id, organization_id, created_by, metadata
  )
  select updated.conversation_id, updated.audit_user_id,
    '2026-09-09 20:48 PDT production reproduction: the Voice Casting trigger form requested the registered text/dropdown variant and supplied choices, but the shared served-field renderer discarded the per-input options and rendered a free-text textarea. The initial registry-loading paint also briefly emitted a false unregistered-variant warning. Repairing the shared served-input control before completing the review.',
    'system', 'sent',
    'agent-review:' || updated.id || ':fixing:' || gen_random_uuid(),
    updated.conversation_org_id, updated.audit_user_id,
    jsonb_build_object(
      'actor_kind','agent',
      'actor_label','agent-review-first-pass:codex-desktop-20260909T204206:2026-09-09T20:30',
      'review_event','fixing','review_queue_id',updated.id
    )
  from updated
)
select id, status, metadata->'triage' as triage from updated;
