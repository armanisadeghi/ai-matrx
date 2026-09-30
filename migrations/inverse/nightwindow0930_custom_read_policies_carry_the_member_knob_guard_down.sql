-- chair-step: inverse of nightwindow0930_custom_read_policies_carry_the_member_knob_guard.sql — puts back every policy on custom.record and its 14 sibling custom.* tables exactly as the clone (production's copy of 2026-09-29) held them, without the member-knob guard.
-- lane: NIGHT-WINDOW-0930
--
-- inverse of nightwindow0930_custom_read_policies_carry_the_member_knob_guard.sql

set local lock_timeout = '3s';

-- custom.anon_form: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.anon_form'::regclass, 'inverse: restore custom.anon_form policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'anon_form' loop execute format('drop policy %I on custom.anon_form', p.policyname); end loop; end $$;
create policy org_open_gate on custom.anon_form as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.anon_form as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.anon_form as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.anon_form as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_form'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.anon_form as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.anon_form as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('anon_form'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'anon_form'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'anon_form'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'anon_form'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'anon_form'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'anon_form'::text))) AND iam.has_access('anon_form'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.anon_form as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_form'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_form'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.anon_form as permissive for all to service_role
  using (true)
  with check (true);

-- custom.anon_hit: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.anon_hit'::regclass, 'inverse: restore custom.anon_hit policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'anon_hit' loop execute format('drop policy %I on custom.anon_hit', p.policyname); end loop; end $$;
create policy org_open_gate on custom.anon_hit as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.anon_hit as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.anon_hit as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.anon_hit as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_hit'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.anon_hit as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.anon_hit as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('anon_hit'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'anon_hit'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'anon_hit'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'anon_hit'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'anon_hit'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'anon_hit'::text))) AND iam.has_access('anon_hit'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.anon_hit as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_hit'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_hit'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.anon_hit as permissive for all to service_role
  using (true)
  with check (true);

-- custom.anon_inbound: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.anon_inbound'::regclass, 'inverse: restore custom.anon_inbound policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'anon_inbound' loop execute format('drop policy %I on custom.anon_inbound', p.policyname); end loop; end $$;
create policy org_open_gate on custom.anon_inbound as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.anon_inbound as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.anon_inbound as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.anon_inbound as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_inbound'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.anon_inbound as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.anon_inbound as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('anon_inbound'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'anon_inbound'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'anon_inbound'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'anon_inbound'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'anon_inbound'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'anon_inbound'::text))) AND iam.has_access('anon_inbound'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.anon_inbound as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_inbound'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_inbound'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.anon_inbound as permissive for all to service_role
  using (true)
  with check (true);

-- custom.anon_replay: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.anon_replay'::regclass, 'inverse: restore custom.anon_replay policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'anon_replay' loop execute format('drop policy %I on custom.anon_replay', p.policyname); end loop; end $$;
create policy org_open_gate on custom.anon_replay as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.anon_replay as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.anon_replay as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.anon_replay as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_replay'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.anon_replay as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.anon_replay as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('anon_replay'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'anon_replay'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'anon_replay'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'anon_replay'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'anon_replay'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'anon_replay'::text))) AND iam.has_access('anon_replay'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.anon_replay as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_replay'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_replay'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.anon_replay as permissive for all to service_role
  using (true)
  with check (true);

-- custom.anon_submission: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.anon_submission'::regclass, 'inverse: restore custom.anon_submission policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'anon_submission' loop execute format('drop policy %I on custom.anon_submission', p.policyname); end loop; end $$;
create policy org_open_gate on custom.anon_submission as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.anon_submission as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.anon_submission as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.anon_submission as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_submission'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.anon_submission as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.anon_submission as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('anon_submission'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'anon_submission'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'anon_submission'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'anon_submission'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'anon_submission'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'anon_submission'::text))) AND iam.has_access('anon_submission'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.anon_submission as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_submission'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_submission'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.anon_submission as permissive for all to service_role
  using (true)
  with check (true);

-- custom.anon_token: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.anon_token'::regclass, 'inverse: restore custom.anon_token policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'anon_token' loop execute format('drop policy %I on custom.anon_token', p.policyname); end loop; end $$;
create policy org_open_gate on custom.anon_token as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.anon_token as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.anon_token as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.anon_token as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_token'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.anon_token as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.anon_token as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('anon_token'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'anon_token'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'anon_token'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'anon_token'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'anon_token'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'anon_token'::text))) AND iam.has_access('anon_token'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.anon_token as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_token'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_token'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.anon_token as permissive for all to service_role
  using (true)
  with check (true);

-- custom.doc_render: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.doc_render'::regclass, 'inverse: restore custom.doc_render policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'doc_render' loop execute format('drop policy %I on custom.doc_render', p.policyname); end loop; end $$;
create policy org_open_gate on custom.doc_render as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.doc_render as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.doc_render as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.doc_render as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('doc_render'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.doc_render as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.doc_render as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('doc_render'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'doc_render'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'doc_render'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'doc_render'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'doc_render'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'doc_render'::text))) AND iam.has_access('doc_render'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.doc_render as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('doc_render'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('doc_render'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.doc_render as permissive for all to service_role
  using (true)
  with check (true);

-- custom.doc_signature: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.doc_signature'::regclass, 'inverse: restore custom.doc_signature policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'doc_signature' loop execute format('drop policy %I on custom.doc_signature', p.policyname); end loop; end $$;
create policy org_open_gate on custom.doc_signature as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.doc_signature as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.doc_signature as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.doc_signature as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('doc_signature'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.doc_signature as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.doc_signature as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('doc_signature'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'doc_signature'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'doc_signature'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'doc_signature'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'doc_signature'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'doc_signature'::text))) AND iam.has_access('doc_signature'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.doc_signature as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('doc_signature'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('doc_signature'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.doc_signature as permissive for all to service_role
  using (true)
  with check (true);

-- custom.external_link: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.external_link'::regclass, 'inverse: restore custom.external_link policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'external_link' loop execute format('drop policy %I on custom.external_link', p.policyname); end loop; end $$;
create policy org_open_gate on custom.external_link as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.external_link as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.external_link as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.external_link as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('external_link'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.external_link as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.external_link as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('external_link'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'external_link'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'external_link'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'external_link'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'external_link'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'external_link'::text))) AND iam.has_access('external_link'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.external_link as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('external_link'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('external_link'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.external_link as permissive for all to service_role
  using (true)
  with check (true);

-- custom.external_source: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.external_source'::regclass, 'inverse: restore custom.external_source policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'external_source' loop execute format('drop policy %I on custom.external_source', p.policyname); end loop; end $$;
create policy org_open_gate on custom.external_source as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.external_source as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.external_source as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.external_source as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('external_source'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.external_source as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.external_source as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('external_source'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'external_source'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'external_source'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'external_source'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'external_source'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'external_source'::text))) AND iam.has_access('external_source'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.external_source as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('external_source'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('external_source'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.external_source as permissive for all to service_role
  using (true)
  with check (true);

-- custom.io_comment: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.io_comment'::regclass, 'inverse: restore custom.io_comment policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'io_comment' loop execute format('drop policy %I on custom.io_comment', p.policyname); end loop; end $$;
create policy org_open_gate on custom.io_comment as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.io_comment as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.io_comment as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.io_comment as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('io_comment'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.io_comment as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.io_comment as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('io_comment'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'io_comment'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'io_comment'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'io_comment'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'io_comment'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'io_comment'::text))) AND iam.has_access('io_comment'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.io_comment as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('io_comment'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('io_comment'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.io_comment as permissive for all to service_role
  using (true)
  with check (true);

-- custom.io_import: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.io_import'::regclass, 'inverse: restore custom.io_import policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'io_import' loop execute format('drop policy %I on custom.io_import', p.policyname); end loop; end $$;
create policy org_open_gate on custom.io_import as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.io_import as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.io_import as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.io_import as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('io_import'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.io_import as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.io_import as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('io_import'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'io_import'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'io_import'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'io_import'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'io_import'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'io_import'::text))) AND iam.has_access('io_import'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.io_import as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('io_import'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('io_import'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.io_import as permissive for all to service_role
  using (true)
  with check (true);

-- custom.io_outbox: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.io_outbox'::regclass, 'inverse: restore custom.io_outbox policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'io_outbox' loop execute format('drop policy %I on custom.io_outbox', p.policyname); end loop; end $$;
create policy org_open_gate on custom.io_outbox as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.io_outbox as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.io_outbox as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.io_outbox as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('io_outbox'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.io_outbox as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.io_outbox as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('io_outbox'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'io_outbox'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'io_outbox'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'io_outbox'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'io_outbox'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'io_outbox'::text))) AND iam.has_access('io_outbox'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.io_outbox as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('io_outbox'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('io_outbox'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.io_outbox as permissive for all to service_role
  using (true)
  with check (true);

-- custom.merge_field_provenance: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.merge_field_provenance'::regclass, 'inverse: restore custom.merge_field_provenance policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'merge_field_provenance' loop execute format('drop policy %I on custom.merge_field_provenance', p.policyname); end loop; end $$;
create policy org_open_gate on custom.merge_field_provenance as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.merge_field_provenance as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.merge_field_provenance as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.merge_field_provenance as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('merge_field_provenance'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.merge_field_provenance as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.merge_field_provenance as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('merge_field_provenance'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'merge_field_provenance'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'merge_field_provenance'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'merge_field_provenance'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'merge_field_provenance'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'merge_field_provenance'::text))) AND iam.has_access('merge_field_provenance'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.merge_field_provenance as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('merge_field_provenance'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('merge_field_provenance'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.merge_field_provenance as permissive for all to service_role
  using (true)
  with check (true);

-- custom.record: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.record'::regclass, 'inverse: restore custom.record policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'record' loop execute format('drop policy %I on custom.record', p.policyname); end loop; end $$;
create policy org_open_gate on custom.record as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.record as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.record as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.record as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('record'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.record as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.record as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'record'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'record'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'record'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'record'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'record'::text))) AND iam.has_access('record'::text, id, 'viewer'::permission_level)) OR ((deleted_at IS NULL) AND iam.record_visible_in_org(organization_id, table_id, id, visibility, created_by, 'viewer'::permission_level) AND iam.has_access('record'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.record as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('record'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('record'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.record as permissive for all to service_role
  using (true)
  with check (true);

