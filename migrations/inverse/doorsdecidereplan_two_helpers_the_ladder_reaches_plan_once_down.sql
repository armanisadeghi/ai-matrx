-- based-on: iam.statement_memo_epoch() 93c2132d0e54b7fa29b18df43bbff8468bea701ff1128ed9ef9324f3857f646b
-- based-on: iam.entity_read_kernel_members_live() 7101cc9e96a7009cfcb6fd356df9c7e1cf21818722f94d80be740fbff7712c53
-- inverse of doorsdecidereplan_two_helpers_the_ladder_reaches_plan_once.sql
-- WHAT IT DOES NOT UNDO: nothing. It puts both helpers back to LANGUAGE sql with their exact prior
-- bodies, which is to say back to being re-planned on every call (census 14+15 names both again).
create or replace function iam.statement_memo_epoch()
returns text language sql stable set search_path to ''
as $function$
  -- Three things, and each of them is load-bearing:
  --   statement_timestamp()  a new statement is a new epoch, so the memo is STATEMENT-scoped.
  --   pg_backend_pid()       a GUC is per backend; naming the backend makes that explicit.
  --   xid-if-assigned        'ro' until this transaction writes; the moment it writes, every
  --                          entry taken before the write stops matching and is recomputed.
  select pg_catalog.statement_timestamp()::text
      || '/' || pg_catalog.pg_backend_pid()::text
      || '/' || coalesce(pg_catalog.pg_current_xact_id_if_assigned()::text, 'ro');
$function$;

create or replace function iam.entity_read_kernel_members_live()
returns jsonb language sql stable set search_path to 'public', 'pg_catalog'
as $function$
  select coalesce(jsonb_object_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                                   md5(p.prosrc)), '{}'::jsonb)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname::text, p.proname::text) in (
    select m.schema_name, m.function_name from iam.entity_read_kernel_members() m
  );
$function$;
