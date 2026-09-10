select id, content, metadata, created_at
from communication.dm_messages
where conversation_id = '5b5b6f1b-60d2-4ec1-b452-46e46ca2b647'
  and metadata->>'review_event' = 'repair'
order by created_at desc
limit 1;
