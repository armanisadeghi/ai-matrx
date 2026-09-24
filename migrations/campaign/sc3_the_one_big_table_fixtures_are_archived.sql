-- chair-step: this soft-deletes (custom.record_delete — archived, restorable, never destroyed) the two fixture Tables in admin's Workspace that the retired slug bridge read: "Scopes" (slug scopes, f61b1352…) and "Scope Types" (slug scope_types, 7fc2f966…), each with its one record. After sc3_the_context_door_routes_by_id_for_the_person.sql nothing reads them, and while they are live the gateway's slug routing keeps answering `context.scopes` / `context.scope_types` for that organization from one fixture record each; archived, those reads return to the scope tables as for every other organization. It writes only the two Tables' own rows (and their contents, through the store's own cascade). The inverse restores both through custom.record_restore.
-- lane: SC-3
--
-- WHY A CHAIR STEP: a DO block writes rows, which the additive allow-list cannot read.

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- THE ONE-BIG-TABLE FIXTURES, ARCHIVED (never deleted). admin's Workspace carries a Table
-- slugged `scopes` and one slugged `scope_types` — the shape §5 D1 retires. After the hand-off
-- nothing reads them, and while they are live the gateway's slug routing would keep answering
-- `context.scopes` from one fixture record for that organization. custom.record_delete is the
-- store's own soft delete (it takes each Table's contents with it, restorably); the inverse
-- restores both.
-- ═════════════════════════════════════════════════════════════════════════════════════════
do $archive$
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
       and r.deleted_at is null
       and r.id in ('f61b1352-01f3-48e5-a15b-a1674b79b467',   -- "Scopes"      (slug scopes)
                    '7fc2f966-b8a9-41d0-b3cb-cf4d7b4d9999')   -- "Scope Types" (slug scope_types)
  loop
    perform custom.record_delete(c_workspace, v_table);
  end loop;
end
$archive$;
