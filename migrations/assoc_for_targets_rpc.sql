-- assoc_for_targets — batch read for the unified association edge.
--
-- The set-read counterpart of public.assoc_for_entity: returns every edge
-- pointing AT any of the given targets (INCOMING edges) in ONE round-trip, so a
-- caller can load the members of MANY containers at once — e.g. a War Room room
-- plus all of its threads — without N per-entity round-trips.
--
-- platform.associations is NOT PostgREST-exposed, so this SECURITY DEFINER bridge
-- in `public` is the only path the browser client has to read it. org-filtered by
-- iam.has_org_access(org_id), identical to the rest of the assoc_* family
-- (assoc_add / assoc_remove / assoc_for_entity / assoc_set_targets).
--
-- Idempotent (CREATE OR REPLACE). Additive — touches no existing function.

create or replace function public.assoc_for_targets(
  p_target_type text,
  p_target_ids  uuid[]
)
returns table(
  id          uuid,
  target_id   uuid,
  source_type text,
  source_id   uuid,
  label       text,
  metadata    jsonb,
  org_id      uuid,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select a.id, a.target_id, a.source_type, a.source_id,
         a.label, a.metadata, a.org_id, a.created_at
    from platform.associations a
   where a.target_type = p_target_type
     and a.target_id = any(coalesce(p_target_ids, '{}'::uuid[]))
     and iam.has_org_access(a.org_id);
$function$;

grant execute on function public.assoc_for_targets(text, uuid[]) to authenticated;
