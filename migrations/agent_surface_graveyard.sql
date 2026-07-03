-- =============================================================================
-- agent_surface_graveyard.sql  (STAGE 3 — GATED, DO NOT APPLY YET)
--
-- migrate: skip: gated — retire agent.agent_surface only AFTER the FE deploy has
-- soaked and every remaining reader below is repointed + verified live.
--
-- Retires the now-dormant agent.agent_surface (reversible SET SCHEMA, zero data
-- loss). Apply ONLY when ALL of these hold:
--   1. The FE binding cutover (Stage 1 + Stage 2 + the association-backed
--      agent-surface-bindings.service.ts) has deployed and soaked.
--   2. These remaining agent_surface READERS are repointed to associations /
--      agent.menu_surface and verified live (they are admin/maintenance surfaces,
--      off the binding hot path, so they intentionally lag to Stage 3):
--        • features/surfaces/services/surfaces.service.ts
--            - listSurfacesWithStats()  (agentCount per surface)   ~line 58
--            - getSurfaceUsage()         (agents on a surface)      ~line 307
--            - listAgentBindings()       (bindings for a surface)   ~line 468
--          → count via `assoc_for_targets('surface', [surfaceIds])` grouped by
--            target, or read agent.menu_surface.
--        • features/surfaces/services/manifest-sync.service.ts
--            - scans/repairs agent_surface.value_mappings → operate on
--              platform.associations.metadata->'value_mappings' instead.
--        • app/api/admin/surfaces/remediate-mapping/route.ts
--            - writes agent_surface.value_mappings (admin client) → write the
--              association edge metadata (or an assoc_* admin path).
--   2b. Resolve the binding-scope-tagging in AgentSurfacesPanel.tsx — it calls
--       setEntityScopes({ entityType: 'agent_surface_binding', entityId: binding.id }),
--       but binding.id is now the ASSOCIATION id. Before de-registering the
--       'agent_surface_binding' token below, either repoint that scope-tagging to
--       tag the SURFACE (target) / AGENT (source) directly, or drop it. Leaving
--       the token registered but pointing at a graveyarded table also works short
--       term — if so, DELETE the two de-register statements below.
--   3. `select count(*)` confirms nothing reads agent.agent_surface (Postgres
--      deps: `select audit.table_impact('agent','agent_surface')` shows no live
--      fn/view still bound to it — menu_surface + create_shortcut already moved).
--
-- Reversible: `alter table graveyard.agent_surface set schema agent;` restores it.
-- =============================================================================

do $$
begin
  if to_regclass('agent.agent_surface') is null then
    raise notice 'agent.agent_surface already retired';
    return;
  end if;

  -- De-register the legacy binding-row entity token (the ROW is no longer a
  -- first-class entity; the agent→surface EDGE is the canonical relationship).
  delete from platform.entity_relationships where child_type = 'agent_surface_binding';
  delete from platform.entity_types      where token       = 'agent_surface_binding';

  -- Reversible retirement.
  alter table agent.agent_surface set schema graveyard;

  insert into platform.deprecated_relations (old_ref, new_ref, reason, archived_as)
  values (
    'agent.agent_surface',
    'platform.associations (source=agent → target=surface)',
    'agent↔surface binding canonicalized onto platform.associations (agent_surface_to_associations.sql)',
    'graveyard.agent_surface'
  )
  on conflict do nothing;

  raise notice 'agent.agent_surface retired to graveyard';
end $$;
