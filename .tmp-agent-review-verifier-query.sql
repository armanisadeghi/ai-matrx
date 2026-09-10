select jsonb_build_object(
  'row', to_jsonb(q),
  'conversation', coalesce((
    select jsonb_agg(to_jsonb(m) order by m.created_at asc, m.id asc)
    from communication.dm_messages m
    where m.conversation_id = q.conversation_id
  ), '[]'::jsonb)
) as payload
from agent.review_queue q
where q.id = '7f11d5a7-f871-4d23-96b0-fc0bbadaf587';
