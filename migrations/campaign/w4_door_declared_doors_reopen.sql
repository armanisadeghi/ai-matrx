-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W4-DOOR — A DECLARED DOOR SURVIVES THE NEXT CLOSING PASS.
--
-- THE DEFECT, MEASURED ON THE MAIN DATABASE 2026-09-18 20:26–20:29 UTC.
-- `w4_door_the_client_grants.sql` applied at 20:26:16Z and `authenticated` held EXECUTE on
-- `custom.read_records` and `custom.read_record`. `w4_io_the_outbox_and_its_consumer.sql`
-- (another lane) applied at 20:29Z, created functions in schema `custom`, and — as every
-- lane in this schema must, because PostgreSQL gives each new function EXECUTE to PUBLIC and
-- PUBLIC reaches anon — ran the schema-wide closing revoke that LAND's
-- `land_custom_holds_no_client_grant_*.sql` established. `proacl` on both read doors read
-- `{postgres=X/postgres}` afterwards: the closing pass is a BLANKET revoke, so it cannot
-- tell a door somebody deliberately opened from a grant PostgreSQL handed out by accident.
--
-- This is a CLASS, not an accident of ordering: it will take these two grants away again
-- after every future wave that adds a function to `custom`, silently, and the first symptom
-- is a browser getting `42501 permission denied for function read_records` on a door whose
-- register row says a signed-in person may call it.
--
-- THE FIX IS NOT TO WEAKEN THE CLOSING PASS. It is correct and it stays. The fix is that
-- the closing pass gets a way to put back exactly what was declared — no more, no less —
-- reading `platform.client_callable_door`, which is already the one register that says who
-- may call what. One call, at the END of any closed-schema pass:
--
--     select custom.reopen_declared_doors();
--
-- It grants EXECUTE to `authenticated` on every function in schema `custom` whose register
-- row says `signed_in_callers`, and USAGE on the schema when there is at least one such
-- door. It grants NOTHING to anon, public or service_role, it touches no table, and with no
-- declared door it grants nothing at all — so running it on a schema nobody has opened
-- leaves the schema closed.

set lock_timeout = '5s';
set statement_timeout = '120s';

create function custom.reopen_declared_doors()
returns table (reopened text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_sig text;
  v_any boolean := false;
begin
  for v_sig in
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'custom'
      join platform.client_callable_door d
        on d.schema_name = 'custom'
       and d.function_name = p.proname
       and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
     where d.signed_in_callers
       and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  loop
    v_any := true;
    execute format('grant execute on function %s to authenticated', v_sig);
    reopened := v_sig;
    return next;
  end loop;

  -- The schema grant is a consequence of there being a door, never a decision of its own.
  if exists (select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'custom'
               join platform.client_callable_door d
                 on d.schema_name = 'custom' and d.function_name = p.proname
                and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
              where d.signed_in_callers)
     and not has_schema_privilege('authenticated', 'custom', 'USAGE') then
    execute 'grant usage on schema custom to authenticated';
    reopened := 'schema custom (USAGE)';
    return next;
  end if;

  if not v_any then
    raise notice 'custom.reopen_declared_doors: every declared signed-in door already holds its grant; nothing reopened.';
  end if;
end;
$fn$;

comment on function custom.reopen_declared_doors() is
  'W4-DOOR: puts back exactly the client doors platform.client_callable_door declares, after a blanket closing revoke. Call it as the LAST statement of any closed-schema pass in this repo. It grants nothing to anon, public or service_role and nothing on any table.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason,
   declared_by, signed_in_callers, anonymous_callers, non_client_lane)
select 'custom', 'reopen_declared_doors', iam.door_identity_args(p.oid),
       platform.door_argtypes(p.proargtypes),
       'W4-DOOR: restores the declared client doors after a closing revoke. It reads platform.client_callable_door and grants only what that register already says; it takes no arguments at all, so there is nothing to check.',
       'W4-DOOR', false, false,
       'server_only: it issues GRANTs, so it belongs to the migration lane that closes the schema and to nobody else. A client that could call it could not widen anything (it only re-issues what the register declares), but a client has no reason to and DDL is never a browser''s business.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'custom'
 where p.proname = 'reopen_declared_doors'
   and not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'custom' and c.function_name = 'reopen_declared_doors');
