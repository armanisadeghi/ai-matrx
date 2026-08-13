-- Bind the two assist-producer slots to their purpose-built agents.
--
-- The slots were first seeded (agent_slots_assist_producers_seed.sql) pointing
-- at the General Chat agent as a placeholder. These are the real ones, authored
-- through the platform agent builder with the `data` / `data_action` tools so
-- they act AS the user under row-level security:
--
--   notes.organizer        -> Notes Organizer         (4c704248-…)
--   tasks.triage_assistant -> Task Triage Assistant   (45131175-…)
--
-- Both stay FLOATING (use_latest = true) — the client-side slot resolver
-- (features/agents/slots/service.ts) refuses a version-pinned client slot,
-- and the chips resolve these in the browser.
--
-- ORDER-INDEPENDENT ON PURPOSE. This filename sorts BEFORE the seed's, so a
-- batch applier replaying both from scratch would run this one first. A plain
-- UPDATE would silently match zero rows and the seed would then install the
-- General Chat placeholder this migration exists to retire. So this upserts:
-- it creates the slot already correctly bound when absent, and the seed's own
-- `where not exists` guard then skips it. Either order converges on the same
-- end state.
--
-- Idempotent: re-running re-asserts the same binding. Swapping either agent
-- later is a slots-console change, not a migration.
--
-- Consumers:
--   features/notes/notes-assists-producer.ts  (NOTES_ORGANIZER_SLOT)
--   features/tasks/tasks-assists-producer.ts  (TASK_TRIAGE_SLOT)

-- 1. Create either slot that does not exist yet, already bound correctly.
insert into agent.slot_definition
  (slot_key, label, description, contract, default_agent_id, use_latest,
   is_enabled, organization_id, metadata, visibility)
select
  v.slot_key,
  v.label,
  v.description,
  '{"required_variables":[],"required_output_keys":[],"required_context_slots":[]}'::jsonb,
  v.agent_id::uuid,
  true,
  true,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, -- platform org (same as sibling slots)
  v.metadata::jsonb,
  'public'
from (values
  (
    'notes.organizer',
    'Notes Organizer',
    'Reads a pileup of loose notes, proposes a grouping, and files them once the user agrees (launched from the /notes assist chip).',
    '4c704248-17a7-4021-98d0-e7b44987c421',
    '{"side":"client","code_ref":"matrx-frontend/features/notes/notes-assists-producer.ts:NOTES_ORGANIZER_SLOT","pin_style":"floating"}'
  ),
  (
    'tasks.triage_assistant',
    'Task Triage Assistant',
    'Reads the live overdue backlog, proposes a triage plan, and applies only what the user approves (launched from the /tasks assist chip).',
    '45131175-7bbb-4e9c-b2f1-74164ddcb271',
    '{"side":"client","code_ref":"matrx-frontend/features/tasks/tasks-assists-producer.ts:TASK_TRIAGE_SLOT","pin_style":"floating"}'
  )
) as v(slot_key, label, description, agent_id, metadata)
where not exists (
  select 1
  from agent.slot_definition d
  where d.slot_key = v.slot_key
    and d.deleted_at is null
);

-- 2. Re-point either slot that already exists (the normal path: the seed ran
--    first and installed the placeholder).
update agent.slot_definition
set default_agent_id = '4c704248-17a7-4021-98d0-e7b44987c421'::uuid,
    default_agent_version_id = null,
    use_latest = true,
    is_enabled = true
where slot_key = 'notes.organizer'
  and deleted_at is null;

update agent.slot_definition
set default_agent_id = '45131175-7bbb-4e9c-b2f1-74164ddcb271'::uuid,
    default_agent_version_id = null,
    use_latest = true,
    is_enabled = true
where slot_key = 'tasks.triage_assistant'
  and deleted_at is null;
