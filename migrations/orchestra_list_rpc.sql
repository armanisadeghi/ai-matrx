-- Agent Sets -> Orchestras rename (2026-08-15, Arman's ruling).
--
-- orchestra_list() replaces agent_set_list(). It matches BOTH marker roles so it
-- is correct before and after the platform.associations row migration; the
-- legacy 'matrx_set' arm is dropped once no such rows remain.
--
-- APPLIED LIVE via Supabase MCP on 2026-08-15. This file is the record.
CREATE OR REPLACE FUNCTION public.orchestra_list()
 RETURNS TABLE(orchestrator_id uuid, name text, description text, set_label text, metadata jsonb, member_count integer, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.source_id                                              as orchestrator_id,
    d.name,
    d.description,
    s.label                                                  as set_label,
    coalesce(s.metadata, '{}'::jsonb)                        as metadata,
    coalesce(m.cnt, 0)::int                                  as member_count,
    s.created_at,
    greatest(s.created_at, coalesce(m.last_at, s.created_at)) as updated_at
  from platform.associations_live s
  join agent.definition d on d.id = s.source_id
  left join lateral (
    select count(*) as cnt, max(a.created_at) as last_at
      from platform.associations_live a
     where a.source_type = 'agent'
       and a.source_id   = s.source_id
       and a.target_type = 'agent'
       and a.role        = 'member'
  ) m on true
  where s.source_type = 'agent'
    and s.target_type = 'agent'
    and s.source_id   = s.target_id
    and s.role        in ('orchestra', 'matrx_set')
    and d.deleted_at is null
    and iam.has_org_access(s.organization_id)
  order by updated_at desc;
$function$;

REVOKE ALL ON FUNCTION public.orchestra_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.orchestra_list() TO authenticated;
