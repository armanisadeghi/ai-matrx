select 'queue' as record_type, id::text, status::text as state,
       metadata->'triage'->'assignment' as payload, updated_at as happened_at
from agent.review_queue
where id = '106c61cb-24cc-4ffb-a6ae-092887922866'
union all
select 'message', id::text, status::text, metadata,
       created_at
from communication.dm_messages
where conversation_id = '5b5b6f1b-60d2-4ec1-b452-46e46ca2b647'
  and metadata->>'review_event' = 'fixing'
order by happened_at desc;
