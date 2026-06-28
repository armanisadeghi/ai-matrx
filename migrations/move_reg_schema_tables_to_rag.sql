-- Move all tables from reg schema to rag (typo fix: reg → rag)
-- The 'reg' schema was created by mistake; the correct destination is 'rag'.
ALTER TABLE IF EXISTS reg.context_item_suggestions SET SCHEMA rag;
ALTER TABLE IF EXISTS reg.kg_alerts SET SCHEMA rag;
ALTER TABLE IF EXISTS reg.kg_suggestion_ack SET SCHEMA rag;
ALTER TABLE IF EXISTS reg.kg_sweep_queue SET SCHEMA rag;
ALTER TABLE IF EXISTS reg.kg_sweep_run SET SCHEMA rag;
ALTER TABLE IF EXISTS reg.kg_sweep_state SET SCHEMA rag;
ALTER TABLE IF EXISTS reg.kg_value_matches SET SCHEMA rag;
ALTER TABLE IF EXISTS reg.ner_canonicalizer_shadow SET SCHEMA rag;
ALTER TABLE IF EXISTS reg.scope_association_suggestions SET SCHEMA rag;
ALTER TABLE IF EXISTS reg.scope_item_value_suggestions SET SCHEMA rag;
ALTER TABLE IF EXISTS reg.scope_suggestions SET SCHEMA rag;

-- Recreate public views pointing to rag.* instead of reg.*

CREATE OR REPLACE VIEW public.v_context_item_suggestions AS
 SELECT s.id,
    s.user_id,
    s.organization_id,
    s.scope_type_id,
    s.suggested_key,
    s.display_name,
    s.rationale,
    s.example_value,
    s.example_source_kind,
    s.example_source_id,
    s.confidence,
    s.status,
    s.created_at,
    s.decided_at,
    s.decided_by,
    s.suppressed_until,
    st.label_singular AS scope_type_label,
    st.label_plural AS scope_type_label_plural,
    st.icon AS scope_type_icon,
    st.slug AS scope_type_slug
   FROM rag.context_item_suggestions s
     LEFT JOIN context.scope_types st ON st.id = s.scope_type_id;

CREATE OR REPLACE VIEW public.v_kg_alerts AS
 SELECT a.id,
    a.user_id,
    a.organization_id,
    a.source_kind,
    a.source_id,
    a.target_scope_id,
    a.target_slot_key,
    a.kind,
    a.severity,
    a.description,
    a.suggested_action,
    a.evidence,
    a.confidence,
    a.status,
    a.created_at,
    a.decided_at,
    a.decided_by,
    a.viewed_at,
    s.name AS scope_name
   FROM rag.kg_alerts a
     LEFT JOIN context.scopes s ON s.id = a.target_scope_id
  WHERE a.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_kg_value_matches AS
 SELECT m.id,
    m.user_id,
    m.organization_id,
    m.source_kind,
    m.source_id,
    m.kg_entity_id,
    m.target_scope_id,
    m.target_context_item_id,
    m.target_slot_key,
    m.matched_value,
    m.current_value_snapshot,
    m.mention_count,
    m.evidence_chunk_id,
    m.confidence,
    m.created_at,
    sc.name AS scope_name,
    sc.slug AS scope_slug,
    st.label_singular AS scope_type_label,
    st.icon AS scope_type_icon,
    ci.display_name AS item_label,
    ci.key AS item_key
   FROM rag.kg_value_matches m
     LEFT JOIN context.scopes sc ON sc.id = m.target_scope_id
     LEFT JOIN context.scope_types st ON st.id = sc.scope_type_id
     LEFT JOIN context.context_items ci ON ci.id = m.target_context_item_id
  WHERE m.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_ner_canonicalizer_shadow AS
 SELECT id,
    user_id,
    organization_id,
    source_kind,
    source_id,
    run_id,
    input_pair_count,
    agent_input_json,
    agent_output_json,
    agent_merge_group_count,
    deterministic_groups_json,
    deterministic_merge_group_count,
    comparison_json,
    agreed_merge_surface_count,
    agent_only_merge_surface_count,
    deterministic_only_merge_surface_count,
    agent_model,
    agent_cost_usd,
    agent_elapsed_ms,
    agent_error,
    status,
    created_at
   FROM rag.ner_canonicalizer_shadow s;

CREATE OR REPLACE VIEW public.v_scope_suggestion_stats AS
 SELECT organization_id,
    status,
    is_starred,
    count(*)::integer AS n
   FROM (
     SELECT scope_item_value_suggestions.organization_id,
            scope_item_value_suggestions.status,
            scope_item_value_suggestions.is_starred
           FROM rag.scope_item_value_suggestions
        UNION ALL
         SELECT scope_association_suggestions.organization_id,
            scope_association_suggestions.status,
            scope_association_suggestions.is_starred
           FROM rag.scope_association_suggestions
   ) u
  GROUP BY organization_id, status, is_starred;

CREATE OR REPLACE VIEW public.v_scope_suggestions AS
 SELECT s.id,
    'value'::text AS stage,
    s.user_id,
    s.organization_id,
    s.source_kind,
    s.source_id,
    s.kg_entity_id,
    s.target_scope_id,
    s.target_context_item_id AS target_item_id,
    s.target_slot_key AS target_slot,
    s.suggested_value,
    s.current_value_snapshot,
    s.match_kind,
    s.confidence,
    s.status,
    s.context_snippet,
    s.decision_note,
    s.is_starred,
    s.viewed_at,
    s.created_at,
    s.decided_at,
    s.decided_by,
    s.suppressed_until,
    org.name AS org_name,
    org.slug AS org_slug,
    st.id AS scope_type_id,
    st.label_singular AS scope_type_label,
    st.slug AS scope_type_slug,
    st.icon AS scope_type_icon,
    sc.name AS scope_name,
    sc.slug AS scope_slug,
    ci.display_name AS item_label,
    ci.key AS item_key
   FROM rag.scope_item_value_suggestions s
     LEFT JOIN context.scopes sc ON sc.id = s.target_scope_id
     LEFT JOIN context.scope_types st ON st.id = sc.scope_type_id
     LEFT JOIN organizations org ON org.id = s.organization_id
     LEFT JOIN context.context_items ci ON ci.id = s.target_context_item_id
  WHERE s.deleted_at IS NULL
UNION ALL
 SELECT a.id,
    'association'::text AS stage,
    a.user_id,
    a.organization_id,
    a.source_kind,
    a.source_id,
    a.kg_entity_id,
    a.target_scope_id,
    a.target_scope_item_id AS target_item_id,
    a.target_slot_name AS target_slot,
    a.suggested_value,
    NULL::text AS current_value_snapshot,
    a.match_kind,
    a.confidence,
    a.status,
    a.context_snippet,
    a.decision_note,
    a.is_starred,
    a.viewed_at,
    a.created_at,
    a.decided_at,
    a.decided_by,
    a.suppressed_until,
    org.name AS org_name,
    org.slug AS org_slug,
    st.id AS scope_type_id,
    st.label_singular AS scope_type_label,
    st.slug AS scope_type_slug,
    st.icon AS scope_type_icon,
    sc.name AS scope_name,
    sc.slug AS scope_slug,
    ci.display_name AS item_label,
    ci.key AS item_key
   FROM rag.scope_association_suggestions a
     LEFT JOIN context.scopes sc ON sc.id = a.target_scope_id
     LEFT JOIN context.scope_types st ON st.id = sc.scope_type_id
     LEFT JOIN organizations org ON org.id = a.organization_id
     LEFT JOIN context.context_items ci ON ci.id = a.target_scope_item_id
  WHERE a.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_scope_suggestions_new AS
 SELECT s.id,
    s.user_id,
    s.organization_id,
    s.source_kind,
    s.source_id,
    s.scope_type_id,
    s.scope_type_label,
    s.suggested_name,
    s.suggested_slot_values,
    s.reasoning,
    s.confidence,
    s.status,
    s.created_at,
    s.decided_at,
    s.decided_by,
    s.suppressed_until,
    st.label_singular AS resolved_scope_type_label,
    st.icon AS scope_type_icon,
    st.slug AS scope_type_slug
   FROM rag.scope_suggestions s
     LEFT JOIN context.scope_types st ON st.id = s.scope_type_id;

CREATE OR REPLACE VIEW public.v_kg_sweep_effectiveness AS
 WITH sugg AS (
         SELECT scope_item_value_suggestions.sweep_run_id,
            scope_item_value_suggestions.status
           FROM rag.scope_item_value_suggestions
          WHERE scope_item_value_suggestions.sweep_run_id IS NOT NULL
        UNION ALL
         SELECT scope_association_suggestions.sweep_run_id,
            scope_association_suggestions.status
           FROM rag.scope_association_suggestions
          WHERE scope_association_suggestions.sweep_run_id IS NOT NULL
        UNION ALL
         SELECT scope_suggestions.sweep_run_id,
            scope_suggestions.status
           FROM rag.scope_suggestions
          WHERE scope_suggestions.sweep_run_id IS NOT NULL
        UNION ALL
         SELECT context_item_suggestions.sweep_run_id,
            context_item_suggestions.status
           FROM rag.context_item_suggestions
          WHERE context_item_suggestions.sweep_run_id IS NOT NULL
        )
 SELECT r.id AS sweep_run_row_id,
    r.run_id AS sweep_run_id,
    r.trigger_type,
    r.organization_id,
    r.scope_type_id,
    r.status AS run_status,
    r.suggestions_created,
    r.entities_selected,
    r.llm_calls,
    r.cost_usd,
    r.started_at,
    r.completed_at,
    count(s.*) AS suggestions_tracked,
    count(*) FILTER (WHERE s.status = 'pending'::text) AS pending,
    count(*) FILTER (WHERE s.status = 'accepted'::text) AS accepted,
    count(*) FILTER (WHERE s.status = 'rejected'::text) AS rejected,
    count(*) FILTER (WHERE s.status = 'deferred'::text) AS deferred,
    count(*) FILTER (WHERE s.status = 'expired'::text) AS expired
   FROM rag.kg_sweep_run r
     LEFT JOIN sugg s ON s.sweep_run_id = r.run_id
  GROUP BY r.id;
