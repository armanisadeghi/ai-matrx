select jsonb_build_object(
  'row', (select jsonb_build_object('status', q.status, 'triage', q.metadata->'triage', 'updated_at', q.updated_at)
          from agent.review_queue q where q.id = 'b45d9b53-8d81-4ca7-874a-fb451b39917d'),
  'latest_message', (select jsonb_build_object('content', m.content, 'created_at', m.created_at, 'metadata', m.metadata)
                     from communication.dm_messages m
                     where m.conversation_id = '2f2d9062-ec05-483f-b19b-94707264cf37'
                     order by m.created_at desc, m.id desc limit 1)
) as evidence;
