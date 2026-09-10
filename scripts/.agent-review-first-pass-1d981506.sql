select source_id, length(content) as characters, created_at
from docproc.processed_documents
where created_at >= '2026-09-10T05:15:00Z'
  and deleted_at is null
order by created_at desc
limit 10;
