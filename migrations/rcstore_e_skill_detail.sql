-- RC-A1 (common-docs/projects/rich-content-unification/STORE-DESIGN.md §3, §5 step 2):
-- skill.skill_detail — the structured fields of a skill-type document, new token `skill_detail` (STORE-DESIGN §3.6; the old `skill` token retires at migration, not here).
-- A Detail (component) of `document`, built EMPTY by the one sanctioned builder with the base
-- contract deferred (attached by rcstore_h, validated and certified by rcstore_i).
-- Apply inside the 1–4 AM PT window, in order after rcstore_b.

set local lock_timeout = '2s';
-- platform.provision's preflight refuses a statement ceiling above 60s, and (from aidream 1024)
-- a transaction older than 5 s at entry: each table is therefore built in its OWN migration,
-- as the first real work of a young transaction.
set local statement_timeout = '60s';

select platform.provision($spec${
  "schema": "skill",
  "table": "skill_detail",
  "token": "skill_detail",
  "label": "Skill Detail",
  "type": "detail",
  "origin": "standard",
  "description": "The structured fields the platform enforces for a skill-type document (STORE-DESIGN §3.6). Its id equals the document id (which equals the legacy skill.definition id). Replaces the `skill` token, which retires at migration.",
  "parents": ["document:document_id"],
  "access": {},
  "component_anon_read_via_public_parent": false,
  "taxonomy_node_id": "c2d02abc-3b8a-4096-8bdb-00691c15f9a8",
  "category_label": "Skills",
  "versioned": false,
  "soft_delete": true,
  "sharing": false,
  "fields": [
    {"name": "document_id", "type": "uuid", "not_null": true, "unique": true,
     "references": {"target": "document", "on_delete": "cascade"},
     "relationship_kind": "composition", "relationship_note": "The skill's structured fields belong to its document.",
     "description": "The skill document."},
    {"name": "skill_type", "type": "public.skl_skill_type", "not_null": true, "default": "'reference'::public.skl_skill_type", "description": "Kind of skill."},
    {"name": "allowed_tools", "type": "jsonb", "check": "allowed_tools IS NULL OR allowed_tools ? '__kind'", "description": "Allowed tools, kind-marked (__kind)."},
    {"name": "trigger_patterns", "type": "jsonb", "check": "trigger_patterns IS NULL OR trigger_patterns ? '__kind'", "description": "Trigger patterns, kind-marked (__kind)."},
    {"name": "disable_auto_invocation", "type": "boolean", "not_null": true, "default": "false", "description": "When true the skill is never auto-invoked."},
    {"name": "platform_targets", "type": "jsonb", "description": "Client platforms the skill targets."},
    {"name": "semver", "type": "text", "description": "Published semantic version."},
    {"name": "model_preference", "type": "text", "description": "Preferred model."},
    {"name": "is_system", "type": "boolean", "not_null": true, "default": "false", "description": "Platform-provided skill."},
    {"name": "is_active", "type": "boolean", "not_null": true, "default": "true", "description": "Active skills are offered to agents."}
  ],
  "checks": [
    {"name": "skill_detail_id_is_document_id", "expression": "id = document_id", "description": "The Detail row's id equals its document's id."}
  ]
}$spec$::jsonb, 'runner');
