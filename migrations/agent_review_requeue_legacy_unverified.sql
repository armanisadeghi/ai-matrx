-- Remove legacy, unverified rows from Arman's inbox. Every requeued item gets
-- a complete triage envelope so the new first-pass worker can claim it, and
-- the durable conversation explains why it moved backward.

with candidates as materialized (
  select queue.*
  from agent.review_queue queue
  where queue.status = 'ready_for_human'
    and (
      nullif(btrim(queue.metadata #>> '{triage,verification,verified_by}'), '') is null
      or nullif(btrim(queue.metadata #>> '{triage,verification,verified_at}'), '') is null
      or queue.metadata #>> '{triage,assignment,state}' is distinct from 'awaiting_review'
    )
), messages as (
  insert into communication.dm_messages (
    conversation_id,
    sender_id,
    content,
    message_type,
    status,
    client_message_id,
    organization_id,
    created_by,
    metadata
  )
  select
    candidate.conversation_id,
    conversation.created_by,
    'Returned to the agent queue because the legacy ready state did not include complete live-verification evidence.',
    'system',
    'sent',
    'agent-review:' || candidate.id || ':legacy-evidence-requeue',
    conversation.organization_id,
    conversation.created_by,
    jsonb_build_object(
      'actor_kind', 'agent',
      'actor_label', 'agent-review-rollout',
      'review_event', 'submitted',
      'review_queue_id', candidate.id
    )
  from candidates candidate
  join communication.dm_conversations conversation
    on conversation.id = candidate.conversation_id
  where not exists (
    select 1
    from communication.dm_messages existing
    where existing.client_message_id =
      'agent-review:' || candidate.id || ':legacy-evidence-requeue'
  )
), updated as (
  update agent.review_queue queue
  set
    status = 'submitted',
    metadata = jsonb_set(
      coalesce(queue.metadata, '{}'::jsonb),
      '{triage}',
      coalesce(queue.metadata->'triage', '{}'::jsonb)
      || jsonb_build_object(
        'version', 1,
        'lane', coalesce(queue.metadata #>> '{triage,lane}', 'browser_ui'),
        'required_tools', coalesce(
          queue.metadata #> '{triage,required_tools}',
          '["browser", "authenticated_session"]'::jsonb
        ),
        'workstreams', coalesce(
          queue.metadata #> '{triage,workstreams}',
          '["verification"]'::jsonb
        ),
        'priority', coalesce(queue.metadata #>> '{triage,priority}', 'normal'),
        'assignment', coalesce(
          queue.metadata #> '{triage,assignment}',
          jsonb_build_object('mode', 'coordinator')
        ) || jsonb_build_object('state', 'ready'),
        'verification', (
          coalesce(
            queue.metadata #> '{triage,verification}',
            jsonb_build_object(
              'browser_breakpoints',
              jsonb_build_array('desktop', 'tablet', 'mobile')
            )
          ) - 'verified_by' - 'verified_at'
        ) || jsonb_build_object(
          'notes',
          'Legacy ready state requeued for a complete live agent review.'
        )
      )
    )
  from candidates candidate
  where queue.id = candidate.id
  returning queue.id
)
select count(*) as requeued from updated;

alter table agent.review_queue
  validate constraint review_queue_ready_evidence_check;
