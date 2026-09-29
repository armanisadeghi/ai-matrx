-- Inverse of scopesreadsrest_the_five_suggestion_views_read_the_store_swap.sql: the five public suggestion views back on context.*, byte for byte as they were on
-- production 2026-09-29 (only while the older tables are still where they were).
-- lane: SCOPES-READS-REST (prepared) / SCOPES-CONTRACT

create or replace view public.v_context_item_suggestions with (security_invoker = true) as
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

create or replace view public.v_kg_alerts with (security_invoker = true) as
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

create or replace view public.v_kg_value_matches with (security_invoker = true) as
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

create or replace view public.v_scope_suggestions with (security_invoker = true) as
SELECT s.id,
    'value'::text AS stage,
    s.created_by AS user_id,
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
     LEFT JOIN iam.organizations org ON org.id = s.organization_id
     LEFT JOIN context.context_items ci ON ci.id = s.target_context_item_id
  WHERE s.deleted_at IS NULL
UNION ALL
 SELECT a.id,
    'association'::text AS stage,
    a.created_by AS user_id,
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
     LEFT JOIN iam.organizations org ON org.id = a.organization_id
     LEFT JOIN context.context_items ci ON ci.id = a.target_scope_item_id
  WHERE a.deleted_at IS NULL;

create or replace view public.v_scope_suggestions_new with (security_invoker = true) as
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
