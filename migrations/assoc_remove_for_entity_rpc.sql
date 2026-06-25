-- assoc_remove_for_entity — purge EVERY edge touching one entity (both directions).
--
-- The deletion counterpart of assoc_for_entity: removes every `platform.associations`
-- edge where the entity is the source OR the target. Called when an entity is
-- deleted (e.g. a War Room thread/room soft-delete) so no edge is left orphaned —
-- a dangling `thread → war_room` membership edge would otherwise surface a deleted
-- thread as a live member once room membership reads move off `session_id` onto the
-- edge ("no edge = unassigned").
--
-- platform.associations is NOT PostgREST-exposed, so this SECURITY DEFINER bridge
-- in `public` is the only path the browser client has. org-filtered by
-- iam.has_org_access(org_id), identical to the rest of the assoc_* family.
--
-- Idempotent (CREATE OR REPLACE). Additive — touches no existing function.

create or replace function public.assoc_remove_for_entity(
  p_type text,
  p_id   uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from platform.associations
   where ((source_type = p_type and source_id = p_id)
          or (target_type = p_type and target_id = p_id))
     and iam.has_org_access(org_id);
end
$function$;

grant execute on function public.assoc_remove_for_entity(text, uuid) to authenticated;
