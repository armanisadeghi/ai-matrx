-- Workflow Runtime UI Phase 2 — the Run Surface config store (ruling R1).
--
-- THE SHOW, stored beside neither the server nor the graph: what the user sees
-- when a workflow runs. One row = one authored surface for one workflow
-- definition — its grid (Grafana model: 24 columns, {x,y,w,h} placements with
-- vertical compaction), its readouts (source binding + display mode + trigger
-- point visibility), and its pages. The CONFIG document's shape is owned by
-- matrx-frontend `features/workflow-runtime/surface/config.ts` and carries its
-- own `schema_version` for migration; the DB stays payload-blind on purpose —
-- the builder and the AI author write THE SAME document (ruling R6), and a
-- declared TS contract + one write path beats a hundred columns.
--
-- 🚨 NEVER move this config into workflow.definition node `data` — node data
-- feeds `definition_hash`, so presentation churn would bust idempotency replay
-- and recovery pins (the exact reason node_data_slot exists; see aidream
-- migration 0022's rationale).
--
-- R9: a workflow has MULTIPLE surfaces — audience variants (consumer/creator)
-- and display profiles (full / compact-for-embedding / summary). The parent
-- workflow's readout renders the child's compact profile when a workflow runs
-- as a node inside another.
--
-- Consumers: matrx-frontend features/workflow-runtime/surface/ (the ONE
-- reader/writer, direct supabase-js per the FE data-flow doctrine).

do $$
begin
  if to_regclass('workflow.runtime_surface') is null then
    perform platform.create_entity_table(
      p_schema => 'workflow', p_table => 'runtime_surface',
      p_token => 'workflow_runtime_surface',
      p_label => 'Run Surface',
      p_fields => ARRAY[
        'definition_id uuid NOT NULL REFERENCES workflow.definition(id) ON DELETE CASCADE',
        $f$name text NOT NULL DEFAULT 'Default' CHECK (btrim(name) <> '')$f$,
        $f$audience text NOT NULL DEFAULT 'consumer' CHECK (audience IN ('consumer','creator'))$f$,
        $f$profile text NOT NULL DEFAULT 'full' CHECK (profile IN ('full','compact','summary'))$f$,
        'is_default boolean NOT NULL DEFAULT false',
        'schema_version integer NOT NULL DEFAULT 1',
        $f$config jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true,
      p_visibility => 'internal', p_category => false, p_listed => true,
      p_org_default => true, p_gin_jsonb => false);
  end if;
end $$;

-- ONE default surface per (definition, audience, profile). Partial on
-- deleted_at so a trashed default frees the slot.
create unique index if not exists runtime_surface_default_uq
  on workflow.runtime_surface (definition_id, audience, profile)
  where is_default and deleted_at is null;

-- The read every run page makes: "surfaces for this definition".
create index if not exists runtime_surface_definition_idx
  on workflow.runtime_surface (definition_id)
  where deleted_at is null;

-- API-role grants (create_entity_table grants nothing to PostgREST roles).
grant select, insert, update, delete on workflow.runtime_surface to authenticated;
grant select, insert, update, delete on workflow.runtime_surface to service_role;
