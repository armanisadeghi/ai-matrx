-- chair-step: DOORS-ONLY-2 batch 2 inverse -- RE-GRANTS the client write privileges the
-- batch 2 chair step withdrew, including on iam.permissions, the grant table. The restrictive
-- refusal policies stay, so no write becomes reachable by this file alone -- but the surface
-- returns, and one dropped policy would make it live. Only run it to undo a withdrawal that
-- broke a real path, and say which path.

grant insert, update, delete on platform."approach" to authenticated;
grant insert, update, delete on platform."assist_producer_policy" to authenticated;
grant insert, update, delete on platform."assists" to authenticated;
grant insert, update, delete on platform."change_type_default" to authenticated;
grant insert, update, delete on platform."custom_field_definition" to authenticated;
grant insert, update, delete on platform."custom_field_target" to authenticated;
grant insert, update, delete on platform."custom_record" to authenticated;
grant insert, update, delete on platform."entity_types" to authenticated;
grant insert, update, delete on platform."masterwork_corpus_item" to authenticated;
grant insert, update, delete on platform."masterwork_source" to authenticated;
grant insert, update, delete on platform."org_change_policy" to authenticated;
grant insert, update, delete on platform."outcome_event" to authenticated;
grant insert, update, delete on platform."output_feedback" to authenticated;
grant insert, update, delete on platform."repo" to authenticated;
grant insert, update, delete on platform."shareable_resource_registry" to authenticated;
grant insert, update, delete on platform."taxonomy_node" to authenticated;
grant insert, update, delete on iam."permissions" to authenticated;
