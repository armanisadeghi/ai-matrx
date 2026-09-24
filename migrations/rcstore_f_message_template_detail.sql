-- RC-A1 (common-docs/projects/rich-content-unification/STORE-DESIGN.md §3, §5 step 2):
-- agent.message_template_detail — the structured fields of a message-template document, new token `message_template_detail` (STORE-DESIGN §3.6; the old token retires at migration, not here).
-- A Detail (component) of `document`, built EMPTY by the one sanctioned builder with the base
-- contract deferred (attached by rcstore_h, validated and certified by rcstore_i).
-- Apply inside the 1–4 AM PT window, in order after rcstore_b.

set local lock_timeout = '2s';
-- platform.provision's preflight refuses a statement ceiling above 60s, and (from aidream 1024)
-- a transaction older than 5 s at entry: each table is therefore built in its OWN migration,
-- as the first real work of a young transaction.
set local statement_timeout = '60s';

select platform.provision($spec${
  "schema": "agent",
  "table": "message_template_detail",
  "token": "message_template_detail",
  "label": "Message Template Detail",
  "type": "detail",
  "origin": "standard",
  "description": "The structured fields the platform enforces for a message-template document (STORE-DESIGN §3.6). Its id equals the document id (which equals the legacy agent.message_template id). Replaces the `message_template` token, which retires at migration.",
  "parents": ["document:document_id"],
  "access": {},
  "component_anon_read_via_public_parent": false,
  "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321",
  "category_label": "Documents",
  "versioned": false,
  "soft_delete": true,
  "sharing": false,
  "fields": [
    {"name": "document_id", "type": "uuid", "not_null": true, "unique": true,
     "references": {"target": "document", "on_delete": "cascade"},
     "relationship_kind": "composition", "relationship_note": "The template's structured fields belong to its document.",
     "description": "The message-template document."},
    {"name": "role", "type": "public.message_role", "description": "The chat role the template speaks as."},
    {"name": "subject", "type": "text", "description": "Subject line, for templates sent as email."}
  ],
  "checks": [
    {"name": "message_template_detail_id_is_document_id", "expression": "id = document_id", "description": "The Detail row's id equals its document's id."}
  ]
}$spec$::jsonb, 'runner');
