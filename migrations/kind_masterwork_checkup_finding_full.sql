-- ============================================================================
-- content-ir kind `masterwork_checkup_finding` (+ child `masterwork_checkup_rule`)
-- — FULL package. ONE Final Checkup finding, shaped as the sentence the Expert
-- reads, in the order Arman specified on 2026-08-18:
--
--   "The order needs to be: You said this -> They created this -> Here is what
--    is missing or wrong -> Here is the version recommended. Notice how that
--    actually flows."
--
-- Produced by aidream `services/masterwork_checkup/finding_ir.py` and attached
-- to every `masterwork_checkup_finding` stream event as `data.content_ir`, so
-- `processStream` promotes it into a canonical render block and the platform's
-- ONE renderer draws each finding LIVE as the producer agent writes it.
--
-- NO `kind_surface` row: `__kind` JSON is the only arrival form.
-- NO `skill.definition` / `skill.render_definition` rows, deliberately: no
-- agent ever emits this shape. The checkup producer agents answer with their
-- own `findings[]` contract and the SERVER projects each gated finding into
-- this kind — teaching an agent to emit it would invent a second producer for
-- a shape that has exactly one.
--
-- data / emitted_block_schema / emitted_json_schema / emitted_fingerprint are
-- CONVERTER-EMITTED (`tsx scripts/shape/emit-kind-rows.ts`) from
-- features/content-ir/kinds/masterwork-checkup-finding.ts — never hand-written.
-- `validation_status` on kind_example is NOT written here: the
-- kind_example_recompute_validation trigger derives it on write.
--
-- Idempotent on business keys; re-apply is safe. `is_active` on existing
-- kind_definition rows is deliberately NOT touched on re-apply — activation
-- belongs to `content_ir.set_kind_activation`.
-- ============================================================================

BEGIN;

-- 1. kind_definition: child first (the root's edges resolve to it)

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, sample_data,
   emitted_block_schema, emitted_json_schema, emitted_fingerprint,
   is_active, organization_id, visibility)
VALUES
  (
    'masterwork_checkup_rule',
    'Checkup Rule',
    'ts',
    $J$[{"name":"name","required":true,"description":"The rule's short name, as it reads in the Rulebook.","type":"string"},{"name":"statement","required":true,"description":"The rule itself, in one or two sentences.","type":"string"},{"name":"rationale","description":"Why the rule matters.","type":"string"},{"name":"detection","description":"How you would catch someone breaking it.","type":"string"},{"name":"severity","required":true,"description":"How bad breaking this rule is.","type":"enum","values":["critical","major","minor"]},{"name":"section","description":"The Rulebook section code this rule files under.","type":"string"},{"name":"rule_id","description":"The live Rulebook rule id, when this is a rule that already exists. Audits cite it and it never changes.","type":"string"}]$J$::jsonb,
    $J${"__kind": "masterwork_checkup_rule", "name": "Answer the question in the first sentence", "statement": "Put the direct answer in the first sentence, before any context or setup.", "rationale": "Readers decide in one line whether the page answers their question.", "detection": "The first sentence describes the topic instead of answering the question.", "severity": "major", "section": "S1"}$J$::jsonb,
    $J${"type":"object","properties":{"name":{"type":"string","description":"The rule's short name, as it reads in the Rulebook."},"statement":{"type":"string","description":"The rule itself, in one or two sentences."},"rationale":{"type":"string","description":"Why the rule matters."},"detection":{"type":"string","description":"How you would catch someone breaking it."},"severity":{"type":"string","enum":["critical","major","minor"],"description":"How bad breaking this rule is."},"section":{"type":"string","description":"The Rulebook section code this rule files under."},"rule_id":{"type":"string","description":"The live Rulebook rule id, when this is a rule that already exists. Audits cite it and it never changes."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"masterwork_checkup_rule"}},"required":["__kind","name","statement","severity"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"name":{"type":"string","description":"The rule's short name, as it reads in the Rulebook."},"statement":{"type":"string","description":"The rule itself, in one or two sentences."},"rationale":{"type":"string","description":"Why the rule matters."},"detection":{"type":"string","description":"How you would catch someone breaking it."},"severity":{"type":"string","enum":["critical","major","minor"],"description":"How bad breaking this rule is."},"section":{"type":"string","description":"The Rulebook section code this rule files under."},"rule_id":{"type":"string","description":"The live Rulebook rule id, when this is a rule that already exists. Audits cite it and it never changes."}},"required":["name","statement","severity"],"additionalProperties":false}$J$::jsonb,
    'pl-10x0ttr109nsxl',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'masterwork_checkup_finding',
    'Final Checkup Finding',
    'ts',
    $J$[{"name":"finding_id","required":true,"description":"Identifies this finding for the whole checkup run.","type":"string"},{"name":"change","required":true,"description":"What the Expert is being asked to do.","type":"enum","values":["add","modify","retire"]},{"name":"you_said","required":true,"description":"STEP 1 — the Expert's own verbatim words. Never paraphrased; a finding without them never reaches the Expert.","type":"string"},{"name":"said_where","description":"STEP 1's door — where the Expert said it.","type":"inline_object","fields":[{"name":"conversation_id","type":"string"},{"name":"message_id","type":"string"},{"name":"file_id","type":"string"}],"open":true},{"name":"current_rule","description":"STEP 2 — the rule the system actually made. Absent means nothing was made for this.","type":"object"},{"name":"gap","required":true,"description":"STEP 3 — what is missing or wrong, in the Expert's own terms, never model jargon.","type":"string"},{"name":"recommended_rule","description":"STEP 4 — the version recommended. This is the thing acted on.","type":"object"},{"name":"alternatives","description":"Other wordings the checkup genuinely saw. The Expert picks one; recommended_rule stays the recommendation.","type":"array"},{"name":"belongs_in","description":"The Rulebook section this would live in, by its label.","type":"string"},{"name":"confidence","description":"How sure the checkup is. Rendered honestly.","type":"number","min":0,"max":1},{"name":"found_by","description":"Which checkup pass found it.","type":"string"},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$J$::jsonb,
    $J${"__kind": "masterwork_checkup_finding", "finding_id": "checkup_auditor-9f2c1ab4de", "change": "modify", "you_said": "It has to be the first sentence, not just somewhere in the first paragraph. People decide in one line.", "said_where": {"conversation_id": "6f1c1f0e-3a8e-4a3c-9d21-0a2b7c8d5e11", "message_id": "b1d2c3e4-5f60-4a71-8b92-0c1d2e3f4a55"}, "current_rule": {"__kind": "masterwork_checkup_rule", "rule_id": "answer-first", "name": "Answer the question first", "statement": "Put the answer in the first paragraph.", "rationale": "Readers who have to hunt for the answer leave.", "severity": "major", "section": "S1"}, "gap": "Your rule says first paragraph. You said first sentence — and you said it twice, both times about the same problem.", "recommended_rule": {"__kind": "masterwork_checkup_rule", "name": "Answer the question in the first sentence", "statement": "Put the direct answer in the first sentence, before any context or setup.", "rationale": "Readers decide in one line whether the page answers their question.", "detection": "The first sentence describes the topic instead of answering the question.", "severity": "major", "section": "S1"}, "belongs_in": "Structure", "confidence": 0.88, "found_by": "checkup_auditor"}$J$::jsonb,
    $J${"type":"object","properties":{"finding_id":{"type":"string","description":"Identifies this finding for the whole checkup run."},"change":{"type":"string","enum":["add","modify","retire"],"description":"What the Expert is being asked to do."},"you_said":{"type":"string","description":"STEP 1 — the Expert's own verbatim words. Never paraphrased; a finding without them never reaches the Expert."},"said_where":{"type":"object","properties":{"conversation_id":{"type":"string"},"message_id":{"type":"string"},"file_id":{"type":"string"}},"required":[],"additionalProperties":true,"description":"STEP 1's door — where the Expert said it."},"current_rule":{"$ref":"#/$defs/masterwork_checkup_rule","description":"STEP 2 — the rule the system actually made. Absent means nothing was made for this."},"gap":{"type":"string","description":"STEP 3 — what is missing or wrong, in the Expert's own terms, never model jargon."},"recommended_rule":{"$ref":"#/$defs/masterwork_checkup_rule","description":"STEP 4 — the version recommended. This is the thing acted on."},"alternatives":{"type":"array","items":{"$ref":"#/$defs/masterwork_checkup_rule"},"description":"Other wordings the checkup genuinely saw. The Expert picks one; recommended_rule stays the recommendation."},"belongs_in":{"type":"string","description":"The Rulebook section this would live in, by its label."},"confidence":{"type":"number","description":"How sure the checkup is. Rendered honestly."},"found_by":{"type":"string","description":"Which checkup pass found it."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"masterwork_checkup_finding"}},"required":["__kind","finding_id","change","you_said","gap"],"additionalProperties":false,"$defs":{"masterwork_checkup_rule":{"type":"object","properties":{"name":{"type":"string","description":"The rule's short name, as it reads in the Rulebook."},"statement":{"type":"string","description":"The rule itself, in one or two sentences."},"rationale":{"type":"string","description":"Why the rule matters."},"detection":{"type":"string","description":"How you would catch someone breaking it."},"severity":{"type":"string","enum":["critical","major","minor"],"description":"How bad breaking this rule is."},"section":{"type":"string","description":"The Rulebook section code this rule files under."},"rule_id":{"type":"string","description":"The live Rulebook rule id, when this is a rule that already exists. Audits cite it and it never changes."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"masterwork_checkup_rule"}},"required":["__kind","name","statement","severity"],"additionalProperties":false}}}$J$::jsonb,
    $J${"type":"object","properties":{"finding_id":{"type":"string","description":"Identifies this finding for the whole checkup run."},"change":{"type":"string","enum":["add","modify","retire"],"description":"What the Expert is being asked to do."},"you_said":{"type":"string","description":"STEP 1 — the Expert's own verbatim words. Never paraphrased; a finding without them never reaches the Expert."},"said_where":{"type":"object","properties":{"conversation_id":{"type":"string"},"message_id":{"type":"string"},"file_id":{"type":"string"}},"required":[],"additionalProperties":true,"description":"STEP 1's door — where the Expert said it."},"current_rule":{"$ref":"#/$defs/masterwork_checkup_rule","description":"STEP 2 — the rule the system actually made. Absent means nothing was made for this."},"gap":{"type":"string","description":"STEP 3 — what is missing or wrong, in the Expert's own terms, never model jargon."},"recommended_rule":{"$ref":"#/$defs/masterwork_checkup_rule","description":"STEP 4 — the version recommended. This is the thing acted on."},"alternatives":{"type":"array","items":{"$ref":"#/$defs/masterwork_checkup_rule"},"description":"Other wordings the checkup genuinely saw. The Expert picks one; recommended_rule stays the recommendation."},"belongs_in":{"type":"string","description":"The Rulebook section this would live in, by its label."},"confidence":{"type":"number","description":"How sure the checkup is. Rendered honestly."},"found_by":{"type":"string","description":"Which checkup pass found it."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true}},"required":["finding_id","change","you_said","gap"],"additionalProperties":false,"$defs":{"masterwork_checkup_rule":{"type":"object","properties":{"name":{"type":"string","description":"The rule's short name, as it reads in the Rulebook."},"statement":{"type":"string","description":"The rule itself, in one or two sentences."},"rationale":{"type":"string","description":"Why the rule matters."},"detection":{"type":"string","description":"How you would catch someone breaking it."},"severity":{"type":"string","enum":["critical","major","minor"],"description":"How bad breaking this rule is."},"section":{"type":"string","description":"The Rulebook section code this rule files under."},"rule_id":{"type":"string","description":"The live Rulebook rule id, when this is a rule that already exists. Audits cite it and it never changes."}},"required":["name","statement","severity"],"additionalProperties":false}}}$J$::jsonb,
    '25q-kwb8gba185b5',
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

-- 2. kind_edge: the three places a rule hangs off a finding

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, v.field_name, c.id, v.position, p.organization_id
FROM (VALUES
  ('current_rule', 0),
  ('recommended_rule', 0),
  ('alternatives', 0)
) AS v(field_name, position)
JOIN content_ir.kind_definition p
  ON p.kind = 'masterwork_checkup_finding'
 AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND p.deleted_at IS NULL
JOIN content_ir.kind_definition c
  ON c.kind = 'masterwork_checkup_rule'
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

-- 3. kind_example — validation_status is DERIVED by the trigger, never written.

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, organization_id)
SELECT d.id, d.version, v.data::jsonb, v.label, v.description,
       'authored', v.is_canonical, d.organization_id
FROM (VALUES
  (
    'masterwork_checkup_finding',
    'A rule that says less than the Expert meant (canonical)',
    true,
    'The full four-step shape: the verbatim words, the rule the system actually made, the gap in plain language, and the recommended version.',
    $J${"__kind": "masterwork_checkup_finding", "finding_id": "checkup_auditor-9f2c1ab4de", "change": "modify", "you_said": "It has to be the first sentence, not just somewhere in the first paragraph. People decide in one line.", "said_where": {"conversation_id": "6f1c1f0e-3a8e-4a3c-9d21-0a2b7c8d5e11", "message_id": "b1d2c3e4-5f60-4a71-8b92-0c1d2e3f4a55"}, "current_rule": {"__kind": "masterwork_checkup_rule", "rule_id": "answer-first", "name": "Answer the question first", "statement": "Put the answer in the first paragraph.", "rationale": "Readers who have to hunt for the answer leave.", "severity": "major", "section": "S1"}, "gap": "Your rule says first paragraph. You said first sentence — and you said it twice, both times about the same problem.", "recommended_rule": {"__kind": "masterwork_checkup_rule", "name": "Answer the question in the first sentence", "statement": "Put the direct answer in the first sentence, before any context or setup.", "rationale": "Readers decide in one line whether the page answers their question.", "detection": "The first sentence describes the topic instead of answering the question.", "severity": "major", "section": "S1"}, "belongs_in": "Structure", "confidence": 0.88, "found_by": "checkup_auditor"}$J$
  ),
  (
    'masterwork_checkup_finding',
    'An exception no rule captures (nothing was created)',
    false,
    'The add case: step 2 has no rule at all, which is what the component says out loud rather than hiding the step.',
    $J${"__kind": "masterwork_checkup_finding", "finding_id": "exception_hunter-4b7d0e21ac", "change": "add", "you_said": "Unless it's a legal page. Then I never cut anything, however long it gets.", "gap": "Nothing in your Rulebook carries this exception, so the brevity rules apply to legal pages too.", "recommended_rule": {"__kind": "masterwork_checkup_rule", "name": "Legal pages are exempt from cutting", "statement": "Never shorten a legal page for brevity. Completeness wins over length there.", "severity": "critical", "section": "G"}, "belongs_in": "General", "confidence": 0.82, "found_by": "exception_hunter"}$J$
  ),
  (
    'masterwork_checkup_rule',
    'One rule as the checkup shows it (canonical)',
    true,
    'The shape both the current rule and the recommended version use.',
    $J${"__kind": "masterwork_checkup_rule", "name": "Answer the question in the first sentence", "statement": "Put the direct answer in the first sentence, before any context or setup.", "rationale": "Readers decide in one line whether the page answers their question.", "detection": "The first sentence describes the topic instead of answering the question.", "severity": "major", "section": "S1"}$J$
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

-- 4. kind_component: web output -> the bundled renderer
--    (MasterworkCheckupFindingBlock, reached through the compiled bridge).

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'masterwork_checkup_finding', 'bundled',
       $J${"legacyBlockType": "masterwork_checkup_finding"}$J$::jsonb,
       true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'masterwork_checkup_finding'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'masterwork_checkup_finding'
      AND c.deleted_at IS NULL
  );

COMMIT;
