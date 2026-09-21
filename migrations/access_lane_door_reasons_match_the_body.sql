-- access_lane_door_reasons_match_the_body
--
-- D11 (DD-195): a door reason may name an iam access predicate only when the
-- body, or a function that body names, actually calls it. Five reasons named a
-- predicate the closure never reaches. The bodies are the gates that shipped;
-- the sentences were describing a predicate one hop further, or a predicate
-- that CALLS this function. The sentences now name the function the body calls.
--
-- D13 / D16a (DD-210 / DD-212): these signed-in doors already check the caller
-- in the body and already declare signed_in_callers, but authenticated holds no
-- EXECUTE, so the next CREATE OR REPLACE hands the grant back from a flag
-- nobody can use today. The grant is restored to match the declaration.
-- iam.resolve_publish_binding is the public-link door: anonymous_callers is
-- already true and the slug is the identity, so anon is granted too.
--
-- public.provision_mcp_server without p_organization_id is the overload that
-- cannot name an organization. authenticated was already revoked. The flag
-- stays true only on the overload that takes p_organization_id. This row is
-- marked not a client door so a replace cannot hand the grant back.

update platform.client_callable_door
   set reason = replace(
         reason,
         'iam.has_access_for(principal, ''record'', p_table_id, ''editor'')',
         'custom.has_visibility(custom.query_principal(), ''record'', p_table_id, ''editor'')'
       )
 where schema_name = 'custom'
   and function_name = 'anon_capture'
   and reason like '%iam.has_access_for(%';

update platform.client_callable_door
   set reason = replace(
         reason,
         'which resolves it against public.has_permission_for and iam.has_access_for_base',
         'which is the visibility answer this body returns'
       )
 where schema_name = 'custom'
   and function_name = 'has_visibility_at'
   and reason like '%iam.has_access_for_base%';

update platform.client_callable_door
   set reason = replace(
         reason,
         'so that iam.has_access_for_base can decide with them',
         'so the access walk that calls this helper can decide with them'
       )
 where schema_name = 'platform'
   and function_name = 'partitioned_row_attrs'
   and reason like '%iam.has_access_for_base%';

update platform.client_callable_door
   set reason = replace(
         reason,
         'iam.has_org_admin for a signed-in person, and the owner and service-role lanes as they were',
         'a signed-in administrator of this organization, and the owner and service-role lanes, the same way platform.assert_may_operate_unified_data_ramp already decides'
       )
 where schema_name = 'platform'
   and function_name = 'unified_data_ramp_state'
   and reason like '%iam.has_org_admin%';

update platform.client_callable_door
   set reason = replace(
         reason,
         'iam.has_access_for_base asks it as one arm of its own walk and the walk is what decides the caller.',
         'The access walk that calls this helper is what decides the caller.'
       )
 where schema_name = 'public'
   and function_name = 'library_is_open'
   and reason like '%iam.has_access_for_base%';

grant execute on function iam.claim_world_namespace(uuid, text) to authenticated;
grant execute on function iam.external_principal_card(uuid) to authenticated;
grant execute on function iam.external_principal_reach(text, uuid) to authenticated;
grant execute on function iam.is_external_principal(uuid) to authenticated;
grant execute on function iam.publish_binding_create(text, text, uuid, uuid, text) to authenticated;
grant execute on function iam.publish_binding_revoke(text) to authenticated;
grant execute on function iam.resolve_publish_binding(text) to authenticated, anon;
grant execute on function iam.world_publish_announcement(text, uuid) to authenticated;
grant execute on function public.create_user_list(character varying, text, uuid, boolean, boolean, boolean, jsonb, uuid) to authenticated;

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'Superseded by public.provision_mcp_server with p_organization_id. This signature cannot name an organization, so it is not a client door. service_role remains the caller. Do not grant authenticated.'
 where schema_name = 'public'
   and function_name = 'provision_mcp_server'
   and identity_args not like '%organization_id%'
   and signed_in_callers;
