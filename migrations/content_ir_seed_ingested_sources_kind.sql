-- ============================================================================
-- content-ir kind `ingested_sources` — what the platform actually took in from
-- a person's materials.
--
-- Produced by `docproc.ingest.from_media_refs` (aidream
-- aidream/graph_actions/docproc/ingest.py, output model `IngestedContent`),
-- the FIRST step of every Study Pack run — so this shape is on screen from the
-- opening seconds. Until now it rendered through the generic JSON viewer: a
-- learner who pasted a chapter of their own textbook was shown `content_hash`,
-- `chunk_index` and `source_offset_end` instead of "we read your pasted
-- material".
--
-- NOT `bulk_result` (measured 2026-08-18, and again here): that archetype
-- requires `items[]` and forbids everything else, while this node's primary
-- payload is the CHUNKS, not per-item receipts. Forcing it would push the
-- chunks into `items[].value` and break `structure`'s inbound edge plus three
-- `pack` mappings. This is the dedicated seed the kinds-gap handoff called for.
--
-- PYTHON-OWNED. `emitted_json_schema` is `IngestedContent.model_json_schema()`
-- verbatim — never hand-written, and never regenerated from the TS mirror in
-- features/content-ir/kinds/ingested-sources.ts (that mirror exists so the
-- client parser can type an instance before any network fetch). `data`,
-- `emitted_block_schema`, `emitted_fingerprint` and `sample_data` stay NULL,
-- exactly like `podcast_episode` / `generated_audio`; the child shape
-- `ingested_chunk` lives inline in `$defs` and gets no row of its own.
--
-- Rows applied here:
--   * content_ir.kind_definition — `ingested_sources`, platform org, public,
--     is_active FALSE (activation is `content_ir.set_kind_activation`'s job,
--     never a bare UPDATE).
--   * content_ir.kind_example — canonical (two sources, one of three uploads
--     failed, so the shortfall path is exercised) + minimal (nothing read).
--     `validation_status` is deliberately NOT written: the
--     `_recompute_validation` trigger DERIVES it on every write. Both examples
--     were validated against this exact schema AND against the pydantic model
--     before this file was written.
--   * content_ir.kind_component — web/output → the bundled
--     IngestedSourcesBlock via the compiled bridge.
--   * NO kind_surface row — `__kind` JSON is the only arrival form.
--
-- Idempotent on business keys; re-apply is safe. is_active is deliberately NOT
-- touched on re-apply.
-- ============================================================================

BEGIN;

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, emitted_json_schema,
   is_active, organization_id, visibility, metadata)
VALUES (
  'ingested_sources',
  'Ingested Sources',
  'python',
  $J${"$defs": {"IngestedChunk": {"additionalProperties": false, "description": "One chunk of source material with full provenance.", "properties": {"chunk_id": {"description": "Stable UUID for this chunk.", "title": "Chunk Id", "type": "string"}, "content": {"minLength": 1, "title": "Content", "type": "string"}, "content_hash": {"description": "sha256 hex of content.", "title": "Content Hash", "type": "string"}, "chunk_index": {"minimum": 0, "title": "Chunk Index", "type": "integer"}, "kind": {"description": "Source kind — 'pdf', 'plain_text', 'user_note', 'web_page', etc.", "title": "Kind", "type": "string"}, "source_label": {"default": "", "title": "Source Label", "type": "string"}, "source_media_ref_id": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "title": "Source Media Ref Id"}, "source_offset_start": {"default": 0, "minimum": 0, "title": "Source Offset Start", "type": "integer"}, "source_offset_end": {"default": 0, "minimum": 0, "title": "Source Offset End", "type": "integer"}, "source_metadata": {"additionalProperties": {"$ref": "#/$defs/JsonValue"}, "title": "Source Metadata", "type": "object"}}, "required": ["chunk_id", "content", "content_hash", "chunk_index", "kind"], "title": "IngestedChunk", "type": "object"}, "JsonValue": {}}, "additionalProperties": false, "description": "Output of ``docproc.ingest.from_media_refs``.\n\n``sources_requested`` / ``sources_ingested`` / ``sources_failed`` make\npartial source loss IMPOSSIBLE to miss (audit P0-2d): a pack generated\nfrom 1 of 3 uploads must say so, not pose as complete. ``errors``\ncarries the per-source reasons.", "properties": {"chunks": {"items": {"$ref": "#/$defs/IngestedChunk"}, "title": "Chunks", "type": "array"}, "total_chars": {"default": 0, "title": "Total Chars", "type": "integer"}, "source_count": {"default": 0, "title": "Source Count", "type": "integer"}, "sources_requested": {"default": 0, "title": "Sources Requested", "type": "integer"}, "sources_ingested": {"default": 0, "title": "Sources Ingested", "type": "integer"}, "sources_failed": {"default": 0, "title": "Sources Failed", "type": "integer"}, "errors": {"items": {"type": "string"}, "title": "Errors", "type": "array"}}, "title": "IngestedContent", "type": "object"}$J$::jsonb,
  false,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  'public',
  $J${"family": "workflow_io", "generic": false, "category": "pure", "description": "The materials a person handed in, as the platform read them \u2014 each source, what it was, how much readable text came out of it, and which ones could not be read."}$J$::jsonb
)
ON CONFLICT (kind) WHERE deleted_at IS NULL DO UPDATE SET
  label = EXCLUDED.label,
  authoring_owner = EXCLUDED.authoring_owner,
  emitted_json_schema = EXCLUDED.emitted_json_schema,
  visibility = EXCLUDED.visibility,
  metadata = EXCLUDED.metadata,
  updated_at = now();
  -- is_active deliberately NOT updated: activation belongs to the dual gate.

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, organization_id)
SELECT d.id, d.version, v.data::jsonb, v.label, v.description,
       'authored', v.is_canonical, d.organization_id
FROM (VALUES
  (
    'Two sources read, one upload refused (canonical)', true,
    'Three sources handed in, two read: pasted text and a two-chunk PDF. The third failed, so sources_failed and errors carry the shortfall a renderer must never hide.',
    $J${"chunks": [{"chunk_id": "238e9003-b39b-4db9-bb1e-a170ab769608", "content": "Plate tectonics is the theory that Earth's outer shell, the lithosphere, is divided into rigid plates that move over the softer asthenosphere below. At divergent boundaries plates move apart and new crust forms; at convergent boundaries one plate subducts beneath another; at transform boundaries plates slide past one another.", "content_hash": "f23376eb2417e6d04d5f37d39ddcb9abffdecc7c51550ceaa0b2318e32c8b7b0", "chunk_index": 0, "kind": "plain_text", "source_label": "Pasted material", "source_media_ref_id": null, "source_offset_start": 0, "source_offset_end": 327, "source_metadata": {}}, {"chunk_id": "6c1f0a72-52a4-4a3e-9d18-3f8b21c4e7aa", "content": "Chapter 4 — Boundary types. The Mid-Atlantic Ridge is the classic divergent boundary, where seafloor spreading adds new oceanic crust at a few centimetres per year. The Andes are the classic ocean-continent convergent boundary, and the Himalayas the classic continent-continent collision.", "content_hash": "1d48074e9779021aaa420ca448ed465684998a23c147a62e4f8874bf9e515127", "chunk_index": 0, "kind": "pdf", "source_label": "Earth Science, chapter 4.pdf", "source_media_ref_id": "b0f7c9d2-4e51-4a88-9c33-71d0e2f5a6b4", "source_offset_start": 0, "source_offset_end": 288, "source_metadata": {"mime_type": "application/pdf", "page_count": 12}}, {"chunk_id": "9a4d5be1-7c30-4f62-8b19-2e6c0a3d5f77", "content": "Chapter 4, continued. The San Andreas Fault is the textbook transform boundary: no crust is created or destroyed, but stress builds until the rock slips, which is why the boundary is defined by its earthquakes rather than its volcanoes.", "content_hash": "b78a1916136adb9a192f7f0c15377f4eb345184d9b90aa02398a306a41c05d0e", "chunk_index": 1, "kind": "pdf", "source_label": "Earth Science, chapter 4.pdf", "source_media_ref_id": "b0f7c9d2-4e51-4a88-9c33-71d0e2f5a6b4", "source_offset_start": 288, "source_offset_end": 524, "source_metadata": {"mime_type": "application/pdf", "page_count": 12}}], "total_chars": 851, "source_count": 2, "sources_requested": 3, "sources_ingested": 2, "sources_failed": 1, "errors": ["lecture-notes.docx: unsupported file type"]}$J$
  ),
  (
    'Nothing readable came back (minimal)', false,
    'Minimal legal form: every count zero and no chunks — what an empty intake looks like.',
    $J${"chunks": [], "total_chars": 0, "source_count": 0, "sources_requested": 0, "sources_ingested": 0, "sources_failed": 0, "errors": []}$J$
  )
) AS v(label, is_canonical, description, data)
JOIN content_ir.kind_definition d
  ON d.kind = 'ingested_sources'
 AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND d.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_example x
  WHERE x.kind_definition_id = d.id AND x.label = v.label AND x.deleted_at IS NULL
);

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', d.kind, 'bundled',
       jsonb_build_object('legacyBlockType', d.kind), true, true, 100,
       d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'ingested_sources'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = d.kind
      AND c.deleted_at IS NULL
  );

COMMIT;
