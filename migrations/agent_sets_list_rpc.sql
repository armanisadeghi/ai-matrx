-- Agent Sets (Orchestrators) — enumeration RPC.
--
-- An "Agent Set" is an orchestrator agent (agent.definition row) that presides
-- over member agents. The relationship is modeled ENTIRELY on the canonical
-- platform.associations edge — NO new table:
--
--   • Set marker  : a self-edge  (agent:X) --role 'matrx_set'--> (agent:X)
--                   carries set-level config in metadata (accent, tagline,
--                   saved canvas layout) and lets an empty set persist.
--   • Membership  : edges        (agent:X) --role 'member'----> (agent:Y)
--                   ordered by position; per-member "gap it fills" + role
--                   title live in metadata.
--
-- Writes go through the existing canonical chokepoint (assoc_add / assoc_remove
-- / assoc_set_targets). This adds ONLY the read that the family lacks: enumerate
-- every set the caller can see (the entity-scoped assoc_for_* RPCs can't list
-- "all sources of role X in my org"). Mirrors assoc_for_sources exactly:
-- STABLE SECURITY DEFINER, org-gated by iam.has_org_access.
--
-- Idempotent (CREATE OR REPLACE). Re-applying is safe.

create or replace function public.agent_set_list()
returns table (
  orchestrator_id uuid,
  name            text,
  description     text,
  set_label       text,
  metadata        jsonb,
  member_count    integer,
  created_at      timestamptz,
  updated_at      timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    s.source_id                                              as orchestrator_id,
    d.name,
    d.description,
    s.label                                                  as set_label,
    coalesce(s.metadata, '{}'::jsonb)                        as metadata,
    coalesce(m.cnt, 0)::int                                  as member_count,
    s.created_at,
    greatest(s.created_at, coalesce(m.last_at, s.created_at)) as updated_at
  from platform.associations s
  join agent.definition d on d.id = s.source_id
  left join lateral (
    select count(*) as cnt, max(a.created_at) as last_at
      from platform.associations a
     where a.source_type = 'agent'
       and a.source_id   = s.source_id
       and a.target_type = 'agent'
       and a.role        = 'member'
  ) m on true
  where s.source_type = 'agent'
    and s.target_type = 'agent'
    and s.source_id   = s.target_id        -- the 'matrx_set' self-edge marker
    and s.role        = 'matrx_set'
    and d.deleted_at is null
    and iam.has_org_access(s.organization_id)
  order by updated_at desc;
$function$;

grant execute on function public.agent_set_list() to authenticated;
