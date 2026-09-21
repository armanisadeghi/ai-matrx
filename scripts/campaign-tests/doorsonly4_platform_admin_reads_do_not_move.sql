\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
begin;
set local statement_timeout = '300s';
create temporary table _c(tbl text primary key, n text) on commit drop;
do $$
declare r record; v bigint; v_err text;
begin
  for r in select * from (values ('iam','access_audit'),('iam','access_requests'),('iam','api_keys'),('iam','emergency_door_request'),('iam','industries'),('iam','industry_curators'),('iam','invitations'),('iam','membership_grant'),('iam','memberships'),('iam','org_industries'),('iam','org_member_controls'),('iam','organization_preferences'),('iam','organizations'),('iam','permissions'),('iam','system_orgs'),('iam','system_personal_org_failures'),('platform','_bak_assoc_file_processed_document_20260812'),('platform','_bak_assoc_type_file_processed_document_20260812'),('platform','_base_entity'),('platform','acquisition_block'),('platform','action_request'),('platform','activity_log'),('platform','actor_session'),('platform','actor_token'),('platform','actor_token_event'),('platform','approach'),('platform','assist_producer_policy'),('platform','assist_producer_policy_history'),('platform','assists'),('platform','association_types'),('platform','associations'),('platform','assurance_level'),('platform','categories'),('platform','change_type_default'),('platform','comments'),('platform','custom_entity_definition'),('platform','custom_field_definition'),('platform','custom_field_target'),('platform','custom_record'),('platform','ddl_guard_log'),('platform','deprecated_relations'),('platform','domain_classification'),('platform','edge_payload_kind'),('platform','egress_device'),('platform','entity_grants'),('platform','entity_relationships'),('platform','entity_types'),('platform','feature_knob'),('platform','flexible_data'),('platform','guided_checklist_run'),('platform','judge_verdict'),('platform','knob_scope_kind'),('platform','knob_write_door'),('platform','lifecycle_archive'),('platform','lifecycle_archive_row'),('platform','lifecycle_audit'),('platform','lifecycle_entity_plan'),('platform','lifecycle_map_build'),('platform','lifecycle_reference_map'),('platform','lifecycle_run'),('platform','masterwork_corpus_item'),('platform','masterwork_run'),('platform','masterwork_source'),('platform','mtx_media_heal_queue'),('platform','mtx_public_url_guard'),('platform','org_change_policy'),('platform','org_module_config'),('platform','outcome_event'),('platform','output_feedback'),('platform','outsider_consumer'),('platform','purpose'),('platform','reachability'),('platform','reference_categories'),('platform','reference_declaration'),('platform','repo'),('platform','retention_policy'),('platform','route_manifest'),('platform','rulebook'),('platform','saved_view'),('platform','schemas'),('platform','share_links'),('platform','shareable_resource_registry'),('platform','short_links'),('platform','source_authority'),('platform','taxonomy_node'),('platform','user_entity_state')) as x(s,t) order by 1,2 loop
    v_err := null;
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
      execute format('select count(*) from %I.%I', r.s, r.t) into v;
    exception when others then v_err := sqlstate; v := null;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    insert into _c values (r.s||'.'||r.t, coalesce(v::text, 'ERR '||v_err));
  end loop;
end $$;
select tbl || '=' || n from _c order by tbl;
rollback;
