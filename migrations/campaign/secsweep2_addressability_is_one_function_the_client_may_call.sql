-- lane: SECURITY-SWEEP-2
-- 🚨 THE SEVEN ADDRESSABILITY DOORS REFUSED EVERYBODY, AND ONLY CALLING THEM FOUND IT.
--
-- secsweep2_<table>_<column>.sql put `iam.has_org_access_for(<col>, organization_id)` in a
-- RESTRICTIVE policy. `authenticated` and `anon` hold NO EXECUTE on that function --
-- has_function_privilege('authenticated','iam.has_org_access_for(uuid,uuid)','EXECUTE') is
-- FALSE -- so every client write to those seven tables died on
-- `ERROR: permission denied for function has_org_access_for`. Not "the attack was refused":
-- EVERY write was refused, including the app's own. A Create button that refuses everybody.
--
-- Judge-only, a green apply and a clean type-check all passed it. Calling it from the
-- `authenticated` role is what did not -- the third time in this campaign that exact sentence
-- has had to be written (SECURITY-SWEEP: `42883 gen_random_bytes does not exist` in one applied
-- door, a SECURITY DEFINER guard answering 201 Created in another).
--
-- WHY NOT SIMPLY GRANT EXECUTE ON THE TWO-ARGUMENT FUNCTION. `iam.has_org_access_for(user, org)`
-- answers "is this person in that organization" about ANY pair. Handing that to every client is
-- a membership oracle: a signed-in stranger could probe whether a named user belongs to an
-- organization they have nothing to do with. The one-argument `iam.has_org_access(org)` is
-- already client-executable precisely because it only ever answers about the CALLER.
--
-- SO THE RULING IS STATED ONCE, AS ONE FUNCTION, COMPOSED FROM THE TWO PRIMITIVES THAT ALREADY
-- EXIST -- it is not a second membership check, and it does not reimplement one:
--
--     may_address_user_in_org(p_user, p_org)
--       := iam.has_org_access(p_org)                -- the CALLER may act in this organization
--          and iam.has_org_access_for(p_user, p_org) -- the PERSON NAMED may be addressed in it
--
-- Both halves are required, so the caller learns nothing it could not already learn: it only
-- ever gets an answer about an organization it is already inside. That is exactly the sentence
-- the chair's ruling uses, and exactly what mandate.binding's guard_binding_containment checks
-- against iam.organization_member -- reusing the primitive rather than writing a second one.
--
-- ADDITIVE. A new function and one GRANT. Nothing is dropped, renamed or revoked; the seven
-- policies are replaced in their own files, after this.
-- Inverse: migrations/inverse/secsweep2_addressability_is_one_function_the_client_may_call.inverse.sql

set local lock_timeout = '2s';

create or replace function iam.may_address_user_in_org(p_user uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- NULL names nobody and cannot impersonate anybody, so it is addressable by definition;
  -- the policies keep their own `is null` arm as well, and this makes the two agree.
  select p_user is null
      or (iam.has_org_access(p_org) and iam.has_org_access_for(p_user, p_org));
$function$;

comment on function iam.may_address_user_in_org(uuid, uuid) is
  'SECURITY-SWEEP-2 2026-09-21. THE ADDRESSABILITY RULING, stated once: the caller may act in this organization AND the person named may be addressed in it. Composed from the two primitives that already exist (iam.has_org_access for the caller, iam.has_org_access_for for the subject) rather than reimplementing membership. Both halves are required, so a client only ever gets an answer about an organization it is already inside -- which is why this is client-executable and the bare two-argument function is not. Used by the *_is_addressable_* RESTRICTIVE policies.';

-- THE DOOR DECLARATION. A SECURITY DEFINER function runs as `postgres` (BYPASSRLS), so the
-- platform requires -- IN DATA, in this same transaction -- a statement of who may call it and
-- what each entity-id argument is checked against. `provision_shape_guard` refused the first
-- version of this file for exactly that (23514), which is the guard doing its job.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, anonymous_purpose)
values
  ('iam', 'may_address_user_in_org', 'p_user uuid, p_org uuid',
   ARRAY['uuid'::regtype, 'uuid'::regtype]::oid[],
   'SIGNED-IN door, called from inside the *_is_addressable_* RESTRICTIVE policies rather than over RPC. p_user is the person a row NAMES: it is checked against iam.has_org_access_for(p_user, p_org) -- they must be addressable in that organization. p_org is the row''s own organization_id: it is checked against iam.has_org_access(p_org) -- the CALLER must already be inside it, which is what keeps this from being a membership oracle, since a caller only ever gets an answer about an organization it belongs to. NULL RULE: p_user IS NULL returns true (NULL names nobody and cannot impersonate anybody, and the policies carry their own is null arm); p_org IS NULL makes iam.has_org_access(NULL) decide, and this function adds nothing to that answer. anon may call it because the same policies bind anon, and for anon auth.uid() is NULL so has_org_access is false and the function answers false for every non-null p_user.',
   'secsweep2_addressability_is_one_function_the_client_may_call.sql',
   null, true, true,
   'The caller with no account is the anonymous visitor on a public or link surface whose write these same *_is_addressable_* policies bind -- the policies are TO authenticated, anon, so anon reaches this function whenever one of them is evaluated. NOTHING stands in for an identity, and nothing needs to: for anon auth.uid() is NULL, so iam.has_org_access(p_org) is false and this function answers FALSE for every non-null p_user. The grant exists so an anonymous write is REFUSED BY THE POLICY rather than by 42501 permission-denied on a function -- an honest refusal naming the rule, instead of a dead end the screen cannot explain.');

grant execute on function iam.may_address_user_in_org(uuid, uuid) to authenticated, anon;
