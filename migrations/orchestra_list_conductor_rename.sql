-- orchestra_list(): rename the two retired-vocabulary output columns.
--   orchestrator_id -> conductor_id   (Orchestrator was renamed to Conductor, ruled 2026-08-16)
--   set_label       -> label          ("agent set" was renamed to Orchestra)
--
-- TRANSITIONAL, BY DESIGN (vocabulary Law 4c -- a DB rename must never outrun
-- the deploy). The old names are returned ALONGSIDE the new ones for exactly one
-- release cycle, because production runs a build that still reads
-- `orchestrator_id`/`set_label`; dropping them now would break the live
-- Orchestras list the moment this migration applies.
--
-- DROP THE TWO LEGACY COLUMNS once a build containing `conductor_id`/`label`
-- (matrx-frontend features/agents/orchestras/) is deployed to all three Vercel
-- projects. Tracked in matrx-frontend FOUND_DEFECTS.md.
--
-- Idempotent: CREATE OR REPLACE cannot change a RETURNS TABLE signature, so the
-- function is dropped and recreated.
drop function if exists public.orchestra_list();

create function public.orchestra_list()
returns table(
  conductor_id    uuid,
  -- LEGACY, drop after deploy (see header)
  orchestrator_id uuid,
  name            text,
  description     text,
  label           text,
  -- LEGACY, drop after deploy (see header)
  set_label       text,
  metadata        jsonb,
  member_count    integer,
  created_at      timestamp with time zone,
  updated_at      timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
as $function$
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
    and iam.has_org_access(s.organization_id)
  order by updated_at desc;
$function$;
