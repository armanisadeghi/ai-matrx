-- RC-A1 (common-docs/projects/rich-content-unification/STORE-DESIGN.md §3.2, §3.4, §5 steps 0–1):
-- content.document — the ONE canonical store for authored rich content — built EMPTY by the one
-- sanctioned builder, as the first real work of this transaction. Nothing is migrated here. Its
-- spec also seeds the per-type knobs the database itself reads (class floor, capture,
-- auto-ingest) and the inline data-URI cap. The document_type categories and the two helpers
-- the build names were created by rcstore_a.
--
-- THE RC-A1 SEQUENCE (each file its own transaction, all inside the 1–4 AM PT window):
--   rcstore_a  schema `content` (exposure, generate target, PostgREST), document_type
--              categories, the FTS vector function and the migration-bypass test
--   rcstore_b  content.document                         (this file)
--   rcstore_c  content.document_version                 (the certified custom version store)
--   rcstore_d  content.univer_payload
--   rcstore_e  skill.skill_detail
--   rcstore_f  agent.message_template_detail
--   rcstore_g  behaviour: derived fields, content_version, capture, guards, doors, registry flip
--   rcstore_h  base contract + FKs into live shared tables, NOT VALID, one short transaction
--   rcstore_i  validate every FK, then the done gate: iam.canonical_certify_ok for all five
--   rcstore_j  realtime publication + the private `document:` topic
--
-- WHY ONE TABLE PER FILE: platform.provision refuses to start inside a transaction older than
-- 5 s (aidream 1024, "a provision holds its locks for seconds"), and the batch path
-- (platform.provision_batch) on production today re-certifies every member and refuses the
-- deferred base-contract FKs as FAIL. A single call as the first real work of a young
-- transaction is the builder's own sanctioned shape on either body.
--
-- FOREIGN KEYS INTO LIVE SHARED TABLES (platform.categories, files.folders, chat.conversation,
-- auth.users) are NOT declared in the specs: an inline FK holds SHARE ROW EXCLUSIVE on its
-- target for the whole build. rcstore_h adds them NOT VALID in a short transaction (with their
-- covering indexes and tenancy triggers) and rcstore_i validates them. The FK register (§3.17)
-- is unchanged.
--
-- Rehearsed with `pnpm db:rehearse … --target clone`.

set local lock_timeout = '2s';
-- platform.provision's preflight refuses a statement ceiling above 60s (it is the only bound on
-- how long a build can hold what it holds).
set local statement_timeout = '60s';

-- ============================================================================================
-- 2. content.document (§3.2) — ONE sanctioned build, base contract deferred.
-- ============================================================================================
select platform.provision($spec${
  "schema": "content",
  "table": "document",
  "token": "document",
  "label": "Document",
  "type": "entity",
  "origin": "standard",
  "description": "The ONE canonical store for authored rich content (STORE-DESIGN.md): every document a feature opts in is a row — note, study guide, annotation, working doc, transcript doc, article, podcast script, skill, template, research synthesis, rendered document, repo doc, Univer document. The body is plain markdown text and it is the truth (Univer rows: the payload is the truth and body is its server-regenerated projection). Derived fields are computed by the database; content_version counts meaningful changes and keys content.document_version.",
  "access": {
    "data_class": "organization",
    "data_class_reason": "The token's class is the lane set the RLS generator emits; each ROW carries its own data_class with a per-type floor (content.document knobs data_class.<type>). Wave-2 types whose floor is confidential/private migrate only after the row-level class lanes (P1 / DD-165) certify.",
    "default_list_scope": "mine",
    "key_column": "created_by",
    "visibility": "internal"
  },
  "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321",
  "category_label": "Documents",
  "content_role": "hybrid",
  "is_listed": true,
  "title_column": "title",
  "versioned": false,
  "soft_delete": true,
  "category": false,
  "gin_jsonb": false,
  "realtime": false,
  "fields": [
    {"name": "document_type_id", "type": "uuid", "not_null": true,
     "description": "The document's type: a live platform.categories row in dimension document_type owned by the system organization (guarded). FK -> platform.categories is added by rcstore_h (NOT VALID, validated by rcstore_d) so the build never holds a lock on categories."},
    {"name": "data_class", "type": "platform.data_class", "not_null": true,
     "description": "Per-row sensitivity. Defaults to the type's floor (knob content.document / data_class.<type>); the owner may raise or lower it but never below the floor. private requires visibility personal; public visibility requires class organization or public."},
    {"name": "title", "type": "text", "not_null": true, "default": "''", "check": "length(title) <= 500",
     "description": "Title shown in every list; at most 500 characters."},
    {"name": "slug", "type": "text", "check": "slug ~ '^[a-z0-9][a-z0-9._/-]*$'",
     "description": "Identity key for types whose identity_key is slug; unique per (organization, type) among live rows."},
    {"name": "summary", "type": "text", "check": "length(summary) <= 4000",
     "description": "Optional human or agent summary; weight B in search."},
    {"name": "icon", "type": "text", "description": "Optional icon name."},
    {"name": "format", "type": "text", "not_null": true, "default": "'markdown'",
     "check": "format in ('markdown','html','plain','univer')",
     "description": "markdown (the default and the truth), html, plain, or univer (the payload in content.univer_payload is the truth)."},
    {"name": "body", "type": "text", "not_null": true, "default": "''",
     "description": "The document text. For format=univer it is the server-regenerated markdown projection and changes only through content.univer_save."},
    {"name": "payload_hash", "type": "text",
     "description": "Univer only: sha256 of the payload; a tracked field, so every payload change is a new content version. Computed by content.univer_save; refused from clients."},
    {"name": "content_version", "type": "integer", "not_null": true, "default": "0",
     "description": "Meaningful-change counter: moves only when a tracked field changes; keys content.document_version. Computed by the database; refused from clients."},
    {"name": "content_hash", "type": "text", "not_null": true,
     "description": "sha256 of body (UTF-8, hex). Computed by the database; refused from clients."},
    {"name": "preview", "type": "text", "not_null": true, "default": "''",
     "description": "First 280 characters of body, whitespace-collapsed. Computed by the database; refused from clients."},
    {"name": "word_count", "type": "integer", "not_null": true, "default": "0",
     "description": "Words in body. Computed by the database; refused from clients."},
    {"name": "char_count", "type": "integer", "not_null": true, "default": "0",
     "description": "Characters in body; clients lazy-load bodies above content.large_body_chars. Computed by the database; refused from clients."},
    {"name": "folder_id", "type": "uuid",
     "description": "Folder in files.folders (organizes, does not share, v1). The writer must hold editor on the folder. FK added by rcstore_h with its same-org tenancy trigger."},
    {"name": "archived_at", "type": "timestamptz", "description": "Archived: reachable and restorable in one click (archived-items law)."},
    {"name": "sealed_at", "type": "timestamptz", "description": "Once set, title, body, format, payload and type are frozen (duplicate to edit)."},
    {"name": "published_content_version", "type": "integer",
     "description": "The published content version (pinned to content.document_version by a composite FK). Changes only through content.version_publish / version_unpublish."},
    {"name": "published_at", "type": "timestamptz", "description": "When the current published version was published."},
    {"name": "file_path", "type": "text", "description": "Local-sync path (types with local_sync on); unique per owner among live rows."},
    {"name": "source_uri", "type": "text", "description": "Identity for types whose identity_key is source_uri (repo docs); unique per organization among live rows."},
    {"name": "source_hash", "type": "text", "description": "Hash of the upstream source the body was synced from."},
    {"name": "last_origin", "type": "text", "not_null": true, "default": "'manual'",
     "check": "last_origin in ('manual','autosave','agent','import','sync','restore','system')",
     "description": "Origin of the latest write; copied onto the version row it produces."},
    {"name": "last_device_id", "type": "text", "description": "Device that made the latest write (local sync)."},
    {"name": "last_conversation_id", "type": "uuid",
     "description": "Conversation whose agent made the latest write. FK -> chat.conversation (ON DELETE SET NULL) added by rcstore_h."}
  ],
  "checks": [
    {"name": "document_payload_hash_univer_only", "expression": "format = 'univer' OR payload_hash IS NULL",
     "description": "Only a Univer document carries a payload hash."},
    {"name": "document_private_is_personal", "expression": "data_class <> 'private' OR visibility = 'personal'",
     "description": "A private-class row can only be personal: the badge never claims more sharing than the lanes allow."},
    {"name": "document_public_needs_open_class", "expression": "visibility <> 'public' OR data_class IN ('organization','public')",
     "description": "Only an organization- or public-class row can be public."},
    {"name": "document_published_pair", "expression": "(published_content_version IS NULL) = (published_at IS NULL)",
     "description": "A published version always carries its publish time."}
  ],
  "indexes": [
    {"columns": ["organization_id", "document_type_id", "slug"], "unique": true, "where": "deleted_at IS NULL AND slug IS NOT NULL"},
    {"columns": ["organization_id", "source_uri"], "unique": true, "where": "deleted_at IS NULL AND source_uri IS NOT NULL"},
    {"columns": ["created_by", "file_path"], "unique": true, "where": "deleted_at IS NULL AND file_path IS NOT NULL"},
    {"expression": "created_by, updated_at DESC", "where": "deleted_at IS NULL"},
    {"expression": "organization_id, document_type_id, updated_at DESC", "where": "deleted_at IS NULL AND archived_at IS NULL"},
    {"expression": "folder_id, updated_at DESC", "where": "deleted_at IS NULL"},
    {"columns": ["document_type_id"]},
    {"columns": ["created_by", "content_hash"]},
    {"method": "gin", "expression": "content.document_search_vector(title, summary, body)"},
    {"method": "gin", "expression": "title public.gin_trgm_ops"}
  ],
  "sharing": {
    "display_label": "Document",
    "url_path_template": "/documents/{id}",
    "url_path_reason": "The one Documents surface (register RC-B1) owns /documents/{id}; until it dispatches content.document ids the share page opens through the owning feature's surface.",
    "is_link_shareable": true,
    "is_scopeable": true,
    "public_columns": ["id", "title", "summary", "preview", "created_at", "updated_at"]
  },
  "knobs": [
    {"feature": "content.document", "key": "max_inline_data_uri_bytes", "value": 65536, "value_type": "integer", "min_value": 0, "unit": "bytes",
     "label": "Largest inline data: URI", "description": "A base64 data: URI in a document body larger than this is refused with a remedy (upload it as a file and attach it). STORE-DESIGN §3.2 / §3.13.",
     "set_by": "agent", "overridable_by": ["organization"], "override_direction": "lower_only", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},

    {"feature": "content.document", "key": "data_class.note", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: note", "description": "The lowest data class a note may carry. Organizations may only make it stricter; the database enforces the stricter of this value and the organization's.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.study_guide", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: study guide", "description": "The lowest data class a study guide may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.annotation", "value": "private", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: annotation", "description": "The lowest data class an annotation may carry (private: personal highlights). Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.working_document", "value": "confidential", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: working document", "description": "The lowest data class a working document may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.scratch", "value": "confidential", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: scratch", "description": "The lowest data class a scratch document may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.transcript_document", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: transcript document", "description": "The lowest data class a transcript document may carry (the studio session token resolves to organization). Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.interview_document", "value": "confidential", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: interview document", "description": "The lowest data class an interview document may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.blog", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: blog post", "description": "The lowest data class a blog post may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.show_notes", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: show notes", "description": "The lowest data class show notes may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.learn_article", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: learn article", "description": "The lowest data class a learn article may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.web_page", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: web page", "description": "The lowest data class a web page may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.podcast_script", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: podcast script", "description": "The lowest data class a podcast script may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.message_template", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: message template", "description": "The lowest data class a message template may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.content_block", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: content block", "description": "The lowest data class a content block may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.document_template", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: document template", "description": "The lowest data class a document template may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.skill", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: skill", "description": "The lowest data class a skill may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.research_synthesis", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: research synthesis", "description": "The lowest data class a research synthesis may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.rendered_document", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: rendered document", "description": "The lowest data class a rendered document may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.repo_doc", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: repository doc", "description": "The lowest data class a repository doc may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.univer", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: Univer document", "description": "The lowest data class a Univer document may carry (migrated rows arrive private + personal to keep today's owner-only access). Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "data_class.sample", "value": "organization", "value_type": "enum", "allowed_values": ["private","confidential","organization","public"], "label": "Class floor: sample", "description": "The lowest data class a sample may carry. Organizations may only make it stricter.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},

    {"feature": "content.document", "key": "capture.note", "value": true, "value_type": "boolean", "label": "Keep content versions: note", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.study_guide", "value": true, "value_type": "boolean", "label": "Keep content versions: study guide", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.annotation", "value": false, "value_type": "boolean", "label": "Keep content versions: annotation", "description": "Off: annotations never flood history; only lifecycle and governance versions are recorded.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.working_document", "value": true, "value_type": "boolean", "label": "Keep content versions: working document", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.scratch", "value": true, "value_type": "boolean", "label": "Keep content versions: scratch", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.transcript_document", "value": true, "value_type": "boolean", "label": "Keep content versions: transcript document", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.interview_document", "value": true, "value_type": "boolean", "label": "Keep content versions: interview document", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.blog", "value": true, "value_type": "boolean", "label": "Keep content versions: blog post", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.show_notes", "value": true, "value_type": "boolean", "label": "Keep content versions: show notes", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.learn_article", "value": true, "value_type": "boolean", "label": "Keep content versions: learn article", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.web_page", "value": true, "value_type": "boolean", "label": "Keep content versions: web page", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.podcast_script", "value": true, "value_type": "boolean", "label": "Keep content versions: podcast script", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.message_template", "value": true, "value_type": "boolean", "label": "Keep content versions: message template", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.content_block", "value": true, "value_type": "boolean", "label": "Keep content versions: content block", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.document_template", "value": true, "value_type": "boolean", "label": "Keep content versions: document template", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.skill", "value": true, "value_type": "boolean", "label": "Keep content versions: skill", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.research_synthesis", "value": true, "value_type": "boolean", "label": "Keep content versions: research synthesis", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.rendered_document", "value": true, "value_type": "boolean", "label": "Keep content versions: rendered document", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.repo_doc", "value": true, "value_type": "boolean", "label": "Keep content versions: repository doc", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.univer", "value": true, "value_type": "boolean", "label": "Keep content versions: Univer document", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "capture.sample", "value": true, "value_type": "boolean", "label": "Keep content versions: sample", "description": "Off records only lifecycle and governance versions, never content versions.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},

    {"feature": "content.document", "key": "auto_ingest.note", "value": true, "value_type": "boolean", "label": "Search-index for AI: note", "description": "On sends a changed live note to RAG ingest (pg_notify auto_ingest, source_kind document) when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.study_guide", "value": true, "value_type": "boolean", "label": "Search-index for AI: study guide", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.annotation", "value": false, "value_type": "boolean", "label": "Search-index for AI: annotation", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.working_document", "value": false, "value_type": "boolean", "label": "Search-index for AI: working document", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.scratch", "value": false, "value_type": "boolean", "label": "Search-index for AI: scratch", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.transcript_document", "value": false, "value_type": "boolean", "label": "Search-index for AI: transcript document", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.interview_document", "value": true, "value_type": "boolean", "label": "Search-index for AI: interview document", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.blog", "value": true, "value_type": "boolean", "label": "Search-index for AI: blog post", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.show_notes", "value": true, "value_type": "boolean", "label": "Search-index for AI: show notes", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.learn_article", "value": true, "value_type": "boolean", "label": "Search-index for AI: learn article", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.web_page", "value": true, "value_type": "boolean", "label": "Search-index for AI: web page", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.podcast_script", "value": true, "value_type": "boolean", "label": "Search-index for AI: podcast script", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.message_template", "value": false, "value_type": "boolean", "label": "Search-index for AI: message template", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.content_block", "value": false, "value_type": "boolean", "label": "Search-index for AI: content block", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.document_template", "value": false, "value_type": "boolean", "label": "Search-index for AI: document template", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.skill", "value": false, "value_type": "boolean", "label": "Search-index for AI: skill", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.research_synthesis", "value": true, "value_type": "boolean", "label": "Search-index for AI: research synthesis", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.rendered_document", "value": false, "value_type": "boolean", "label": "Search-index for AI: rendered document", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.repo_doc", "value": false, "value_type": "boolean", "label": "Search-index for AI: repository doc", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.univer", "value": true, "value_type": "boolean", "label": "Search-index for AI: Univer document", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"},
    {"feature": "content.document", "key": "auto_ingest.sample", "value": false, "value_type": "boolean", "label": "Search-index for AI: sample", "description": "On sends a changed live document of this type to RAG ingest when its title, body or payload changes.", "set_by": "agent", "overridable_by": ["organization"], "override_direction": "any", "taxonomy_node_id": "6a7d9cc6-a1cc-4e4d-b238-70bad1725321"}
  ]
}$spec$::jsonb, 'runner');

