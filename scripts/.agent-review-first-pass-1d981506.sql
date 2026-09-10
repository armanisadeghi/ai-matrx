select
  message.id,
  message.created_at,
  message.sender_id,
  message.content,
  message.message_type,
  message.status,
  message.metadata
from communication.dm_messages message
where message.conversation_id = '9f276656-1833-471c-8332-5b23eaccd1f9'
order by message.created_at asc, message.id asc;
