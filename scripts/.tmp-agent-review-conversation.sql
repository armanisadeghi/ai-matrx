select id, sender_id, content, message_type, status, created_at, metadata
from communication.dm_messages
where conversation_id = '31fb0113-a76f-4c1b-8bfc-ad8d3ddba74f'
order by created_at, id;
