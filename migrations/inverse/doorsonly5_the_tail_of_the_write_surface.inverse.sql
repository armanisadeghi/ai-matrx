-- chair-step: DOORS-ONLY-5 inverse — restores every permissive write policy the tail file
-- dropped, byte-exactly (this file was GENERATED from pg_policy, not retyped), and drops the
-- `_select` twins it created. That puts the client write SURFACE back across `platform` and
-- `iam`: it does not re-grant anything, so nothing becomes writable, but it is the declaration
-- the doors-only ruling closed. Only run it to undo a closure that broke a real path, and say
-- which path.

set local lock_timeout = '2s';

create policy "platform_admin_all" on iam."org_industries"
  as permissive for all to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
drop policy if exists "platform_admin_all_select" on iam."org_industries";

create policy "admin_delete" on iam."organization_preferences"
  as permissive for delete to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR is_org_admin(organization_id)));

create policy "admin_insert" on iam."organization_preferences"
  as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR is_org_admin(organization_id)));

create policy "admin_update" on iam."organization_preferences"
  as permissive for update to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR is_org_admin(organization_id)))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR is_org_admin(organization_id)));

create policy "platform_admin_all" on iam."organization_preferences"
  as permissive for all to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
drop policy if exists "platform_admin_all_select" on iam."organization_preferences";

create policy "org_delete_policy" on iam."organizations"
  as permissive for delete to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (iam.is_org_owner(id, ( SELECT auth.uid() AS uid)) AND (is_personal = false))));

create policy "org_insert_policy" on iam."organizations"
  as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid))));

create policy "org_update_policy" on iam."organizations"
  as permissive for update to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR iam.is_org_manager(id, ( SELECT auth.uid() AS uid))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR iam.is_org_manager(id, ( SELECT auth.uid() AS uid))));

create policy "Users can create permissions for own resources" on iam."permissions"
  as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR is_resource_owner(resource_type, resource_id)));

create policy "Users can delete permissions for own resources" on iam."permissions"
  as permissive for delete to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR is_resource_owner(resource_type, resource_id)));

create policy "Users can update permissions for own resources" on iam."permissions"
  as permissive for update to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR is_resource_owner(resource_type, resource_id)));

create policy "platform_admin_all" on iam."system_orgs"
  as permissive for all to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
drop policy if exists "platform_admin_all_select" on iam."system_orgs";

create policy "platform_admin_all" on platform."_bak_assoc_file_processed_document_20260812"
  as permissive for all to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
drop policy if exists "platform_admin_all_select" on platform."_bak_assoc_file_processed_document_20260812";

create policy "platform_admin_all" on platform."_bak_assoc_type_file_processed_document_20260812"
  as permissive for all to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
drop policy if exists "platform_admin_all_select" on platform."_bak_assoc_type_file_processed_document_20260812";

create policy "assoc_delete" on platform."associations"
  as permissive for delete to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_access(organization_id)));

create policy "assoc_insert" on platform."associations"
  as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND iam.has_org_access(organization_id))));

create policy "assoc_update" on platform."associations"
  as permissive for update to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_access(organization_id)))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_access(organization_id)));

create policy "feature_knob_no_write" on platform."feature_knob"
  as permissive for all to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR false))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR false));
drop policy if exists "feature_knob_no_write_select" on platform."feature_knob";

create policy "platform_admin_all" on platform."feature_knob"
  as permissive for all to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
drop policy if exists "platform_admin_all_select" on platform."feature_knob";

create policy "platform_admin_all" on platform."mtx_media_heal_queue"
  as permissive for all to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
drop policy if exists "platform_admin_all_select" on platform."mtx_media_heal_queue";

create policy "platform_admin_all" on platform."org_change_policy"
  as permissive for all to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
drop policy if exists "platform_admin_all_select" on platform."org_change_policy";

create policy "platform_admin_only" on platform."org_context_ledger"
  as permissive for all to public
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
drop policy if exists "platform_admin_only_select" on platform."org_context_ledger";

create policy "omc_write" on platform."org_module_config"
  as permissive for all to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_owner(organization_id)))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_owner(organization_id)));
drop policy if exists "omc_write_select" on platform."org_module_config";

create policy "platform_admin_all" on platform."org_module_config"
  as permissive for all to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
drop policy if exists "platform_admin_all_select" on platform."org_module_config";

create policy "reference_declaration_no_client" on platform."reference_declaration"
  as permissive for all to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_admin() AS is_admin)))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR false));
drop policy if exists "reference_declaration_no_client_select" on platform."reference_declaration";
