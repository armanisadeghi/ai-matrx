-- lane: DEFAULT-ORG-3
-- additive: yes
--
-- THE SECOND HALF OF THE CREATOR-HANDLE DOOR: the EXECUTE grant, after the door row.
--
-- migrations/campaign/dorg3_three_doors_name_the_organization_they_act_in.sql created the
-- three-argument public.creator_claim_handle and declared it in platform.client_callable_door,
-- in that order and in one transaction. `platform.enforce_definer_client_grants` fires ON the
-- grant, and at that moment the door row did not exist yet, so it took the client EXECUTE back
-- and said so, by name, at warning severity:
--
--   ddl_guard[definer_client_grant_revoked]: Client EXECUTE (public/anon/authenticated) was
--   REVOKED from creator_claim_handle(text,text,uuid) ... declare the door in the SAME
--   migration, BEFORE the grant ... then re-issue the GRANT.
--
-- The door row is in place now, so this re-issues the grant and it sticks. Without it the
-- creator dashboard's claim call returns 42501 for every signed-in user the moment the client
-- starts passing the acting organization -- a dead control, which is the one thing a screen
-- may never be.
--
-- Signed-in callers only. The function's own subject is auth.uid(), and p_organization_id is
-- checked with iam.has_org_access before it is used at all. Anonymous callers get nothing:
-- the door row carries anonymous_callers = false, which is the flag both DDL guards read.
--
-- ADDITIVE: one GRANT to `authenticated` on a function created hours ago by this same lane.
-- Nothing is dropped, revoked, renamed or rewritten.
--
-- Inverse: migrations/inverse/dorg3_the_creator_handle_door_opens_to_signed_in_callers.inverse.sql

set local lock_timeout = '2s';

grant execute on function public.creator_claim_handle(text, text, uuid) to authenticated;

do $$
begin
  if not has_function_privilege('authenticated', 'public.creator_claim_handle(text, text, uuid)', 'execute') then
    raise exception 'the grant did not stick: authenticated still cannot execute public.creator_claim_handle(text, text, uuid). The door row in platform.client_callable_door is what makes it stick -- check that it is there before this statement runs.';
  end if;
end $$;
