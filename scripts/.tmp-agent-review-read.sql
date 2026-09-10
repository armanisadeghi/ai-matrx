select id, title, url, status, repo_slug, conversation_id, instructions, feedback,
       created_at, updated_at, metadata
from agent.review_queue
where metadata->'triage'->'assignment'->>'owner' =
  'agent-review-first-pass:codex-desktop-20260909T204206:2026-09-09T20:30'
order by updated_at desc;
