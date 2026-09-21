-- ============================================================================
-- ladder_system_org_id_plans_once — the system-org resolver caches its plan
-- ============================================================================
-- `custom.ladder_replanners()` — census 14 of `pnpm check:store-doors-decide`,
-- the census LADDER-PERF added after measuring 7.24 ms -> 1.36 ms on
-- `custom.carrying_edges_of` — names exactly one function:
--
--   public.system_org_id | sql | LANGUAGE sql and not inlinable (SECURITY
--   DEFINER + SET), so PostgreSQL re-plans its body on every call - the plan
--   cache of a non-inlined SQL-language function lives for the calling query,
--   not the session.
--
-- It has been SECURITY DEFINER + SET since `0118_library_protected_rpcs.sql`
-- (2026-06-22) and DD-110's definer sweep, and those two properties are what
-- make a LANGUAGE sql body un-inlinable. An un-inlinable SQL function gets no
-- session plan cache at all, so every call re-plans; plpgsql caches the plan
-- for the session. This is the census's OWN remedy, applied at the source.
--
-- WHAT IS PRESERVED, exactly: the name, the signature, RETURNS uuid, STABLE,
-- SECURITY DEFINER, `SET search_path TO 'public'`, the body's meaning, and the
-- `platform.client_callable_door` row that keeps `authenticated`'s EXECUTE
-- (verified present before this was written: `public.system_org_id(p_key text)`,
-- signed_in_callers = true, anonymous_callers = false — so the DDL guard keeps
-- the grant rather than taking it back). `anon` holds nothing and still holds
-- nothing. Semantics are identical on every input: no matching row leaves the
-- variable NULL exactly as a zero-row SQL body returns NULL, and `key` is the
-- table's own unique lookup, so there is no first-row question to differ on.
--
-- WHY IT IS ON THE LADDER'S SET AT ALL, said plainly because the next reader
-- will ask: it is NOT on a read path. The walk reaches it through
-- `iam.has_access_for_base` -> `platform.audit_carrying_cycles` ->
-- `public.system_org_id`, and that FIRST hop is not a call. `has_access_for_base`
-- only NAMES `platform.audit_carrying_cycles()` inside a `raise warning`
-- remedy sentence telling an operator what to run, and the census's call graph
-- is a regex over function text that cannot tell a call from a sentence. The
-- second hop is real (`audit_carrying_cycles` files its ops.system_error row
-- under the ratified platform tenant, per the Data Doctrine).
--
-- That false first hop is a real weakness in the census and it is NOT fixed
-- here, deliberately: stripping string literals before the walk was measured
-- and it drops TEN nodes including `iam.has_access`, which is genuinely on the
-- path, so it would blind a live guard. A change that cannot be proven
-- strictly better is not a fix, and a peer's guard is never weakened to clear a
-- finding. It is written up in
-- `common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/PROGRESS-DOORS-GREEN.md`
-- for whoever owns the census.
--
-- So this change is a small, honest win on its own terms: `system_org_id` is
-- called from `platform.provision`, `platform.heal_reachability_drift`,
-- `public.create_personal_organization`, `public.library_publish`,
-- `public.rag_library_list` and seven admin RPCs, and every one of them now
-- pays for one plan instead of one per call.
--
-- Additive: CREATE OR REPLACE of one function body. No table, column, grant,
-- door row, policy or signature is touched.
-- ============================================================================
-- based-on: public.system_org_id(text) 52f13b755cba2c09091b2183645cdec52c94fd3ce376bf9b4ac366c795d7afe4

CREATE OR REPLACE FUNCTION public.system_org_id(p_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_organization_id uuid;
begin
  -- Identical to the LANGUAGE sql body this replaces. plpgsql only changes WHERE
  -- the plan lives: for the session instead of for the calling query.
  select o.organization_id into v_organization_id
    from iam.system_orgs o
   where o.key = p_key;
  return v_organization_id;
end;
$function$;

comment on function public.system_org_id(text) is
  'Resolve a well-known system organization by key (iam.system_orgs). plpgsql rather than LANGUAGE sql because SECURITY DEFINER + SET make a SQL body un-inlinable, and an un-inlinable SQL function re-plans on every call — custom.ladder_replanners() names that class. Same signature, same volatility, same security, same search_path, same answer.';
