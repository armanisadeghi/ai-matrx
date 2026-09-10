select jsonb_build_object(
  'queue', (
    select jsonb_build_object(
      'id', queue.id,
      'status', queue.status,
      'assignment', queue.metadata->'triage'->'assignment',
      'verification', queue.metadata->'triage'->'verification'
    )
    from agent.review_queue queue
    where queue.id = 'b9d45194-8b72-4b6e-8776-949e083e9b1c'
  ),
  'knobs', (
    select jsonb_agg(jsonb_build_object(
      'key', knob.key,
      'value', knob.value,
      'default_value', knob.default_value,
      'set_by', knob.set_by
    ) order by knob.key)
    from platform.feature_knob knob
    where knob.feature = 'education.study_kit'
  ),
  'repair_message', (
    select jsonb_build_object(
      'id', message.id,
      'created_at', message.created_at,
      'content', message.content,
      'metadata', message.metadata
    )
    from communication.dm_messages message
    where message.conversation_id = '9f276656-1833-471c-8332-5b23eaccd1f9'
      and message.metadata->>'review_event' = 'repair_started'
      and message.metadata->>'actor_label' =
          'agent-review-first-pass:codex-desktop-1d981506:2026-09-09T22:00'
    order by message.created_at desc
    limit 1
  )
) as evidence;
