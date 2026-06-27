-- container_fk_indexes: index the container scoping columns (organization_id /
-- project_id / task_id) that were missing one.
--
-- These columns are how almost every resource is scoped to an org / project /
-- task. They're filtered by `container_resource_counts` (the inventory RPC) and
-- by countless other "things in this container" queries across the app, but a
-- chunk of them had no index → sequential scans. The inventory RPC counts them
-- in series, so a missing index there is felt more than in the old parallel FE
-- fan-out; indexing also speeds every other scoping query on these tables.
--
-- Partial (`WHERE col IS NOT NULL`): most rows are personal (null org/project/
-- task), so a partial index stays small and still serves `WHERE col = $1`
-- (the bound value is always non-null). Idempotent (IF NOT EXISTS). All target
-- tables are small today (<1k rows) so a plain build is instant; no CONCURRENTLY
-- needed. Only (table,column) pairs that lacked a leading-column index are added.

-- agent.definition / app.definition / skill.definition / workflow.definition
create index if not exists idx_agent_definition_task_id on agent.definition (task_id) where task_id is not null;
create index if not exists idx_app_definition_project_id on app.definition (project_id) where project_id is not null;
create index if not exists idx_app_definition_task_id on app.definition (task_id) where task_id is not null;
create index if not exists idx_skill_definition_task_id on skill.definition (task_id) where task_id is not null;
create index if not exists idx_workflow_definition_task_id on workflow.definition (task_id) where task_id is not null;

-- public.canvas_items
create index if not exists idx_canvas_items_organization_id on public.canvas_items (organization_id) where organization_id is not null;

-- public.content_template
create index if not exists idx_content_template_organization_id on public.content_template (organization_id) where organization_id is not null;
create index if not exists idx_content_template_project_id on public.content_template (project_id) where project_id is not null;

-- public.flashcard_data
create index if not exists idx_flashcard_data_organization_id on public.flashcard_data (organization_id) where organization_id is not null;
create index if not exists idx_flashcard_data_project_id on public.flashcard_data (project_id) where project_id is not null;

-- public.notes
create index if not exists idx_notes_task_id on public.notes (task_id) where task_id is not null;

-- public.quiz_sessions
create index if not exists idx_quiz_sessions_organization_id on public.quiz_sessions (organization_id) where organization_id is not null;
create index if not exists idx_quiz_sessions_project_id on public.quiz_sessions (project_id) where project_id is not null;

-- public.rs_topic
create index if not exists idx_rs_topic_organization_id on public.rs_topic (organization_id) where organization_id is not null;

-- public.sandbox_instances
create index if not exists idx_sandbox_instances_organization_id on public.sandbox_instances (organization_id) where organization_id is not null;
create index if not exists idx_sandbox_instances_task_id on public.sandbox_instances (task_id) where task_id is not null;

-- public.transcripts
create index if not exists idx_transcripts_organization_id on public.transcripts (organization_id) where organization_id is not null;
create index if not exists idx_transcripts_project_id on public.transcripts (project_id) where project_id is not null;
create index if not exists idx_transcripts_task_id on public.transcripts (task_id) where task_id is not null;

-- public.udt_datasets
create index if not exists idx_udt_datasets_organization_id on public.udt_datasets (organization_id) where organization_id is not null;
create index if not exists idx_udt_datasets_project_id on public.udt_datasets (project_id) where project_id is not null;
create index if not exists idx_udt_datasets_task_id on public.udt_datasets (task_id) where task_id is not null;

-- public.udt_picklists
create index if not exists idx_udt_picklists_organization_id on public.udt_picklists (organization_id) where organization_id is not null;

-- public.udt_workbooks
create index if not exists idx_udt_workbooks_project_id on public.udt_workbooks (project_id) where project_id is not null;
create index if not exists idx_udt_workbooks_task_id on public.udt_workbooks (task_id) where task_id is not null;
