-- HR-360: communication.meet_policy_for gets a 3-argument form for "before a meeting exists"
-- lane: HR-360
--
-- The 5-argument door reads p_profile NULL as "the host's own profile" and p_meeting_id NULL as
-- "no meeting yet", but generated types make every argument a required string, so the one caller
-- that has no meeting (features/meet/hooks/useMeetDefaults.ts) could only reach it by casting null.
-- This form names exactly that case. Same rights (SECURITY INVOKER, authenticated EXECUTE), same
-- answer: it is the 5-argument door with both NULLs. Inverse:
-- migrations/inverse/hr360_meet_policy_for_before_a_meeting_exists_down.sql.

create function communication.meet_policy_for(p_organization_id uuid, p_host_user_id uuid, p_key text)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public'
as $function$
  -- A meeting not yet scheduled: no meeting row, and the host's own behavior profile.
  select communication.meet_policy_for(p_organization_id, p_host_user_id, null::text, null::uuid, p_key);
$function$;

grant execute on function communication.meet_policy_for(uuid, uuid, text) to authenticated, service_role;
