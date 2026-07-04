-- register_data_store_entity_type.sql
-- Register `rag.data_stores` as a first-class entity in the authoritative
-- registry `platform.entity_types` so a knowledge store can be a valid
-- association source (e.g. War Room attaches "AMA Guides" to a case thread and
-- the thread agent immediately gets `rag_search(data_store_id)` scope).
--
-- ROOT CAUSE this fixes: data stores are the canonical scope-gate for RAG
-- retrieval (rag.data_store_members + the rag_search tool), but they were never
-- registered — so `assoc_add(source_type => 'data_store', …)` FK-violates and no
-- surface can attach a store to anything.
--
-- Semantics from the live table: NOT versioned (no `version` column), NO
-- soft-delete column (`is_active` is a status flag), carries organization_id +
-- created_by. NOTE: `rag.*` is not PostgREST-exposed — FE listing goes through
-- the Python API (`useDataStores`), so association edges must stamp `label` at
-- attach time (context/UI titles never require a client-side rag read).
--
-- Idempotent: ON CONFLICT (token) DO NOTHING. Safe to re-apply.

insert into platform.entity_types
    (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active, notes)
values
    ('data_store', 'rag', 'data_stores', 'Data Store',
     1, false, false, true,
     'RAG knowledge store (rag.data_stores) — the scope-gate for rag_search retrieval. Attachable to containers (war-room threads, projects, tasks) to grant agents search scope. rag schema is not PostgREST-exposed: edges must carry label; candidate listing goes through the Python API.')
on conflict (token) do nothing;
