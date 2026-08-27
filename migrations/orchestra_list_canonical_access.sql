-- migrations/orchestra_list_canonical_access.sql
--
-- ORCHESTRAS FOR THE PLATFORM'S OWN AGENTS (2026-08-26)
--
-- `orchestra_list` gated visibility on `iam.has_org_access(edge.organization_id)`
-- — membership in the org the EDGE is stamped with. That is the one rule THE
-- VIEW LAW says never to use: access must not depend on which organization a
-- record happens to sit in (docs/official/db-rules.md §6).
--
-- The concrete failure: builtin agents live in the "Matrx System" org, which no
-- human is a member of. A Matrx admin can read and EDIT every builtin
-- (iam.has_access resolves the platform-global tier), and `assoc_add` therefore
-- lets them create the `orchestra` self-edge on one — but this reader would
-- never return it. A system Orchestra could be created and was invisible the
-- instant it existed, which is indistinguishable from "you cannot create one".
--
-- The fix is the canonical rule, not a special case: you see an Orchestra when
-- you can see its CONDUCTOR. `iam.has_access` already resolves ownership,
-- explicit grants, org membership AND the platform-global tier in one place, so
-- this both admits system Orchestras and stops org-stamping from deciding
-- visibility for everyone else. Verified live before applying: for a Matrx
-- admin the new predicate returns a superset of the old one (3 vs 2 of 12) —
-- nothing that was visible stops being visible.
--
-- Idempotent: CREATE OR REPLACE only.

CREATE OR REPLACE FUNCTION public.orchestra_list()
 RETURNS TABLE(conductor_id uuid, orchestrator_id uuid, name text, description text, label text, set_label text, metadata jsonb, member_count integer, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.source_id                                              as conductor_id,
    s.source_id                                              as orchestrator_id,
    d.name,
    d.description,
    s.label                                                  as label,
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
    and s.role        = 'orchestra'
    and d.deleted_at is null
    -- You see an Orchestra when you can see its conductor. NEVER
    -- has_org_access(edge org): builtins sit in the Matrx System org, which
    -- nobody is a member of, and access must not depend on the active org.
    and iam.has_access('agent', s.source_id, 'viewer'::public.permission_level)
  order by updated_at desc;
$function$;
