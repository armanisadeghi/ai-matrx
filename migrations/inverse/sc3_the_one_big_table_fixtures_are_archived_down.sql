-- chair-step: this restores (custom.record_restore) the two fixture Tables in admin's Workspace that sc3_the_one_big_table_fixtures_are_archived.sql archived — "Scopes" (f61b1352…) and "Scope Types" (7fc2f966…) — with the contents the store's cascade took with them. Nothing else is touched; the gateway's slug routing then answers context.scopes / context.scope_types for that organization from those Tables again, exactly as before.
-- lane: SC-3

do $restore$
declare
  c_workspace constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
  v_table uuid;
begin
  -- WHO DID THIS, said: a migration is a system write, and platform._stamp_actor_tier refuses
  -- an automated write that names no system.
  perform set_config('app.actor_system', 'migration/sc3_the_one_big_table_fixtures_are_archived', true);
  for v_table in
    select r.id from custom.record r
     where r.organization_id = c_workspace
       and r.table_id = custom.table_kernel_id()
       and r.deleted_at is not null
       and r.id in ('f61b1352-01f3-48e5-a15b-a1674b79b467', '7fc2f966-b8a9-41d0-b3cb-cf4d7b4d9999')
  loop
    perform custom.record_restore(c_workspace, v_table);
  end loop;
end
$restore$;
