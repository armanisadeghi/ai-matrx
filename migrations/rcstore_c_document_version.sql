-- RC-A1 (common-docs/projects/rich-content-unification/STORE-DESIGN.md §3, §5 step 2):
-- content.document_version — the ONE certified custom version store of `document` (STORE-DESIGN §3.5): one immutable row per content_version, UNIQUE (document_id, content_version). Behaviour (capture, immutability) is attached by rcstore_g.
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
  "table": "document_version",
  "token": "document_version",
  "label": "Document Version",
  "type": "detail",
  "origin": "standard",
  "description": "The ONE certified custom version store for content.document: one immutable row per content_version (UNIQUE (document_id, content_version)). Written only by the database (content._capture_version); only label and note are editable. Lifecycle and governance versions carry body NULL and point body_content_version at the version holding the body.",
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
     "relationship_kind": "composition", "relationship_note": "A version IS its document's history; it exists only under it.",
     "description": "The document this version records."},
    {"name": "content_version", "type": "integer", "not_null": true, "description": "The document's content_version this row records."},
    {"name": "change_kind", "type": "text", "not_null": true, "check": "change_kind in ('content','lifecycle','governance')",
     "description": "content (title/summary/body/format/payload changed), lifecycle (archive/trash/seal/folder), governance (visibility/class/type)."},
    {"name": "title", "type": "text", "not_null": true, "description": "Title at capture."},
    {"name": "summary", "type": "text", "description": "Summary at capture."},
    {"name": "format", "type": "text", "not_null": true, "description": "Format at capture."},
    {"name": "body", "type": "text", "description": "Body at capture; NULL unless change_kind = content."},
    {"name": "body_content_version", "type": "integer", "not_null": true, "description": "The content version holding this state's body."},
    {"name": "content_hash", "type": "text", "not_null": true, "description": "The document's content_hash at capture."},
    {"name": "payload_hash", "type": "text", "description": "Univer payload hash at capture."},
    {"name": "document_type_id", "type": "uuid", "not_null": true, "description": "Type at capture."},
    {"name": "visibility_at_capture", "type": "platform.visibility", "not_null": true, "description": "Visibility at capture."},
    {"name": "data_class_at_capture", "type": "platform.data_class", "not_null": true, "description": "Data class at capture."},
    {"name": "folder_id_at_capture", "type": "uuid", "description": "Folder at capture."},
    {"name": "archived_at_capture", "type": "timestamptz", "description": "archived_at at capture."},
    {"name": "deleted_at_capture", "type": "timestamptz", "description": "deleted_at at capture."},
    {"name": "sealed_at_capture", "type": "timestamptz", "description": "sealed_at at capture."},
    {"name": "origin", "type": "text", "not_null": true,
     "check": "origin in ('manual','autosave','agent','import','sync','restore','system')", "description": "Origin of the write that produced this version."},
    {"name": "actor_id", "type": "uuid", "description": "The person whose write produced this version. FK -> auth.users added by rcstore_h."},
    {"name": "actor_tier", "type": "text", "description": "code | ai | human, as platform.actor_tier() answered at capture."},
    {"name": "device_id", "type": "text", "description": "Device of the write (local sync)."},
    {"name": "conversation_id", "type": "uuid", "description": "Conversation whose agent made the write. FK -> chat.conversation (ON DELETE SET NULL) added by rcstore_h."},
    {"name": "source_ref", "type": "text", "description": "Legacy provenance (e.g. the imported history row's (version, id))."},
    {"name": "label", "type": "text", "check": "length(label) <= 200", "description": "Editable name for this version (editor)."},
    {"name": "note", "type": "text", "check": "length(note) <= 4000", "description": "Editable note on this version (editor)."}
  ],
  "indexes": [
    {"columns": ["document_id", "content_version"], "unique": true,
     "where_omitted_reason": "Versions are never soft-deleted; the pair is unique over every row, and the certifier reads it as the store's UNIQUE(document_id, <version column>)."}
  ]
}$spec$::jsonb, 'runner');
