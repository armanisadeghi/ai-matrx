-- assoc_for_sources — batch read BY SOURCE for the unified association edge.
--
-- The source-side counterpart of public.assoc_for_targets: returns every edge
-- whose SOURCE is one of the given source ids (OUTGOING edges) in ONE round-trip,
-- so a caller can load the targets of MANY sources at once — e.g. the scope tags
-- of every visible note/task/project row — without N per-entity round-trips
-- (assoc_for_entity). Optional p_target_type pushes the target filter (e.g.
-- 'scope') into the DB so the payload stays tight.
--
-- platform.associations is NOT PostgREST-exposed, so this SECURITY DEFINER bridge
-- in `public` is the only path the browser client has to read it. org-filtered by
-- iam.has_org_access(org_id), identical to the rest of the assoc_* family
-- (assoc_add / assoc_remove / assoc_for_entity / assoc_for_targets /
-- assoc_set_targets / assoc_remove_for_entity).
--
-- Each row carries `source_id` so callers can group results back by source.
--
-- Idempotent (CREATE OR REPLACE). Additive — touches no existing function.

create or replace function public.assoc_for_sources(
  p_source_type text,
  p_source_ids  uuid[],
  p_target_type text default null
)
returns table(
  id              uuid,
  source_id       uuid,
  target_type     text,
  target_id       uuid,
  label           text,
  metadata        jsonb,
  organization_id uuid,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select a.id, a.source_id, a.target_type, a.target_id,
         a.label, a.metadata, a.organization_id, a.created_at
    from platform.associations a
   where a.source_type = p_source_type
     and a.source_id = any(coalesce(p_source_ids, '{}'::uuid[]))
     and (p_target_type is null or a.target_type = p_target_type)
     and iam.has_org_access(a.organization_id);
$function$;

revoke all on function public.assoc_for_sources(text, uuid[], text) from public;
grant execute on function public.assoc_for_sources(text, uuid[], text) to authenticated;
