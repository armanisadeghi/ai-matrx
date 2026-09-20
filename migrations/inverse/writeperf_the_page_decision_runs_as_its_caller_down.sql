-- inverse of writeperf_the_page_decision_runs_as_its_caller.sql
-- WHAT IT DOES NOT UNDO: nothing. It puts the three page helpers back to SECURITY DEFINER and
-- restores their non-client door rows — which is to say it puts back the state in which every
-- signed-in call of custom.entity_records_find dies on `permission denied for function page_size`.
create or replace function custom.page_ceiling(p_organization_id uuid default null)
returns integer language sql stable security definer set search_path to ''
as $$
  select (platform.knob_resolve('custom', 'page_size_ceiling', p_organization_id) #>> '{}')::integer;
$$;
create or replace function custom.export_ceiling(p_organization_id uuid default null)
returns integer language sql stable security definer set search_path to ''
as $$
  select (platform.knob_resolve('custom', 'export_rows_ceiling', p_organization_id) #>> '{}')::integer;
$$;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'page_ceiling', 'p_organization_id uuid', array['uuid'::regtype::oid],
   'migrations/inverse/writeperf_the_page_decision_runs_as_its_caller_down.sql (lane WRITE-PERF)',
   'PAGE-1: reads one knob row for the organization. It names no record, no Table and no person.',
   'server_only: only custom.page_size and custom.page_contract call it, and both are reached from inside a door that has already decided who is standing there.',
   false, false),
  ('custom', 'export_ceiling', 'p_organization_id uuid', array['uuid'::regtype::oid],
   'migrations/inverse/writeperf_the_page_decision_runs_as_its_caller_down.sql (lane WRITE-PERF)',
   'PAGE-1: reads one knob row for the organization. It names no record, no Table and no person.',
   'server_only: only custom.io_export and custom.page_contract call it.',
   false, false),
  ('custom', 'page_size', 'p_organization_id uuid, p_door text, p_limit integer, p_default integer, p_ceiling integer',
   array['uuid'::regtype::oid, 'text'::regtype::oid, 'int4'::regtype::oid, 'int4'::regtype::oid, 'int4'::regtype::oid],
   'migrations/inverse/writeperf_the_page_decision_runs_as_its_caller_down.sql (lane WRITE-PERF)',
   'PAGE-1: decides ONE integer from two knob rows and the arguments. It reads no record and returns no data of anybody''s.',
   'server_only: every caller is one of the list doors of schema custom.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
