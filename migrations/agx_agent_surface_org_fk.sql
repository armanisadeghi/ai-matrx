-- Restore the foreign key from agent.agent_surface.organization_id to
-- public.organizations(id).
--
-- The 2026 schema-reorg dropped this FK while its sibling
-- (agx_agent_surface_agent_id_fkey -> agent.definition) survived. Without it,
-- PostgREST cannot resolve the `organization:organizations(...)` embed used by
-- the surface-bound-agents menu on the /chat hot path, throwing
-- PGRST200 ("Could not find a relationship between 'agent_surface' and
-- 'organizations'") and breaking the whole menu fetch.
--
-- Verified clean before applying: 26 org-scoped rows, 0 orphans.
-- Idempotent: guarded so re-applying a drifted file is safe.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agx_agent_surface_organization_id_fkey'
      and conrelid = 'agent.agent_surface'::regclass
  ) then
    alter table agent.agent_surface
      add constraint agx_agent_surface_organization_id_fkey
      foreign key (organization_id)
      references public.organizations (id)
      on delete cascade;
  end if;
end $$;

-- Refresh PostgREST's schema cache so the new relationship is embeddable now.
notify pgrst, 'reload schema';
