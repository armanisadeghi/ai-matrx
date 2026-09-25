-- lane PARITY-NIGHTLY (2026-09-25) — the standing context-parity guard, seeded as a system job SWITCHED OFF.
--
-- What it is: aidream `context_parity_nightly`
-- (aidream/services/conversation_context/parity_nightly.py, registered in
-- aidream/services/scheduling/system_task_runner.py). Two labeled checks each run:
--   seat — the every-type compare as admin@admin.com and test@test.com through the real doors;
--   raw  — the store copy against the old scope tables over the context follow's privileged
--          connection (read only, NOT the door) for EVERY copied organization.
-- One ops.system_error row (kind context_parity) per (organization, scope type, check),
-- deduplicated across runs and resolved at 0; a run that could not happen is its own row.
--
-- Cadence pre-filled: 02:15 America/Los_Angeles every night (inside the 1–4 AM PT maintenance
-- window, Arman 2026-09-21). SWITCHED OFF (`enabled=false` + `handler_gate_pending` on task and
-- trigger) per common-docs/policies/no-unapproved-schedules.md: the owner turns it on with one
-- click at /administration/automation/scheduling/system-jobs. next_due_at is left NULL on purpose:
-- the enable computes the first fire from the cron (admin.patch_system_task), so a switch flipped
-- at 3 PM does not fire a stale seed time at 3 PM.
--
-- Additive only: two new rows (+ the sch_agent_task carrier) under a brand-new id (…973, checked
-- free against system_task_runner constants and the live table). No lock beyond row inserts.

set local lock_timeout = '30s';

insert into scheduler.sch_task (
    id, user_id, kind, title, description, queue, surfaces, enabled,
    tags, metadata, taxonomy_node_id, organization_id, created_by, updated_by, visibility
) values (
    'a7c1e2d3-0000-4e5f-9a00-000000000973',
    '4cf62e4e-2679-484f-b652-034e697418df',
    'tool',
    'Context parity guard (nightly)',
    'Nightly in the maintenance window: checks that the record store hands agents the same context as the current scope system. Seat parity runs the inspector''s every-type compare as the two test accounts through the real doors; raw copy parity compares the store''s copy with the older scope tables for every copied organization over the context follow''s own read-only connection. Each defect is one row per organization, scope type and check in System errors (kind context_parity), updated each night and closed the first night it measures zero. Read-only: it never re-copies anything.',
    'default',
    array['server']::text[],
    false,
    array['system', 'context-parity', 'data-doctrine', 'diagnostics']::text[],
    '{"handler_gate_pending": true}'::jsonb,
    '413e7d19-c404-44c7-bf2d-04b75e19b319',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    '4cf62e4e-2679-484f-b652-034e697418df',
    '4cf62e4e-2679-484f-b652-034e697418df',
    'internal'
)
on conflict (id) do update set deleted_at = null, updated_at = now();  -- a re-apply after the inverse restores the archived row; never touches `enabled`

insert into scheduler.sch_agent_task (
    id, agent_id, prompt, variables, auth_mode, max_runtime_seconds, max_concurrent
) values (
    'a7c1e2d3-0000-4e5f-9a00-000000000973',
    null,
    'Run the context parity guard (registered deterministic system task; no agent prompt).',
    jsonb_build_object('tool_name', 'context_parity_nightly', 'args', '{}'::jsonb),
    'auto',
    1800,
    1
)
on conflict (id) do nothing;

insert into scheduler.sch_trigger (
    id, task_id, user_id, type, config, enabled, next_due_at,
    metadata, organization_id, created_by, updated_by
) values (
    'b7c1e2d3-0000-4e5f-9a00-000000000973',
    'a7c1e2d3-0000-4e5f-9a00-000000000973',
    '4cf62e4e-2679-484f-b652-034e697418df',
    'cron',
    jsonb_build_object('expression', '15 2 * * *', 'tz', 'America/Los_Angeles'),
    false,
    null,
    '{"handler_gate_pending": true}'::jsonb,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    '4cf62e4e-2679-484f-b652-034e697418df',
    '4cf62e4e-2679-484f-b652-034e697418df'
)
on conflict (id) do update set deleted_at = null, updated_at = now();
