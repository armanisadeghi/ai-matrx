-- chair-step: lane SCOPES-CONTRACT's window (SCOPES-CUTOVER-PLAN 4.3.3), prepared by lane SCOPES-READS-REST. NOT APPLIED BY SCOPES-READS-REST. Swaps the five public suggestion views onto the record store: each becomes the body of its public.<name>_from_store twin (scopesreadsrest_the_five_suggestion_views_are_built_beside_from_the_store.sql, which must be on the database first), same columns, same order, same types, security_invoker kept, grants kept (CREATE OR REPLACE VIEW keeps the ACL). After it no view names context.*, so the tables can move to graveyard.
-- lane: SCOPES-READS-REST (prepared) / SCOPES-CONTRACT (applies, in the 01:00-04:00 PT window)
-- INVERSE: migrations/inverse/scopesreadsrest_the_five_suggestion_views_read_the_store_swap_down.sql
-- window-class: CREATE OR REPLACE VIEW x5 — ACCESS EXCLUSIVE on each VIEW for the swap (milliseconds; no table is locked above ACCESS SHARE). Run with lock_timeout 3s and retry. Rehearsed on the dev clone (up, inverse, up) by SCOPES-READS-REST.

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
     LEFT JOIN LATERAL public._ctx_scope_type_facts(s.scope_type_id) st(label_singular, label_plural, icon, slug) ON true;

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
    s.scope_name
   FROM rag.kg_alerts a
     LEFT JOIN LATERAL public._ctx_scope_facts(a.target_scope_id) s ON true
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
    sc.scope_name,
    sc.scope_slug,
    sc.type_label_singular AS scope_type_label,
    sc.type_icon AS scope_type_icon,
    ci.display_name AS item_label,
    ci.key AS item_key
   FROM rag.kg_value_matches m
     LEFT JOIN LATERAL public._ctx_scope_facts(m.target_scope_id) sc ON true
     LEFT JOIN LATERAL public._ctx_item_facts(m.target_context_item_id) ci ON true
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
    sc.scope_type_id,
    sc.type_label_singular AS scope_type_label,
    sc.type_slug AS scope_type_slug,
    sc.type_icon AS scope_type_icon,
    sc.scope_name,
    sc.scope_slug,
    ci.display_name AS item_label,
    ci.key AS item_key
   FROM rag.scope_item_value_suggestions s
     LEFT JOIN LATERAL public._ctx_scope_facts(s.target_scope_id) sc ON true
     LEFT JOIN iam.organizations org ON org.id = s.organization_id
     LEFT JOIN LATERAL public._ctx_item_facts(s.target_context_item_id) ci ON true
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
    sc.scope_type_id,
    sc.type_label_singular AS scope_type_label,
    sc.type_slug AS scope_type_slug,
    sc.type_icon AS scope_type_icon,
    sc.scope_name,
    sc.scope_slug,
    ci.display_name AS item_label,
    ci.key AS item_key
   FROM rag.scope_association_suggestions a
     LEFT JOIN LATERAL public._ctx_scope_facts(a.target_scope_id) sc ON true
     LEFT JOIN iam.organizations org ON org.id = a.organization_id
     LEFT JOIN LATERAL public._ctx_item_facts(a.target_scope_item_id) ci ON true
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
     LEFT JOIN LATERAL public._ctx_scope_type_facts(s.scope_type_id) st(label_singular, label_plural, icon, slug) ON true;
