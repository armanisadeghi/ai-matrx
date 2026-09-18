-- target: branch
--
-- W1-PROV — the 29 DOOR ROWS whose argument types are PRODUCTION'S OIDs, on the branch.
--
-- 🚨 THE ROOT CAUSE OF THE 403, AND IT IS NOT ABOUT `custom` AT ALL.
-- `platform.client_callable_door.identity_argtypes` is `oid[]`. An OID is DATABASE-LOCAL, so
-- when `W0-DATA` copied production's 1,014 door rows onto the rehearsal branch it wrote
-- production's OIDs verbatim. For every door whose signature names a CUSTOM type the copied
-- array cannot match the branch's own catalogue: `permission_level` is OID 1699632 on
-- production and 17760 here, so `iam.accessible_entity_ids(text, permission_level, integer)`
-- carries `{25,1699632,23}` in the register and `{25,17760,23}` in `pg_proc`.
--
-- WHAT THAT DOES, measured 2026-09-17: the event trigger `enforce_definer_client_grants`
-- matches a door BY `identity_argtypes`, finds none, and REVOKES the client EXECUTE inside
-- the GRANT that issues it. So `grant execute on function iam.accessible_entity_ids(...) to
-- authenticated` applied cleanly and left `proacl = {postgres=X,service_role=X}` — and every
-- canonical `std_select` policy, which calls that function, answered
-- `42501 permission denied for function accessible_entity_ids` for `authenticated` over
-- PostgREST. That is HTTP 403 on every entity table on this branch, not only `custom.record`.
--
-- W0-DATA already met the other half of this defect and said so: `door-surface.ts` builds its
-- key from `identity_args`, never `identity_argtypes`, "because a custom type's OID means
-- nothing across two databases". The register itself was left carrying them.
--
-- THE REPAIR is derivation, not a list: for every door row that names a function this
-- database actually has, `identity_argtypes` is re-read from THIS database's `pg_proc`,
-- matched on `(schema_name, function_name, identity_args)` — the key W0-DATA proved portable.
-- Rows naming no live function are left alone and reported; they are a different defect.
--
-- BRANCH ONLY: production's own OIDs are correct on production, and this statement is a no-op
-- there by construction. The refusal below makes that a fact rather than a claim.
-- THE INVERSE: `migrations/inverse/w1_prov_branch_door_argtypes_repair_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';

do $$
declare v_fixed integer; v_orphan integer;
begin
  if (pg_control_system()).system_identifier = 7642734024280108049 then
    raise exception
      'REFUSING: this is PRODUCTION (system_identifier %). The OIDs in its door register are '
      'its own and are correct.', (pg_control_system()).system_identifier;
  end if;

  with live as (
    select d.ctid, platform.door_argtypes(p.proargtypes) as at
      from platform.client_callable_door d
      join pg_namespace n on n.nspname = d.schema_name
      join pg_proc p on p.pronamespace = n.oid and p.proname = d.function_name
                    and pg_get_function_identity_arguments(p.oid) = d.identity_args
  )
  update platform.client_callable_door d
     set identity_argtypes = live.at
    from live
   where d.ctid = live.ctid and d.identity_argtypes is distinct from live.at;
  get diagnostics v_fixed = row_count;

  select count(*) into v_orphan
    from platform.client_callable_door d
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = d.schema_name and p.proname = d.function_name
        and pg_get_function_identity_arguments(p.oid) = d.identity_args);

  raise notice 'W1-PROV: % door row(s) re-derived from this database''s catalogue; % row(s) name no live function and were left alone (a separate defect, reported).', v_fixed, v_orphan;
end
$$;
