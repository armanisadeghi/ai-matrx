-- chair-step: DOORS-ONLY-2 inverse -- RE-GRANTS the client write privileges on the
-- twenty-five platform tables the chair step withdrew. Running this puts the declared write
-- surface back on every one of them. The restrictive refusal policies stay in place, so no
-- write becomes reachable again by this file alone -- but the surface the ruling is about
-- returns, and one dropped policy would make it live. Only run it to undo a withdrawal that
-- broke a real path, and say which path.

grant insert, update, delete on platform."_bak_assoc_file_processed_document_20260812" to authenticated;
grant insert, update, delete on platform."_bak_assoc_type_file_processed_document_20260812" to authenticated;
grant insert, update, delete on platform."_base_entity" to authenticated;
grant insert, update, delete on platform."actor_session" to authenticated;
grant insert, update, delete on platform."association_types" to authenticated;
grant insert, update, delete on platform."assurance_level" to authenticated;
grant insert, update, delete on platform."comments" to authenticated;
grant insert, update, delete on platform."custom_entity_definition" to authenticated;
grant insert, update, delete on platform."deprecated_relations" to authenticated;
grant insert, update, delete on platform."domain_classification" to authenticated;
grant insert, update, delete on platform."edge_payload_kind" to authenticated;
grant insert, update, delete on platform."entity_relationships" to authenticated;
grant insert, update, delete on platform."lifecycle_entity_plan" to authenticated;
grant insert, update, delete on platform."lifecycle_reference_map" to authenticated;
grant insert, update, delete on platform."mtx_media_heal_queue" to authenticated;
grant insert, update, delete on platform."mtx_public_url_guard" to authenticated;
grant insert, update, delete on platform."org_module_config" to authenticated;
grant insert, update, delete on platform."outsider_consumer" to authenticated;
grant insert, update, delete on platform."purpose" to authenticated;
grant insert, update, delete on platform."reachability" to authenticated;
grant insert, update, delete on platform."reference_categories" to authenticated;
grant insert, update, delete on platform."reference_declaration" to authenticated;
grant insert, update, delete on platform."schemas" to authenticated;
grant insert, update, delete on platform."source_authority" to authenticated;
grant insert, update, delete on platform."user_entity_state" to authenticated;
