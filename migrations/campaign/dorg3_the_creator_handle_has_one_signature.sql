-- lane: DEFAULT-ORG-3
-- additive: no
-- chair-step: it DROPS public.creator_claim_handle(text, text). That is not caution being
--   waived -- it is the repair of a live breakage this lane caused thirty seconds earlier,
--   and leaving it in place is the dangerous option. See below.
--
-- ONE SIGNATURE, BECAUSE TWO OF THEM BROKE THE CALL THAT EXISTS.
--
-- migrations/campaign/dorg3_three_doors_name_the_organization_they_act_in.sql added a THREE-
-- argument public.creator_claim_handle beside the two-argument one, following the AUDIT-ORG
-- precedent of replacing a retired arity rather than dropping it. That precedent does not
-- apply here, and the live catalogue said so immediately:
--
--   select public.creator_claim_handle('x','y');
--   ERROR:  42725  function creator_claim_handle(unknown, unknown) is not unique
--   HINT:   Could not choose a best candidate function.
--
-- Both signatures accept (text, text) -- the three-argument one because p_organization_id
-- carries a DEFAULT -- so every existing call, including the creator dashboard's, became
-- ambiguous. AUDIT-ORG's retired arity had a different argument COUNT with no defaults
-- covering it, so nothing there was ambiguous; that is the whole difference.
--
-- AND THE RETIRED-ARITY REASONING NEVER APPLIED HERE ANYWAY. A two-argument call is not a
-- stale caller doing the wrong thing: it is the NORMAL, CORRECT call for every user who has
-- a profile row, which is every user whose signup provisioned. There is nothing to be loud
-- about. So there is one function, with p_organization_id defaulted, and a two-argument call
-- resolves to it unchanged -- which is also how PostgREST reaches it, by argument NAME.
--
-- WHY THE DROP IS THE SAFE DIRECTION. The campaign's escalation rule is "dropping a function
-- EXISTING app code uses". App code uses the NAME: features/education/creators/service.ts
-- calls sb.rpc("creator_claim_handle", {p_handle, p_display_name, p_organization_id}). After
-- this file that name resolves, unambiguously, to the three-argument function. Before this
-- file it resolves to nothing at all and the creator dashboard is dead. The dangerous change
-- is the one already applied; this is its repair.
--
-- Inverse: migrations/inverse/dorg3_the_creator_handle_has_one_signature.inverse.sql
-- Proof:   scripts/campaign-tests/dorg3_acting_organization_green.sql clause 8

set local lock_timeout = '2s';

drop function if exists public.creator_claim_handle(text, text);

delete from platform.client_callable_door
 where schema_name = 'public' and function_name = 'creator_claim_handle'
   and identity_argtypes = array['text'::regtype, 'text'::regtype]::oid[];

do $$
declare v_n integer;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'creator_claim_handle';
  if v_n <> 1 then
    raise exception 'creator_claim_handle must have exactly one signature after this file; found %', v_n;
  end if;
  -- The call the creator dashboard actually makes, resolved rather than assumed.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'creator_claim_handle'
         and p.pronargdefaults >= 2) <> 1 then
    raise exception 'the surviving creator_claim_handle does not default enough arguments for a two-argument call to reach it';
  end if;
  if not has_function_privilege('authenticated', 'public.creator_claim_handle(text, text, uuid)', 'execute') then
    raise exception 'authenticated lost EXECUTE on the surviving creator_claim_handle';
  end if;
end $$;
