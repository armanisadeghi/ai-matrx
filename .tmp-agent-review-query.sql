with reviewed as materialized (
  select q.*, c.created_by as audit_user_id, c.organization_id as conversation_org_id
  from agent.review_queue q
  join communication.dm_conversations c on c.id = q.conversation_id
  where q.id = 'b45d9b53-8d81-4ca7-874a-fb451b39917d'
    and q.status = 'agent_review'
    and q.metadata->'triage'->'assignment'->>'owner' = 'agent-review-first-pass:codex-20260909T171154:2026-09-09T17:00'
  for update
), updated as (
  update agent.review_queue q
  set metadata = jsonb_set(
    q.metadata, '{triage,verification,notes}',
    to_jsonb('Production canary 7960009c passed backend persistence, lineage, refresh adoption, terminal output, and mobile layout. Frontend release ae89d5e6c3 containing repair 371c52f84 removed the three video image failures, but scalar audio_url still renders as an image and raises one red terminal media error. Follow-up repair is active.'::text)
  ), updated_at = now()
  from reviewed
  where q.id = reviewed.id
  returning q.*, reviewed.audit_user_id, reviewed.conversation_org_id
), message as (
  insert into communication.dm_messages (
    conversation_id, sender_id, content, message_type, status,
    client_message_id, organization_id, created_by, metadata
  )
  select updated.conversation_id, updated.audit_user_id,
    '2026-09-10 deployed media-repair verification: Vercel deployment dpl_5Kr3GhbeEkJfaKTxuKg5Jy5NzGZ6 is READY and aliased to www.aimatrx.com at Git SHA ae89d5e6c3f22ad53945fadf7e56fa87edd02a30; ancestry contains repair 371c52f84. Reloading completed run 7960009c on mobile removed all three video/official-video image failures: those now render as honest file links. One blocker remains: audio_url/file 74e43cbd-db1a-4aea-ad67-cee6fdb946ac still renders as an image, fails after retry, and raises one red terminal media error. The same implementer is repairing the remaining scalar-audio path; row remains fixing.',
    'system', 'sent',
    'agent-review:' || updated.id || ':repair-progress:' || gen_random_uuid(),
    updated.conversation_org_id, updated.audit_user_id,
    jsonb_build_object('actor_kind','agent','actor_label','agent-review-first-pass:codex-20260909T171154:2026-09-09T17:00','review_event','repair_progress','review_queue_id',updated.id,'deployment_id','dpl_5Kr3GhbeEkJfaKTxuKg5Jy5NzGZ6','release_sha','ae89d5e6c3f22ad53945fadf7e56fa87edd02a30')
  from updated
  returning id
)
select id, status, metadata->'triage' as triage, (select count(*) from message) as messages_inserted
from updated;
