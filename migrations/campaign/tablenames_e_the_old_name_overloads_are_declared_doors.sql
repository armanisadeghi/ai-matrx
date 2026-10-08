-- chair-step: declares the five temporary old-name overloads of tablenames_d as client doors, copied from the doors they mirror
-- lane: TABLE-NAMES-FINAL
-- lock: custom
--
insert into platform.client_callable_door
  (reason, probe_args, declared_by, schema_name, refusal_only, function_name, identity_args, argument_rules,
   contract_probe, gate_predicate, non_client_lane, anonymous_callers, anonymous_purpose, identity_argtypes, signed_in_callers)
select 'TEMPORARY old-name twin of the door above (parameter p_include_app_tables, passed as text): it calls the real door and nothing else. ' || d.reason,
       d.probe_args, 'tablenames_e_the_old_name_overloads_are_declared_doors.sql', d.schema_name, d.refusal_only, d.function_name,
       pg_get_function_identity_arguments(p.oid), d.argument_rules, d.contract_probe, d.gate_predicate, d.non_client_lane,
       d.anonymous_callers, d.anonymous_purpose, string_to_array(p.proargtypes::text, ' ')::oid[], d.signed_in_callers
  from platform.client_callable_door d
  join pg_proc p on p.pronamespace = 'custom'::regnamespace and p.proname = d.function_name
                and pg_get_function_identity_arguments(p.oid) ~ 'p_include_app_tables'
 where d.schema_name = 'custom' and d.identity_args ~ 'include_platform_tables'
   and d.function_name in ('data_home', 'data_home_slim', 'data_home_tables', 'records_search', 'table_list_everywhere');
