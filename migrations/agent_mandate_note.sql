-- ============================================================================
-- MANDATE NOTES — the admin's observations about the AI doing a job.
--
-- Arman, 2026-08-25: "wherever we have agents running like this that are based
-- on a mandate, I want to be able to add notes and observations for that
-- mandate and agent who's handling that … we store the text and then the date
-- and time and who did it … so that later, when we're reviewing mandates, we
-- have that information available to us."
--
-- REUSE CHECK (done before creating anything):
--   * `agent.mandate_exemplar` — captured OUTPUTS of a mandate run (a golden
--     example, with the agent + variables that produced it). It stores what the
--     machine said, not what a human thinks about it, and its rows are consumed
--     as few-shot evidence. Overloading it with human commentary would poison
--     an exemplar store. NOT extended.
--   * `chat.observational_memory` — LLM-generated, per-conversation, machine
--     owned. Different author, different lifecycle. NOT extended.
--   * `agent.review_queue` — reviewable UI registrations + their feedback,
--     keyed by domain/repo. That is a WORK queue about things agents BUILT;
--     this is commentary about a job an agent PERFORMS. NOT extended.
--   * `platform.associations` — an edge, not a body of text with an author.
--
-- The note follows the MANDATE (the job), not the agent bound to it today and
-- not the run it was written during: a mandate outlives every binding, and
-- review time is mandate-shaped. The surface it was written on and the agent
-- that was actually holding the mandate at the time are recorded ALONGSIDE as
-- context, so a note can always answer "where was I and who was running it".
--
-- SoR: common-docs/systems/agents/mandates/FEATURE.md
-- ============================================================================

select platform.create_entity_table(
  p_schema     => 'agent',
  p_table      => 'mandate_note',
  p_token      => 'agent_mandate_note',
  p_label      => 'Mandate Note',
  p_fields     => array[
    'mandate_id uuid NOT NULL REFERENCES agent.mandate(id) ON DELETE CASCADE',
    'body text NOT NULL',
    'note_kind text NOT NULL DEFAULT ''observation''',
    'surface_name text',
    'observed_agent_id uuid REFERENCES agent.definition(id)',
    'observed_agent_version_id uuid REFERENCES agent.definition_version(id)',
    'conversation_id uuid'
  ],
  p_variant    => 'entity',
  p_versioned  => false,
  p_soft_delete=> true,
  p_visibility => 'internal',
  p_category   => false,
  p_listed     => false,
  p_org_default=> true,
  p_gin_jsonb  => false
);

alter table agent.mandate_note
  -- A FIXED, code-level vocabulary (§0.4): these four are the whole set the
  -- composer offers, and a fifth would be a code change, not admin data entry.
  add constraint mandate_note_kind_check
    check (note_kind in ('observation', 'issue', 'idea', 'praise')),
  -- An empty note is not feedback. The UI refuses it too; this is the wall.
  add constraint mandate_note_body_not_blank
    check (length(btrim(body)) > 0);

create index mandate_note_mandate_idx
  on agent.mandate_note (mandate_id, created_at desc)
  where deleted_at is null;
create index mandate_note_author_idx
  on agent.mandate_note (created_by, created_at desc)
  where deleted_at is null;
create index mandate_note_surface_idx
  on agent.mandate_note (surface_name)
  where deleted_at is null and surface_name is not null;

comment on table agent.mandate_note is
  'Human observations about a MANDATE — free text plus who wrote it and when, captured at the moment the job ran and read back at mandate-review time. `surface_name` and `observed_agent_id` record where it was written and which agent was holding the mandate then; both are context, never identity. Notes are NOT exemplars (agent.mandate_exemplar) and are never fed to an agent implicitly.';
comment on column agent.mandate_note.body is
  'The note, as typed. Plain text.';
comment on column agent.mandate_note.note_kind is
  'observation | issue | idea | praise — a fixed code-level vocabulary; the composer offers exactly these.';
comment on column agent.mandate_note.surface_name is
  'ui_surface.name the note was written from (e.g. matrx-admin/marketing-run-console). NULL when written from the mandate console itself.';
comment on column agent.mandate_note.observed_agent_id is
  'The agent that was resolved as the mandate holder when the note was written. Context for review — the pin may have moved since.';
