-- ============================================================================
-- content-ir kind `serial_observation_timeline` — FULL package (root kind).
-- Unfolding-case contract §1
-- (common-docs/systems/masterwork/unfolding-case-contract.md).
--
-- Expertise that lives in the ORDER: what was known at which moment, what was
-- still unknown, and what the practitioner chose to find out next and why.
-- Nothing in it is medical — `domain` names the field; an outage timeline and
-- a negotiation log have the same structure. The timeline lane
-- (`POST /masterworks/ingest-timeline`) unfolds a pasted narrative into this
-- shape and stores it on `platform.masterwork_corpus_item.metadata.timeline`.
--
-- `steps[]` is `json[]`, not a second registered kind: a step never arrives on
-- its own and is never rendered on its own, and a new kind slug is a
-- migration — the precedent `masterwork_checkup_rule.connects_to` set. The
-- item shape is documented in the field description and read by
-- features/content-ir/kinds/serial-observation-timeline.ts.
--
-- Rows applied here:
--   * content_ir.kind_definition — data / emitted_block_schema /
--     emitted_json_schema / emitted_fingerprint are CONVERTER-EMITTED
--     (scripts/shape/emit-kind-rows.ts over the TS bridge) — never
--     hand-written. authoring_owner 'ts', platform org, visibility public.
--   * content_ir.kind_example — one canonical authored example.
--     `validation_status` is LEFT TO THE TRIGGER
--     (`kind_example_recompute_validation` derives it on every write); writing
--     it by hand would be a fabricated pass.
--   * content_ir.kind_component — web/output → component_key
--     'serial_observation_timeline' (the compiled bridge facade into
--     SerialObservationTimelineBlock via block-dispatch).
--   * NO kind_edge (steps are json, not a child kind) and NO kind_surface
--     (`__kind` JSON is the only arrival form).
--
-- is_active is left FALSE on purpose: activation is the dual gate's call
-- (`content_ir.set_kind_activation` via scripts/shape/activate-kinds.ts), and
-- an inactive kind renders the generic viewer, which is correct, not broken.
--
-- Idempotent on business keys; re-apply is safe.
-- ============================================================================

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, sample_data,
   emitted_block_schema, emitted_json_schema, emitted_fingerprint,
   organization_id, visibility, metadata)
VALUES
  (
    'serial_observation_timeline',
    'Serial Observation Timeline',
    'ts',
    $J$[{"name":"title","required":true,"description":"The case's title, as the source names it.","type":"string"},{"name":"domain","description":"The field this case belongs to — clinical, incident, negotiation, sales, legal…","type":"string"},{"name":"opening","description":"What was on the table before anything was done.","type":"inline_object","fields":[{"name":"facts","description":"Everything known before the first step.","type":"string[]"}],"open":true},{"name":"steps","required":true,"description":"The steps in order — the order IS the expertise. Each: {step: 1-based position, at: when it happened in the source's words, newly_known: [facts that became known AT this step], excerpt: the verbatim sentence(s) it was read from, action: {kind: ask|examine|test|image|treat|observe|refer|wait|commit, target: what was done, why: the practitioner's own reason verbatim}, not_yet_known: [what was still open]}.","type":"json[]"},{"name":"sealed","description":"TRUE for a held-out case: the desk is examined on it and never learns from it, so no surface renders its resolution.","type":"boolean"},{"name":"resolution","description":"How it turned out. Absent on a sealed case — and never rendered for one.","type":"inline_object","fields":[{"name":"outcome","description":"The confirmed answer, as the source prints it.","type":"string"},{"name":"excerpt","description":"Verbatim.","type":"string"},{"name":"step","description":"The step at which it was confirmed.","type":"number"}],"open":true},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$J$::jsonb,
    $J${"__kind": "serial_observation_timeline", "title": "Thirty-one-year-old with fever and a stiff neck", "domain": "clinical", "opening": {"facts": ["31-year-old, previously well", "Fever for two days", "Worst headache of her life"]}, "steps": [{"step": 1, "at": "hour 0", "newly_known": ["Temperature 39.1", "Neck stiff on flexion"], "excerpt": "On arrival she was febrile at 39.1°C with marked neck stiffness.", "action": {"kind": "examine", "target": "full neurological examination", "why": "to look for focal signs before anything invasive"}, "not_yet_known": ["Whether there are focal neurological signs", "What is in the spinal fluid"]}, {"step": 2, "at": "hour 1", "newly_known": ["No focal neurological signs", "No papilloedema"], "excerpt": "Examination showed no focal deficit and no papilloedema.", "action": {"kind": "test", "target": "lumbar puncture", "why": "nothing on examination argued against going straight to it"}, "not_yet_known": ["What is in the spinal fluid"]}, {"step": 3, "at": "hour 2", "newly_known": ["Turbid spinal fluid", "Neutrophils 4,200", "Glucose low"], "excerpt": "The cerebrospinal fluid was turbid with 4,200 neutrophils and a low glucose.", "action": {"kind": "treat", "target": "intravenous ceftriaxone started immediately", "why": "treatment is started before the culture returns"}, "not_yet_known": ["Which organism"]}], "resolution": {"outcome": "Pneumococcal meningitis, confirmed on culture.", "excerpt": "Cultures grew Streptococcus pneumoniae.", "step": 3}}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"The case's title, as the source names it."},"domain":{"type":"string","description":"The field this case belongs to — clinical, incident, negotiation, sales, legal…"},"opening":{"type":"object","properties":{"facts":{"type":"array","items":{"type":"string"},"description":"Everything known before the first step."}},"required":[],"additionalProperties":true,"description":"What was on the table before anything was done."},"steps":{"type":"array","items":{},"description":"The steps in order — the order IS the expertise. Each: {step: 1-based position, at: when it happened in the source's words, newly_known: [facts that became known AT this step], excerpt: the verbatim sentence(s) it was read from, action: {kind: ask|examine|test|image|treat|observe|refer|wait|commit, target: what was done, why: the practitioner's own reason verbatim}, not_yet_known: [what was still open]}."},"sealed":{"type":"boolean","description":"TRUE for a held-out case: the desk is examined on it and never learns from it, so no surface renders its resolution."},"resolution":{"type":"object","properties":{"outcome":{"type":"string","description":"The confirmed answer, as the source prints it."},"excerpt":{"type":"string","description":"Verbatim."},"step":{"type":"number","description":"The step at which it was confirmed."}},"required":[],"additionalProperties":true,"description":"How it turned out. Absent on a sealed case — and never rendered for one."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"serial_observation_timeline"}},"required":["__kind","title","steps"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"The case's title, as the source names it."},"domain":{"type":"string","description":"The field this case belongs to — clinical, incident, negotiation, sales, legal…"},"opening":{"type":"object","properties":{"facts":{"type":"array","items":{"type":"string"},"description":"Everything known before the first step."}},"required":[],"additionalProperties":true,"description":"What was on the table before anything was done."},"steps":{"type":"array","items":{},"description":"The steps in order — the order IS the expertise. Each: {step: 1-based position, at: when it happened in the source's words, newly_known: [facts that became known AT this step], excerpt: the verbatim sentence(s) it was read from, action: {kind: ask|examine|test|image|treat|observe|refer|wait|commit, target: what was done, why: the practitioner's own reason verbatim}, not_yet_known: [what was still open]}."},"sealed":{"type":"boolean","description":"TRUE for a held-out case: the desk is examined on it and never learns from it, so no surface renders its resolution."},"resolution":{"type":"object","properties":{"outcome":{"type":"string","description":"The confirmed answer, as the source prints it."},"excerpt":{"type":"string","description":"Verbatim."},"step":{"type":"number","description":"The step at which it was confirmed."}},"required":[],"additionalProperties":true,"description":"How it turned out. Absent on a sealed case — and never rendered for one."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"serial_observation_timeline"}},"required":["__kind","title","steps"],"additionalProperties":false}$J$::jsonb,
    '1e0-6faugn1s63lfx',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public',
    $J${"loading_component":"list","source_name":"distillation.timeline_unfolder"}$J$::jsonb
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
  metadata = content_ir.kind_definition.metadata || EXCLUDED.metadata,
  updated_at = now();
  -- is_active deliberately NOT updated on re-apply: activation belongs to the
  -- dual gate (scripts/shape/activate-kinds.ts).

-- ── kind_example: the canonical sample ─────────────────────────────────────

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, organization_id)
SELECT d.id, d.version, $J${"__kind": "serial_observation_timeline", "title": "Thirty-one-year-old with fever and a stiff neck", "domain": "clinical", "opening": {"facts": ["31-year-old, previously well", "Fever for two days", "Worst headache of her life"]}, "steps": [{"step": 1, "at": "hour 0", "newly_known": ["Temperature 39.1", "Neck stiff on flexion"], "excerpt": "On arrival she was febrile at 39.1°C with marked neck stiffness.", "action": {"kind": "examine", "target": "full neurological examination", "why": "to look for focal signs before anything invasive"}, "not_yet_known": ["Whether there are focal neurological signs", "What is in the spinal fluid"]}, {"step": 2, "at": "hour 1", "newly_known": ["No focal neurological signs", "No papilloedema"], "excerpt": "Examination showed no focal deficit and no papilloedema.", "action": {"kind": "test", "target": "lumbar puncture", "why": "nothing on examination argued against going straight to it"}, "not_yet_known": ["What is in the spinal fluid"]}, {"step": 3, "at": "hour 2", "newly_known": ["Turbid spinal fluid", "Neutrophils 4,200", "Glucose low"], "excerpt": "The cerebrospinal fluid was turbid with 4,200 neutrophils and a low glucose.", "action": {"kind": "treat", "target": "intravenous ceftriaxone started immediately", "why": "treatment is started before the culture returns"}, "not_yet_known": ["Which organism"]}], "resolution": {"outcome": "Pneumococcal meningitis, confirmed on culture.", "excerpt": "Cultures grew Streptococcus pneumoniae.", "step": 3}}$J$::jsonb,
       'Fever and a stiff neck (canonical)',
       'Full shape: opening facts, three ordered steps each carrying newly-known facts, an action with its reason, and what was still unknown, then the resolution.',
       'authored', true, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'serial_observation_timeline'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_example x
    WHERE x.kind_definition_id = d.id
      AND x.label = 'Fever and a stiff neck (canonical)'
      AND x.deleted_at IS NULL
  );

-- ── kind_component: web output → the bundled renderer ──────────────────────

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'serial_observation_timeline', 'bundled',
       $J${"legacyBlockType":"serial_observation_timeline"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'serial_observation_timeline'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'serial_observation_timeline'
      AND c.deleted_at IS NULL
  );
