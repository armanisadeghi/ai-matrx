-- chair-step: inverse of provisionlock_workspace_threads_reads_through_its_bounded_lane.sql (written by lane NIGHT-WINDOW-0930 for its clone rehearsal) — puts back every policy on workspace.threads exactly as the clone (production's copy of 2026-09-29) held them, with the unbounded read lane.
-- lane: NIGHT-WINDOW-0930
-- window-class: drops and recreates the nine policies on workspace.threads; each takes ACCESS EXCLUSIVE plus the 23-relation supautils set, held to COMMIT; apply only with Arman watching
--
-- inverse of provisionlock_workspace_threads_reads_through_its_bounded_lane.sql

set local lock_timeout = '3s';

-- workspace.threads: 9 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('workspace.threads'::regclass, 'inverse: restore workspace.threads policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'workspace' and tablename = 'threads' loop execute format('drop policy %I on workspace.threads', p.policyname); end loop; end $$;
create policy org_open_gate on workspace.threads as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on workspace.threads as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on workspace.threads as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy ref_target_gate on workspace.threads as restrictive for all to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (anchor_type IS NULL) OR (anchor_id IS NULL) OR iam.has_access(anchor_type, anchor_id, 'viewer'::permission_level)))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (anchor_type IS NULL) OR (anchor_id IS NULL) OR iam.has_access(anchor_type, anchor_id, 'viewer'::permission_level)));
create policy std_delete on workspace.threads as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('thread'::text, id, 'admin'::permission_level))));
create policy std_insert on workspace.threads as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on workspace.threads as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('thread'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'thread'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'thread'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'thread'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'thread'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'thread'::text))) AND iam.has_access('thread'::text, id, 'viewer'::permission_level)))));
create policy std_update on workspace.threads as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('thread'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('thread'::text, id, 'editor'::permission_level))));
create policy svc_all on workspace.threads as permissive for all to service_role
  using (true)
  with check (true);

