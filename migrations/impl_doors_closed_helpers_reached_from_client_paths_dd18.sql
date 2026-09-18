-- impl_doors_closed_helpers_reached_from_client_paths_dd18 — 2026-09-18
--
-- 🚨 TWO FILES, ONE FINDING. This file is the ADDITIVE half (trigger to definer, two wrappers to
-- definer, door flags told the truth) and applies unattended. The NON-ADDITIVE half — eight
-- REVOKEs, the superseded provision_mcp_server overload and its door row — is
-- migrations/chair_step_2026_09_18_db_guard_findings_non_additive.sql, a `-- chair-step:` file
-- the owner confirms at a terminal (migrations/JUDGMENT.md §5). D18/D16a/D5 stay partly red
-- until that file lands; this file's proof asserts only what it did.
--
-- THE FINDING. `pnpm check:impl-doors` (release gate 28) reports D18: twelve client paths call a
-- helper the calling role cannot execute — a 42501 waiting inside a path a signed-in user can
-- reach — plus D16a (four door rows whose client flag and live grant disagree), D5 (the
-- undeclared ANONYMOUS definer population grew 8 -> 10) and D11 (three seo doors whose reason
-- names iam.has_access while the 1-hop closure cannot see it). Reproduced 2026-09-18.
--
-- THE CLASS behind D18 is one shape, twice over: a SECURITY INVOKER function that `authenticated`
-- may EXECUTE (an explicit grant, or PostgreSQL's default PUBLIC EXECUTE at CREATE) whose body calls
-- a helper that was later, correctly, closed to client roles. The invoker runs as the caller, so the
-- helper answers 42501. Two ways it was born here:
--   • MAINTENANCE TOOLING granted to `authenticated` for no caller: iam.sweep_governance_guards,
--     platform.declare_soft_delete_edge, platform.definer_access_decision_regex_strong,
--     platform.provision_arg_check_findings, platform.provision_preflight, seo._tm_rendition_of.
--     Census 2026-09-18: no client call site in matrx-frontend, matrx-extend or aidream for any of
--     them (aidream's provisioning lane runs as matrx_provisioner / service_role, which keep their
--     grants). Remedy: the client grant goes, and the helper stays closed. Never re-grant the helper.
--   • A REAL USER PATH: (1) the platform.entity_types trigger _entity_types_class_regenerates fires
--     when a signed-in admin changes a token's class, and calls iam.apply_rls + platform.is_provisioning
--     as that user — so the regeneration DD-137b promises on a class change 42501s for every admin
--     who is not the database owner. Remedy: the trigger function becomes SECURITY DEFINER with a
--     pinned search_path (the D18 remedy text, first option). (2) public.provider_account_attach_credential
--     and public.provider_account_set_status were built by aidream 0691 as SECURITY INVOKER SQL
--     wrappers over provider.* impls, and aidream 0731 then made those impls server-only — leaving
--     the two wrappers as declared client doors that 42501 for every client. Their siblings
--     provider_account_list / _create / _verify are SECURITY DEFINER already; these two join them.
--     The impl bodies keep their organization-admin gate (0731 says so) and read auth.uid()
--     through the definer wrapper exactly as list/create do.
--
-- D16a. platform.is_provisioning() and platform.provision_spec_grandfather_count() carry
-- signed_in_callers = true with no grant: their 0763 reasons say "EXECUTE to PUBLIC so the census
-- can read it", but no client reads either (census 2026-09-18) and the §6d-4 guard took the grant
-- back. The flag was the lie; it moves to the non-client lane and names who really calls them.
-- public.provision_mcp_server has TWO overloads: the 15-argument one without p_organization_id is
-- the pre-"NO ASSIGNED ORG" shape, superseded by the 16-argument overload the one client caller
-- (features/tool-registry/mcp-admin/services/mcpAdmin.service.ts) already uses with an explicit
-- organization; it is dropped with its door row (no legacy, pre-launch). seo._tm_rendition_of is
-- declared a private helper with no client lane and yet authenticated held EXECUTE; the grant goes.
--
-- D5. The two new anonymous definers are platform._door_follows_its_function() and
-- platform._provision_shape_guard() — EVENT TRIGGER functions created with PostgreSQL's default
-- PUBLIC EXECUTE. PostgREST cannot invoke an event trigger function and the guard's own D5 query
-- already excludes `trigger`-returning functions for that reason; it did not exclude
-- `event_trigger`. Both grants are revoked here, and the guard excludes event_trigger functions in
-- the same commit (scripts/check-impl-doors.ts), so the next event trigger cannot re-raise D5.
--
-- D11 is a guard defect, fixed in the same commit: the three seo doors reach iam.has_access
-- through seo._tm_map / seo._tm_visible_sites — one hop, exactly what rule (b) allows — but the
-- closure query only searched helpers in iam / public / platform, never the door's own schema.
--
-- based-on: platform._entity_types_class_regenerates() f276c5ec7fcac534b6970bb4dcf44b658479de51428c1eb02ddd27dff2a5e0ea
-- based-on: public.provider_account_attach_credential(uuid, uuid, text) 714194d8f1d4443b3bc9128e40a1f6fa70e960e141855a179537fb7dd7d639e2
-- based-on: public.provider_account_set_status(uuid, text, text, timestamp with time zone, uuid) 7afb1fd03ccfb1b62526facb41b5f38471895025517b46732b70b3c0adeaa058

set local lock_timeout = '10s';

-- 1. The trigger a signed-in admin fires runs as the owner, with a pinned search_path.
CREATE OR REPLACE FUNCTION platform._entity_types_class_regenerates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if new.data_class is not distinct from old.data_class then return new; end if;
  if new.rls_variant in ('component','ledger') then return new; end if;
  if not new.is_active then return new; end if;
  if to_regclass(format('%I.%I', new.schema_name, new.table_name)) is null then return new; end if;
  -- A regeneration inside the provisioner's own window would be a second one on a table it is
  -- still building; create_entity_table calls apply_rls itself, right after.
  if platform.is_provisioning() then return new; end if;  -- wave 3: a proof only the provisioner can write, never the forgeable `matrx.provisioner` GUC
  -- DD-163 (2026-09-12): iam.apply_rls refuses machinery by construction, so regenerating here is
  -- not something this trigger can do — and raising instead meant a machinery token's class could
  -- never be corrected. Say so; never pretend the policies moved.
  if new.audit_class = 'machinery' then
    raise notice 'DD-163: % changed class % -> %, and its policies were NOT regenerated: audit_class is machinery and iam.apply_rls refuses machinery by construction (db-rules §1). The class regime now SEES this table correctly; its policies remain the bespoke set its own feature wrote.',
      new.token, old.data_class, new.data_class;
    return new;
  end if;

  raise notice 'DD-137b: % changed class %s -> %s; regenerating its policies in this commit',
    new.token, old.data_class, new.data_class;
  perform iam.apply_rls(new.schema_name, new.table_name, new.token, new.rls_variant);
  return new;
end
$function$;

-- 2. (the eight REVOKEs live in the chair-step file — see the header)

-- 3. The two provider-account wrappers become the definer doors their siblings already are.
--    Their door rows (0691) are already declared signed-in, so the grant sticks at CREATE.
create or replace function public.provider_account_attach_credential(
  p_account_id uuid, p_credential_item_id uuid, p_credential_role text)
returns uuid
language sql
security definer
set search_path to 'pg_catalog'
as $function$
  SELECT provider.attach_credential(p_account_id, p_credential_item_id, p_credential_role);
$function$;

create or replace function public.provider_account_set_status(
  p_account_id uuid, p_status text, p_external_account_id text default null::text,
  p_last_verified_at timestamp with time zone default null::timestamp with time zone,
  p_duplicate_of_id uuid default null::uuid)
returns void
language sql
security definer
set search_path to 'pg_catalog'
as $function$
  SELECT provider.set_account_status(
    p_account_id, p_status, p_external_account_id, p_last_verified_at, p_duplicate_of_id
  );
$function$;

grant execute on function public.provider_account_attach_credential(uuid, uuid, text) to authenticated;
grant execute on function public.provider_account_set_status(uuid, text, text, timestamp with time zone, uuid) to authenticated;

-- 4. D16a: the flag tells the truth about who calls these.
update platform.client_callable_door
   set signed_in_callers = false,
       anonymous_callers = false,
       non_client_lane = 'server_only (2026-09-18): no client call site in matrx-frontend, matrx-extend or aidream. '
         || 'Read by the platform.entity_types class-regeneration trigger (SECURITY DEFINER since '
         || 'impl_doors_closed_helpers_reached_from_client_paths_dd18) and by the provisioning census, which '
         || 'run as the owner / service_role. The 0763 reason promised PUBLIC EXECUTE; the §6d-4 guard took '
         || 'it back and nothing missed it.'
 where schema_name = 'platform'
   and function_name in ('is_provisioning', 'provision_spec_grandfather_count')
   and signed_in_callers;

-- (the superseded provision_mcp_server overload and its door row go in the chair-step file)

-- 5. Proof, same transaction.
do $proof$
begin
  if not (select prosecdef from pg_proc where oid = 'platform._entity_types_class_regenerates()'::regprocedure) then
    raise exception 'dd18: _entity_types_class_regenerates is still SECURITY INVOKER';
  end if;
  if not (select prosecdef and has_function_privilege('authenticated', oid, 'EXECUTE')
            from pg_proc where oid = 'public.provider_account_attach_credential(uuid,uuid,text)'::regprocedure)
     or not (select prosecdef and has_function_privilege('authenticated', oid, 'EXECUTE')
            from pg_proc where oid = 'public.provider_account_set_status(uuid,text,text,timestamptz,uuid)'::regprocedure) then
    raise exception 'dd18: a provider_account wrapper is not a granted definer door';
  end if;
  if exists (select 1 from platform.client_callable_door where schema_name = 'platform'
              and function_name in ('is_provisioning','provision_spec_grandfather_count') and signed_in_callers) then
    raise exception 'dd18: a non-client door row still claims signed-in callers';
  end if;
end $proof$;
