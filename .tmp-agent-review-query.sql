select id, sender_id, content, message_type, status, created_at, metadata
from communication.dm_messages
where conversation_id = '2f2d9062-ec05-483f-b19b-94707264cf37'
order by created_at asc, id asc;
