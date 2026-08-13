-- Seed the floating client-run slot used by Backlinks page-layer assists.
-- The default is General Chat so the feature works immediately; admins can
-- replace it with a purpose-built backlink/outreach agent without a deploy.
-- Idempotent: a live slot with this key is never overwritten.

insert into agent.slot_definition
  (slot_key, label, description, contract, default_agent_id, use_latest,
   is_enabled, organization_id, metadata, visibility)
select
  'seo.backlink_assistant',
  'Backlink Assistant',
  'Prepares evidence-grounded backlink reclaim, redirect, anchor-risk, human-review, and competitor-gap work from the Backlinks assist strip. Default is the General Chat agent — swap in a purpose-built specialist anytime.',
  '{"required_variables":[],"required_output_keys":[],"required_context_slots":[]}'::jsonb,
  '6b6b4e45-4699-4860-8dea-d8a60e07d69a'::uuid,
  true,
  true,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
  '{"side":"client","code_ref":"matrx-frontend/features/marketing/components/backlinks/backlinks-assists-producer.ts:BACKLINK_ASSISTANT_SLOT","pin_style":"floating"}'::jsonb,
  'public'
where not exists (
  select 1
  from agent.slot_definition
  where slot_key = 'seo.backlink_assistant'
    and deleted_at is null
);
