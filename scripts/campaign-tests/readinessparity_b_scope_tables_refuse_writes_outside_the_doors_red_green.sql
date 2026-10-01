-- LANE READINESS-PARITY — THE SCOPE TABLES REFUSE WRITES OUTSIDE THE DOORS (the DB-level guard, a window file), RED then GREEN
-- on the dev clone. Castellano & Reyes, LLP (a store-writer organization) files its matters under scopes.
--   T1  a DELETE issued directly on context.scopes is refused (42501) — RED before the file: it deletes
--   T2  a write with triggers off (session_replication_role = replica) is refused (42501) — RED before: it lands
--   T3  the doors still work: custom.context_scope_archive then custom.context_scope_restore, as the system
--   T4  break glass: custom.context_outside_the_doors = '<why>' lets a direct delete through (with a WARNING)
-- Run (rolled back, nothing kept): the clone only, with or without the file applied.
set statement_timeout = '5min';
set lock_timeout = '60s';
do $t$
declare
  v_cast uuid := '7cd12da2-2213-4378-8fba-a9e2dc4ea657';
  v_scope uuid; v_state text; v_n int;
begin
  select s.id into v_scope from context.scopes s join context.scope_types t on t.id = s.scope_type_id and t.deleted_at is null
   where s.organization_id = v_cast and s.deleted_at is null
     and not exists (select 1 from context.scopes c where c.parent_scope_id = s.id)
   order by s.name, s.id limit 1;
  perform set_config('app.actor_system', 'readiness-parity-test', true);
  -- T1
  begin
    delete from context.scopes where id = v_scope;
    raise exception 'T1 RED: a direct DELETE on context.scopes went through';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then raise exception 'T1 RED: % (%)', v_state, sqlerrm; end if;
  end;
  raise notice 'T1 GREEN: a direct DELETE on context.scopes is refused';
  -- T2
  begin
    set local session_replication_role = replica;
    update context.scopes set description = coalesce(description, '') where id = v_scope;
    set local session_replication_role = origin;
    raise exception 'T2 RED: a write with triggers off went through';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then raise exception 'T2 RED: % (%)', v_state, sqlerrm; end if;
  end;
  set local session_replication_role = origin;
  raise notice 'T2 GREEN: a write with triggers off is refused';
  -- T3
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform custom.context_scope_archive(v_scope);
  perform custom.context_scope_restore(v_scope);
  select count(*) into v_n from context.scopes s join custom.record r on r.organization_id = s.organization_id and r.id = s.id
   where s.id = v_scope and s.deleted_at is null and r.deleted_at is null;
  if v_n <> 1 then raise exception 'T3 RED: archive then restore through the doors did not leave both sides live'; end if;
  raise notice 'T3 GREEN: the scope doors archive and restore with the guard in place';
  -- T4
  perform set_config('custom.context_outside_the_doors', 'readiness-parity test: break glass', true);
  delete from context.context_item_values where false;   -- statement-level no-op is fine; the row trigger is what decides
  delete from context.scopes where id = v_scope;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'T4 RED: the break-glass delete did not go through'; end if;
  raise notice 'T4 GREEN: break glass lets a named direct delete through';
  raise exception 'ALL GREEN (rolled back on purpose)';
end
$t$;
