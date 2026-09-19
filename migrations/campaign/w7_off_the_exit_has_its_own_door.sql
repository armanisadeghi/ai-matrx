-- target: branch,production
-- additive: yes
-- guard: custom/code_paths_enabled
--
-- W7-OFF — THE DUAL-ENGINE EXIT HAS ITS OWN DOOR.
--
-- The switch screen shows the named exit for the two permission engines at the
-- top of the ramp (CUT-N-3). It was reading campaign_watch.dual_engine_exit as a
-- TABLE, which cannot work and must not: campaign_watch is not in
-- pgrst.db_schemas and adding it would expose the campaign's whole operational
-- ledger to anyone with a session. Everything else on this screen already comes
-- through a server_only door; so does this.

set lock_timeout = '3s';
set statement_timeout = '2min';

create function platform.unified_data_ramp_exit()
returns table (
  id           text,
  engine_old   text,
  engine_new   text,
  exit_trigger text,
  exit_date    date,
  owner_name   text,
  status       text,
  note         text
)
language sql
stable
security definer
set search_path to ''
as $fn$
  select e.id, e.engine_old, e.engine_new, e.exit_trigger, e.exit_date,
         e.owner_name, e.status, e.note
    from campaign_watch.dual_engine_exit e
   order by e.exit_date;
$fn$;

comment on function platform.unified_data_ramp_exit() is
  'CUT-N-3: the named exit for running two permission engines side by side — trigger, date and '
  'owner — as the switch screen reads it.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason,
   declared_by, signed_in_callers, anonymous_callers, non_client_lane)
select 'platform', 'unified_data_ramp_exit', iam.door_identity_args(p.oid),
       platform.door_argtypes(p.proargtypes),
       'The dual-engine exit decision. It takes no argument and names no entity: it is one row about the platform, not about anybody''s data.',
       'W7-OFF', false, false,
       'server_only: called only by the unified-data ramp API route, which verifies the signed-in person is a platform admin from their own session before using the service key. It reads the campaign ledger, which is an operator surface.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'platform'
 where p.proname = 'unified_data_ramp_exit'
   and not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'platform' and c.function_name = 'unified_data_ramp_exit'
                      and c.identity_argtypes = platform.door_argtypes(p.proargtypes));
