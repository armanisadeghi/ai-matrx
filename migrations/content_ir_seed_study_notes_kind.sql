-- ============================================================================
-- content-ir kinds `study_notes` (+ nested children `study_notes_section`,
-- `glossary_term`) — a set of study notes as a real document.
--
-- Produced by the Study Pack notes agent, read out of its reply by
-- `ai.util.parse_llm_json`, and declared by the workflow's `study_notes` step
-- (aidream aidream/workflows/study_pack_v1.py). Until now the "Study notes"
-- panel rendered the generic JSON viewer — one unbroken line of braces and
-- escaped quotes on the screen where a learner is supposed to READ.
--
-- NOT `structured_info`, and forcing it there would fire the output-drift log
-- on every run (measured 2026-08-18, re-checked here): that kind is
-- `additionalProperties:false` over exactly `title` + `sections`, and its
-- section allows only `{heading, body, items}` — so `overview`, a section
-- `summary`, `key_points`, `examples` and the whole `glossary` have nowhere to
-- go. The shape seeded here is the MEASURED one: identical across 8 of 8
-- consecutive live runs of definition 3bd1960c.
--
-- TS-OWNED. `data`, `emitted_block_schema`, `emitted_json_schema` and
-- `emitted_fingerprint` are CONVERTER-EMITTED (kindSchemaToStorage /
-- kindSchemaToJsonSchema / fingerprintText over
-- features/content-ir/kinds/study-notes.ts; emit script output 2026-08-18) —
-- never hand-written.
--
-- Rows applied here (mirrors kind_memory_aid_full.sql):
--   * content_ir.kind_definition — all three kinds, platform org, public,
--     is_active FALSE (activation is `content_ir.set_kind_activation`'s job,
--     never a bare UPDATE; children stay inactive — nested_only_child).
--   * content_ir.kind_edge — study_notes.sections → study_notes_section,
--     study_notes.glossary → glossary_term.
--   * content_ir.kind_example — canonical + minimal roots, canonical children.
--     `validation_status` is deliberately NOT written: the
--     `_recompute_validation` trigger DERIVES it on every write. Every example
--     was validated against its emitted block schema before this file was
--     written, and the canonical document was additionally validated against
--     the WIRE schema in the exact form the workflow node emits it (no
--     `__kind`), which is what the scheduler checks `output_kind` against.
--   * content_ir.kind_component — web/output → the bundled StudyNotesBlock via
--     the compiled bridge.
--   * NO kind_surface rows — `__kind` JSON is the only arrival form.
--
-- Idempotent on business keys; re-apply is safe. is_active is deliberately NOT
-- touched on re-apply.
-- ============================================================================

BEGIN;

-- ── 1. kind_definition: children first (the root's edges resolve to them) ───

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, sample_data,
   emitted_block_schema, emitted_json_schema, emitted_fingerprint,
   is_active, organization_id, visibility)
VALUES
  (
    'study_notes_section',
    'Study Notes Section',
    'ts',
    $J$[{"name":"heading","required":true,"description":"What this part of the material is about — a short, plain title.","type":"string"},{"name":"summary","description":"The section in prose: two or three sentences that would stand on their own if the reader read nothing else.","type":"string"},{"name":"key_points","description":"The facts worth remembering, one per item — each a complete statement, not a fragment.","type":"string[]"},{"name":"examples","description":"Concrete cases, comparisons or analogies that make the section land.","type":"string[]"}]$J$::jsonb,
    $J${"__kind": "study_notes_section", "heading": "The three boundaries", "summary": "Almost everything the theory explains happens where two plates meet, and which of the three meetings it is decides what gets built.", "key_points": ["Divergent: plates move apart and new crust forms — constructive.", "Convergent: plates collide; denser oceanic crust subducts — destructive.", "Transform: plates slide past one another; no crust made or destroyed."], "examples": ["Mid-Atlantic Ridge — divergent, and still widening.", "The Andes — oceanic crust diving under a continent.", "The San Andreas Fault — transform, and defined by its earthquakes."]}$J$::jsonb,
    $J${"type":"object","properties":{"heading":{"type":"string","description":"What this part of the material is about — a short, plain title."},"summary":{"type":"string","description":"The section in prose: two or three sentences that would stand on their own if the reader read nothing else."},"key_points":{"type":"array","items":{"type":"string"},"description":"The facts worth remembering, one per item — each a complete statement, not a fragment."},"examples":{"type":"array","items":{"type":"string"},"description":"Concrete cases, comparisons or analogies that make the section land."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"study_notes_section"}},"required":["__kind","heading"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"heading":{"type":"string","description":"What this part of the material is about — a short, plain title."},"summary":{"type":"string","description":"The section in prose: two or three sentences that would stand on their own if the reader read nothing else."},"key_points":{"type":"array","items":{"type":"string"},"description":"The facts worth remembering, one per item — each a complete statement, not a fragment."},"examples":{"type":"array","items":{"type":"string"},"description":"Concrete cases, comparisons or analogies that make the section land."}},"required":["heading"],"additionalProperties":false}$J$::jsonb,
    'l9-1kpftmyzlr42k',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'glossary_term',
    'Glossary Term',
    'ts',
    $J$[{"name":"term","required":true,"description":"The word or phrase being defined, exactly as it appears in the material.","type":"string"},{"name":"definition","required":true,"description":"What it means, in one or two sentences a newcomer to the topic can follow without another lookup.","type":"string"}]$J$::jsonb,
    $J${"__kind": "glossary_term", "term": "Lithosphere", "definition": "Earth's rigid outer shell — the crust plus the uppermost mantle — broken into the tectonic plates."}$J$::jsonb,
    $J${"type":"object","properties":{"term":{"type":"string","description":"The word or phrase being defined, exactly as it appears in the material."},"definition":{"type":"string","description":"What it means, in one or two sentences a newcomer to the topic can follow without another lookup."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"glossary_term"}},"required":["__kind","term","definition"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"term":{"type":"string","description":"The word or phrase being defined, exactly as it appears in the material."},"definition":{"type":"string","description":"What it means, in one or two sentences a newcomer to the topic can follow without another lookup."}},"required":["term","definition"],"additionalProperties":false}$J$::jsonb,
    'd2-1qxa3wu1vk7gls',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'study_notes',
    'Study Notes',
    'ts',
    $J$[{"name":"title","required":true,"description":"What these notes cover.","type":"string"},{"name":"overview","description":"The whole topic in one paragraph — what a reader gets before any section.","type":"string"},{"name":"sections","required":true,"description":"The notes themselves, in teaching order.","type":"array"},{"name":"glossary","description":"The terms the material assumes, defined.","type":"array"}]$J$::jsonb,
    $J${"__kind": "study_notes", "title": "Plate Tectonics: Earth's Moving Crust", "overview": "Earth's rigid outer shell is broken into large plates that drift a few centimetres a year over the softer layer beneath. Where they meet, they pull apart, collide, or slide past one another — and each kind of meeting builds a different feature, from mid-ocean ridges to the Himalayas to the earthquakes of California.", "sections": [{"__kind": "study_notes_section", "heading": "What plate tectonics says", "summary": "The lithosphere is not one shell but a set of rigid plates resting on the softer asthenosphere. They move slowly enough to be invisible in a lifetime and fast enough to rebuild the map over millions of years.", "key_points": ["The lithosphere is Earth's rigid outer shell, divided into tectonic plates.", "Plates rest on the asthenosphere, a softer, partly molten layer of the mantle.", "Plates move a few centimetres a year — about the rate fingernails grow."], "examples": ["Cracked eggshell floating on the thick white beneath it."]}, {"__kind": "study_notes_section", "heading": "The three boundaries", "summary": "Almost everything the theory explains happens where two plates meet, and which of the three meetings it is decides what gets built.", "key_points": ["Divergent: plates move apart and new crust forms — constructive.", "Convergent: plates collide; denser oceanic crust subducts — destructive.", "Transform: plates slide past one another; no crust made or destroyed."], "examples": ["Mid-Atlantic Ridge — divergent, and still widening.", "The Andes — oceanic crust diving under a continent.", "The San Andreas Fault — transform, and defined by its earthquakes."]}], "glossary": [{"__kind": "glossary_term", "term": "Lithosphere", "definition": "Earth's rigid outer shell — the crust plus the uppermost mantle — broken into the tectonic plates."}, {"__kind": "glossary_term", "term": "Subduction", "definition": "The sinking of denser oceanic crust beneath another plate at a convergent boundary, back into the mantle."}, {"__kind": "glossary_term", "term": "Slab pull", "definition": "The pull of a cold, dense subducting plate as it sinks, now thought to be the strongest force moving the plates."}]}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"What these notes cover."},"overview":{"type":"string","description":"The whole topic in one paragraph — what a reader gets before any section."},"sections":{"type":"array","items":{"$ref":"#/$defs/study_notes_section"},"description":"The notes themselves, in teaching order."},"glossary":{"type":"array","items":{"$ref":"#/$defs/glossary_term"},"description":"The terms the material assumes, defined."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"study_notes"}},"required":["__kind","title","sections"],"additionalProperties":false,"$defs":{"study_notes_section":{"type":"object","properties":{"heading":{"type":"string","description":"What this part of the material is about — a short, plain title."},"summary":{"type":"string","description":"The section in prose: two or three sentences that would stand on their own if the reader read nothing else."},"key_points":{"type":"array","items":{"type":"string"},"description":"The facts worth remembering, one per item — each a complete statement, not a fragment."},"examples":{"type":"array","items":{"type":"string"},"description":"Concrete cases, comparisons or analogies that make the section land."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"study_notes_section"}},"required":["__kind","heading"],"additionalProperties":false},"glossary_term":{"type":"object","properties":{"term":{"type":"string","description":"The word or phrase being defined, exactly as it appears in the material."},"definition":{"type":"string","description":"What it means, in one or two sentences a newcomer to the topic can follow without another lookup."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"glossary_term"}},"required":["__kind","term","definition"],"additionalProperties":false}}}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"What these notes cover."},"overview":{"type":"string","description":"The whole topic in one paragraph — what a reader gets before any section."},"sections":{"type":"array","items":{"$ref":"#/$defs/study_notes_section"},"description":"The notes themselves, in teaching order."},"glossary":{"type":"array","items":{"$ref":"#/$defs/glossary_term"},"description":"The terms the material assumes, defined."}},"required":["title","sections"],"additionalProperties":false,"$defs":{"study_notes_section":{"type":"object","properties":{"heading":{"type":"string","description":"What this part of the material is about — a short, plain title."},"summary":{"type":"string","description":"The section in prose: two or three sentences that would stand on their own if the reader read nothing else."},"key_points":{"type":"array","items":{"type":"string"},"description":"The facts worth remembering, one per item — each a complete statement, not a fragment."},"examples":{"type":"array","items":{"type":"string"},"description":"Concrete cases, comparisons or analogies that make the section land."}},"required":["heading"],"additionalProperties":false},"glossary_term":{"type":"object","properties":{"term":{"type":"string","description":"The word or phrase being defined, exactly as it appears in the material."},"definition":{"type":"string","description":"What it means, in one or two sentences a newcomer to the topic can follow without another lookup."}},"required":["term","definition"],"additionalProperties":false}}}$J$::jsonb,
    '1hs-pr5ylnajn1h',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  )
ON CONFLICT (kind) WHERE deleted_at IS NULL DO UPDATE SET
  label = EXCLUDED.label,
  authoring_owner = EXCLUDED.authoring_owner,
  data = EXCLUDED.data,
  sample_data = EXCLUDED.sample_data,
  emitted_block_schema = EXCLUDED.emitted_block_schema,
  emitted_json_schema = EXCLUDED.emitted_json_schema,
  emitted_fingerprint = EXCLUDED.emitted_fingerprint,
  visibility = EXCLUDED.visibility,
  updated_at = now();
  -- is_active deliberately NOT updated: activation belongs to the dual gate.

-- ── 2. kind_edge: the parent→child field wiring ─────────────────────────────

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, v.field_name, c.id, v.position, p.organization_id
FROM (VALUES
  ('study_notes', 'sections', 'study_notes_section', 0),
  ('study_notes', 'glossary', 'glossary_term',       0)
) AS v(parent_kind, field_name, child_kind, position)
JOIN content_ir.kind_definition p
  ON p.kind = v.parent_kind
 AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND p.deleted_at IS NULL
JOIN content_ir.kind_definition c
  ON c.kind = v.child_kind
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

-- ── 3. kind_example — validation_status is TRIGGER-DERIVED, never written ───

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, organization_id)
SELECT d.id, d.version, v.data::jsonb, v.label, v.description,
       'authored', v.is_canonical, d.organization_id
FROM (VALUES
  (
    'study_notes', 'Plate tectonics notes (canonical)', true,
    'A full document: overview, two sections carrying summary + key points + examples, and a three-term glossary.',
    $J${"__kind": "study_notes", "title": "Plate Tectonics: Earth's Moving Crust", "overview": "Earth's rigid outer shell is broken into large plates that drift a few centimetres a year over the softer layer beneath. Where they meet, they pull apart, collide, or slide past one another — and each kind of meeting builds a different feature, from mid-ocean ridges to the Himalayas to the earthquakes of California.", "sections": [{"__kind": "study_notes_section", "heading": "What plate tectonics says", "summary": "The lithosphere is not one shell but a set of rigid plates resting on the softer asthenosphere. They move slowly enough to be invisible in a lifetime and fast enough to rebuild the map over millions of years.", "key_points": ["The lithosphere is Earth's rigid outer shell, divided into tectonic plates.", "Plates rest on the asthenosphere, a softer, partly molten layer of the mantle.", "Plates move a few centimetres a year — about the rate fingernails grow."], "examples": ["Cracked eggshell floating on the thick white beneath it."]}, {"__kind": "study_notes_section", "heading": "The three boundaries", "summary": "Almost everything the theory explains happens where two plates meet, and which of the three meetings it is decides what gets built.", "key_points": ["Divergent: plates move apart and new crust forms — constructive.", "Convergent: plates collide; denser oceanic crust subducts — destructive.", "Transform: plates slide past one another; no crust made or destroyed."], "examples": ["Mid-Atlantic Ridge — divergent, and still widening.", "The Andes — oceanic crust diving under a continent.", "The San Andreas Fault — transform, and defined by its earthquakes."]}], "glossary": [{"__kind": "glossary_term", "term": "Lithosphere", "definition": "Earth's rigid outer shell — the crust plus the uppermost mantle — broken into the tectonic plates."}, {"__kind": "glossary_term", "term": "Subduction", "definition": "The sinking of denser oceanic crust beneath another plate at a convergent boundary, back into the mantle."}, {"__kind": "glossary_term", "term": "Slab pull", "definition": "The pull of a cold, dense subducting plate as it sinks, now thought to be the strongest force moving the plates."}]}$J$
  ),
  (
    'study_notes', 'Title and one bare section (minimal)', false,
    'Minimal legal form — only title and one section heading are required, which is also what a mid-stream document looks like.',
    $J${"__kind": "study_notes", "title": "Photosynthesis", "sections": [{"__kind": "study_notes_section", "heading": "The one-sentence version"}]}$J$
  ),
  (
    'study_notes_section', 'Boundary types section (canonical)', true,
    'One section with all four parts: heading, prose summary, key points, worked examples.',
    $J${"__kind": "study_notes_section", "heading": "The three boundaries", "summary": "Almost everything the theory explains happens where two plates meet, and which of the three meetings it is decides what gets built.", "key_points": ["Divergent: plates move apart and new crust forms — constructive.", "Convergent: plates collide; denser oceanic crust subducts — destructive.", "Transform: plates slide past one another; no crust made or destroyed."], "examples": ["Mid-Atlantic Ridge — divergent, and still widening.", "The Andes — oceanic crust diving under a continent.", "The San Andreas Fault — transform, and defined by its earthquakes."]}$J$
  ),
  (
    'glossary_term', 'Lithosphere (canonical)', true,
    'One term defined so a newcomer needs no second lookup.',
    $J${"__kind": "glossary_term", "term": "Lithosphere", "definition": "Earth's rigid outer shell — the crust plus the uppermost mantle — broken into the tectonic plates."}$J$
  )
) AS v(kind, label, is_canonical, description, data)
JOIN content_ir.kind_definition d
  ON d.kind = v.kind
 AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND d.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_example x
  WHERE x.kind_definition_id = d.id AND x.label = v.label AND x.deleted_at IS NULL
);

-- ── 4. kind_component: web output → the bundled renderer ────────────────────

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', d.kind, 'bundled',
       jsonb_build_object('legacyBlockType', d.kind), true, true, 100,
       d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'study_notes'
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
