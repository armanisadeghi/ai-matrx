-- inverse of migrations/campaign/suitehealth3_the_retired_context_resolve_shape_is_gone.sql — puts the retired overload, its comment, its
-- door row and its authenticated grant back exactly as they were live on production and the dev clone on 2026-09-25.
-- The row is declared before the grant: the ddl guard refuses a client grant on an undeclared definer.

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.context_resolve(p_organization_id uuid, p_bindings jsonb, p_scope_slug text DEFAULT 'scopes'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- RETIRED SHAPE (lane SC-3', SCOPES-CONTEXT-TRANSITION §5 D1). p_organization_id and
  -- p_scope_slug are accepted so a caller built before this file keeps working, and ignored:
  -- the scope id IS the record id, and each record names its own organization.
  return custom.context_resolve(p_bindings);
end;
$function$;


comment on function custom.context_resolve(uuid, jsonb, text) is 'CONTEXT-PERF: a whole agent turn''s bound context cells, resolved in ONE round trip through custom.read_record, with the two ceilings (sensitivity, freshness), the depends_on order and the provenance triple. Holds no visibility logic of its own.';

insert into platform.client_callable_door (id, schema_name, function_name, identity_args, declared_by, reason, declared_at, gate_predicate, anonymous_callers, anonymous_purpose, signed_in_callers, non_client_lane, identity_argtypes, probe_args, argument_rules, contract_probe, refusal_only) values ('66448310-55d3-4602-97d5-d619f527b1e0', 'custom', 'context_resolve', 'p_organization_id uuid, p_bindings jsonb, p_scope_slug text', 'CONTEXT-PERF', 'DOOR-5 / DYN-23: a turn''s context cells, resolved together under the person operating the agent. It batches custom.read_record and custom.record_values_versioned — both of which this caller already holds — and decides nothing itself.', '2026-09-20 14:53:25.216953+00', NULL, 'f', NULL, 't', NULL, '{2950,3802,25}', NULL, NULL, NULL, 'f');

revoke all on function custom.context_resolve(uuid, jsonb, text) from public;
grant execute on function custom.context_resolve(uuid, jsonb, text) to authenticated;
