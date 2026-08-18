-- Seed the five conversation-analysis agent slots — the "Analyze this
-- conversation" panel on /work/conversations (inspector) and
-- /work/conversations/[conversationId] resolves these at click time, so the
-- agent behind each analysis is swappable from the admin slots console with
-- no deploy.
--
-- Each slot defaults to its purpose-built conversation-analysis agent
-- (agent.definition category "conversation-analysis"). Every one of those
-- agents declares a `conversation_id` variable and carries the registered
-- `conversations` tool. Floating (use_latest) because the client launch path
-- requires it. Idempotent: skips any live slot_key that already exists.
--
-- Consumer:
--   features/ai-work/analysis/catalog.ts (CONVERSATION_ANALYSIS_KINDS)

insert into agent.slot_definition
  (slot_key, label, description, contract, default_agent_id, use_latest,
   is_enabled, organization_id, metadata, visibility)
select
  v.slot_key,
  v.label,
  v.description,
  '{"required_variables":["conversation_id"],"required_output_keys":[],"required_context_slots":[]}'::jsonb,
  v.default_agent_id::uuid,
  true,
  true,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, -- platform org (same as sibling slots)
  jsonb_build_object(
    'side', 'client',
    'code_ref', 'matrx-frontend/features/ai-work/analysis/catalog.ts:CONVERSATION_ANALYSIS_KINDS',
    'pin_style', 'floating'
  ),
  'public'
from (values
  (
    'conversation.vision_interviewer',
    'Conversation Vision Interviewer',
    'Everything the user said and wanted in a conversation, done vs not done. Launched from the "What you asked for" analysis action on AI Work conversation surfaces.',
    'b63edf56-97d8-45f9-bc4f-b62e22902c09'
  ),
  (
    'conversation.outcome_summarizer',
    'Conversation Outcome Summarizer',
    'End results, decisions, and facts a conversation produced. Launched from the "What came out of it" analysis action on AI Work conversation surfaces.',
    'b44cf1f2-7994-4621-ac7c-89ff0a6b9d85'
  ),
  (
    'conversation.action_auditor',
    'Conversation Action Auditor',
    'Open loops, promises, and blocked decisions in a conversation. Launched from the "What''s still open" analysis action on AI Work conversation surfaces.',
    '50e67c8b-2864-46e1-9ca8-f87123bffc80'
  ),
  (
    'conversation.decision_ledger',
    'Conversation Decision Ledger',
    'Decisions plus rationale and rejected alternatives from a conversation. Launched from the "Decisions and why" analysis action on AI Work conversation surfaces.',
    'b2915abf-6842-4385-891f-d3f47fe72c9c'
  ),
  (
    'conversation.drift_auditor',
    'Conversation Drift Auditor',
    'Original ask vs what was delivered in a conversation. Launched from the "Ask vs. delivered" analysis action on AI Work conversation surfaces.',
    '5fcff46e-1083-4411-abbc-c202fab48ab4'
  )
) as v(slot_key, label, description, default_agent_id)
where not exists (
  select 1
  from agent.slot_definition d
  where d.slot_key = v.slot_key
    and d.deleted_at is null
);
