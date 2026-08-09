-- Seed the two assist-producer agent slots — the launch_agent chips on
-- /notes (unorganized-notes pileup) and /tasks (overdue pileup) resolve
-- these at click time, so the agent behind each chip is swappable from the
-- admin slots console with no deploy.
--
-- Both default to the General Chat agent until a purpose-built agent is
-- bound. Idempotent: skips any live slot_key that already exists.
--
-- Consumers:
--   features/notes/notes-assists-producer.ts  (NOTES_ORGANIZER_SLOT)
--   features/tasks/tasks-assists-producer.ts  (TASK_TRIAGE_SLOT)

insert into agent.slot_definition
  (slot_key, label, description, contract, default_agent_id, use_latest,
   is_enabled, organization_id, metadata, visibility)
select
  v.slot_key,
  v.label,
  v.description,
  '{"required_variables":[],"required_output_keys":[],"required_context_slots":[]}'::jsonb,
  '6b6b4e45-4699-4860-8dea-d8a60e07d69a'::uuid, -- General Chat (default new-chat agent)
  true,
  true,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, -- platform org (same as sibling slots)
  v.metadata::jsonb,
  'public'
from (values
  (
    'notes.organizer',
    'Notes Organizer',
    'Helps the user organize a pileup of untagged notes (launched from the /notes assist chip). Default is the General Chat agent — swap in a purpose-built organizer here anytime.',
    '{"side":"client","code_ref":"matrx-frontend/features/notes/notes-assists-producer.ts:NOTES_ORGANIZER_SLOT","pin_style":"floating"}'
  ),
  (
    'tasks.triage_assistant',
    'Task Triage Assistant',
    'Helps the user triage an overdue-task pileup (launched from the /tasks assist chip). Default is the General Chat agent — swap in a purpose-built triage agent here anytime.',
    '{"side":"client","code_ref":"matrx-frontend/features/tasks/tasks-assists-producer.ts:TASK_TRIAGE_SLOT","pin_style":"floating"}'
  )
) as v(slot_key, label, description, metadata)
where not exists (
  select 1
  from agent.slot_definition d
  where d.slot_key = v.slot_key
    and d.deleted_at is null
);
