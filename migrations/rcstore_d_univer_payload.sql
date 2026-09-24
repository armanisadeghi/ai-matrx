-- RC-A1 (common-docs/projects/rich-content-unification/STORE-DESIGN.md §3, §5 step 2):
-- content.univer_payload — insert-only Univer snapshots, one per (document_id, content_version) (STORE-DESIGN §3.5/§3.6). Behaviour attached by rcstore_g.
-- A Detail (component) of `document`, built EMPTY by the one sanctioned builder with the base
-- contract deferred (attached by rcstore_h, validated and certified by rcstore_i).
-- Apply inside the 1–4 AM PT window, in order after rcstore_b.

set local lock_timeout = '2s';
-- platform.provision's preflight refuses a statement ceiling above 60s, and (from aidream 1024)
-- a transaction older than 5 s at entry: each table is therefore built in its OWN migration,
-- as the first real work of a young transaction.
set local statement_timeout = '60s';

select platform.provision($spec${
  "schema": "content",
  "table": "univer_payload",
  "token": "univer_payload",
  "label": "Univer Payload",
  "type": "detail",
  "origin": "standard",
  "description": "Insert-only Univer document snapshots, one per (document_id, content_version). Written only by content.univer_save / content.version_restore; never updated, so a formatting-only edit mints a new content version.",
  "parents": ["document:document_id"],
  "access": {},
  "component_anon_read_via_public_parent": false,
  "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321",
  "category_label": "Documents",
  "versioned": false,
  "soft_delete": false,
  "sharing": false,
  "fields": [
    {"name": "document_id", "type": "uuid", "not_null": true,
     "references": {"target": "document", "on_delete": "cascade"},
     "relationship_kind": "composition", "relationship_note": "A payload is one version of its Univer document's truth.",
     "description": "The Univer document."},
    {"name": "content_version", "type": "integer", "not_null": true, "description": "The content version this snapshot is the truth of."},
    {"name": "snapshot", "type": "jsonb", "not_null": true, "check": "jsonb_typeof(snapshot) = 'object'", "description": "The Univer IDocumentData snapshot."}
  ],
  "indexes": [
    {"columns": ["document_id", "content_version"], "unique": true,
     "where_omitted_reason": "Payload rows are never soft-deleted; one payload per content version."}
  ]
}$spec$::jsonb, 'runner');
