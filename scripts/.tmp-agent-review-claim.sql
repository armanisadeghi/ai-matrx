with candidate as materialized (
  select queue.id
  from agent.review_queue queue
  where queue.status in ('human_changes_requested','agent_changes_requested','submitted')
    and queue.conversation_id is not null
    and queue.metadata->'triage'->>'lane' <> 'human_required'
    and queue.metadata->'triage'->'required_tools' @> '["browser"]'::jsonb
    and not (queue.metadata->'triage'->'required_tools' @> '["human_input"]'::jsonb)
    and queue.metadata->'triage'->'assignment'->>'state' = 'ready'
  order by
    case queue.status when 'human_changes_requested' then 1 when 'agent_changes_requested' then 2 else 3 end,
    case queue.metadata->'triage'->>'priority' when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
    coalesce(queue.feedback_at, queue.created_at), queue.id
  for update skip locked
  limit 1
), claimed as (
  update agent.review_queue queue
  set status = 'agent_review',
      metadata = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(queue.metadata, '{triage,assignment,state}', '"claimed"'::jsonb),
              '{triage,assignment,owner}', to_jsonb('agent-review-first-pass:codex-desktop-20260909T204206:2026-09-09T20:30'::text)
            ),
            '{triage,assignment,claimed_at}', to_jsonb(now())
          ),
          '{triage,verification,verified_by}', 'null'::jsonb
        ),
        '{triage,verification,verified_at}', 'null'::jsonb
      )
  from candidate
  where queue.id = candidate.id
  returning queue.*
), message as (
  insert into communication.dm_messages (
    conversation_id, sender_id, content, message_type, status,
    client_message_id, organization_id, created_by, metadata
  )
  select claimed.conversation_id, conversation.created_by,
    'Claimed for initial agent review and live browser verification.',
    'system', 'sent',
    'agent-review:' || claimed.id || ':claimed:' || gen_random_uuid(),
    conversation.organization_id, conversation.created_by,
    jsonb_build_object(
      'actor_kind','agent',
      'actor_label','agent-review-first-pass:codex-desktop-20260909T204206:2026-09-09T20:30',
      'review_event','agent_review','review_queue_id',claimed.id
    )
  from claimed
  join communication.dm_conversations conversation on conversation.id = claimed.conversation_id
)
select id, title, url, status, repo_slug, conversation_id, instructions, feedback, metadata
from claimed;
