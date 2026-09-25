-- target: branch
--
-- W1-PROV — the two remaining PROVISIONER REGISTRIES the rehearsal branch did not have.
--
-- Same class and same reason as `w1_prov_branch_registry_levelling.sql`: rule 36 levels the
-- branch's SCHEMA, not its registry ROWS.
--
--   · `platform.provision_vocabulary`  — production 20 rows, branch 0. Every `*.unknown`
--     refusal reads its legal values from here through
--     `platform.provision_live_vocabulary(name)`, which RAISES on a missing row rather than
--     falling back — so on the branch a spec naming an index method died with
--     "no declared vocabulary named index_method" instead of being validated.
--   · `platform.stamped_write_table`   — production 1 row, branch 0. `iam.apply_table_grants`
--     reads it to decide whether a table gets the READ-ONLY client grant (DD-248). With the
--     row missing, a regeneration of `context.context_item_values` on the branch would have
--     handed `authenticated` insert/update/delete on the platform's scope cells — the exact
--     thing B-139 found and this register exists to stop.
--
-- Every row is production's own, read SELECT-only 2026-09-17 and written verbatim.
-- BRANCH ONLY; production already holds every row.
-- THE INVERSE: `migrations/inverse/w1_prov_branch_vocabulary_levelling_down.sql`.

set lock_timeout = '2s';
set statement_timeout = '120s';

insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('audit_class', '{entity,machinery}', 'platform.entity_types|entity_types_audit_class_valid', 'check', 'PLAN §4.4 audit_class') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('client_access', '{anonymous,server_only,signed_in}', 'platform.client_callable_door flags (anonymous_callers / signed_in_callers / neither)', 'postgres_fixed', 'PLAN §4.5 functions[].client_access') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('container_side', '{none,source,target}', 'platform.association_types|association_types_container_side_check', 'check', 'PLAN §4.5 association_types.container_side') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('content_role', '{container,destination,hybrid,source,utility}', 'platform.entity_types|entity_types_content_role_check', 'check', 'PLAN §4.4 content_role') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('data_class', '{confidential,organization,private,public}', 'platform.data_class', 'enum', 'PLAN §4.2 access.data_class') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('fk_on_delete', '{cascade,no_action,restrict,set_null}', 'PostgreSQL FK action list', 'postgres_fixed', 'PLAN §4.3 fields[].references.on_delete') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('index_method', '{btree,gin,gist,hnsw}', 'select amname from pg_am where amtype = ''i''', 'postgres_fixed', 'PLAN §4.3 indexes[].method') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('knob_override_direction', '{any,lower_only,raise_only}', 'platform.feature_knob|feature_knob_override_direction_check', 'check', 'PLAN §4.5 knobs override_direction') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('knob_propagation', '{instant,next_load}', 'platform.feature_knob|feature_knob_propagation_check', 'check', 'PLAN §4.5 knobs propagation') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('knob_scope_kind', '{agent,brand,device,employer_profile,location,organization,pay_group,rulebook,site,table,user}', 'select kind from platform.knob_scope_kind', 'table', 'PLAN §4.5 the 11 live rungs') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('knob_set_by', '{agent,human}', 'platform.feature_knob|feature_knob_set_by_check', 'check', 'PLAN §4.5 knobs set_by') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('knob_value_type', '{boolean,enum,integer,json,number,secret,string}', 'platform.feature_knob|feature_knob_value_type_check', 'check', 'PLAN §4.5 knobs value_type') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('list_scope', '{mine,organization}', 'platform.list_scope', 'enum', 'PLAN §4.2 access.default_list_scope') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('origin', '{custom,standard}', 'platform.entity_types|entity_types_origin_check', 'check', 'PLAN §4.2 origin') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('relation_kind', '{projection,table}', 'platform.entity_types|entity_types_relation_kind_valid', 'check', 'PLAN §4.4 relation_kind') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('relationship_kind', '{composition,lookup,reference}', 'platform.provision_validate (no live catalogue list — the provisioner owns this word)', 'postgres_fixed', 'PLAN §4.3 fields[].relationship_kind') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('rls_variant', '{component,detail,entity,ledger,personal,restricted,system}', 'platform.entity_types|entity_types_rls_variant_valid', 'check', 'PLAN §4.2 the type mapping table') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('spec_type', '{deprecated,detail,entity,ledger,reference,restricted,system}', 'Data Doctrine R2 — the ruled seven (no live catalogue list; the mapping to rls_variant is in the code)', 'postgres_fixed', 'PLAN §4.2 the ruled seven') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('version_store', '{custom,history}', 'platform.entity_types|entity_types_version_store_check', 'check', 'PLAN §4.3 version_store') on conflict (name) do nothing;
insert into platform.provision_vocabulary (name, declared, live_source, source_kind, doc_reference) values ('visibility', '{internal,link,personal,public}', 'platform.visibility', 'enum', 'PLAN §4.2 access.visibility (there is no `none`)') on conflict (name) do nothing;

insert into platform.stamped_write_table (schema_name, table_name, stamp_column, rls_variant, declared_by, reason) values ('context', 'context_item_values', 'authored_by', 'component', 'DD-248 / B-139', 'Every scope cell in the platform, append-only, one row per version. `authored_by` is who the platform names when somebody asks who filled a cell, and `source_type` is how it tells an AI enrichment from a person typing. context.write_context_value is the ONE writer that sets them; public.set_context_value, public.set_scope_context_value, public.scope_system_apply and context.provision_scope_dataset are its declared SECURITY DEFINER doors and each derives the actor from auth.uid(). The `component` variant is correct and stays — it is what makes a cell''s read access flow from its parent scope — so it is THIS REGISTER, read by iam.apply_table_grants, that withholds the client write privilege.') on conflict (schema_name, table_name) do nothing;

