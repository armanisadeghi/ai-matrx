-- Bind the two assist-producer slots to their purpose-built agents.
--
-- The slots were seeded (agent_slots_assist_producers_seed.sql) pointing at
-- the General Chat agent as a placeholder. These are the real ones, authored
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
-- Idempotent: re-running re-asserts the same binding. Swapping either agent
-- later is a slots-console change, not a migration.
--
-- Consumers:
--   features/notes/notes-assists-producer.ts  (NOTES_ORGANIZER_SLOT)
--   features/tasks/tasks-assists-producer.ts  (TASK_TRIAGE_SLOT)

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
