-- content_ir_stage3_component_rows.sql
-- Shape System STAGE 3 CORE — make content_ir.kind_component the REAL resolver
-- for every compiled-bridge kind, and give each one a canonical kind_example.
--
-- Before this migration only 11 kinds had a kind_component row; the pre-sweep
-- legacy kinds rendered through the compiled floor (registry/system-components.ts,
-- derived from each definition's `legacyBlockType`) but were INVISIBLE to a DB
-- read of the resolver. `component_key` here IS that same `legacyBlockType`
-- string — the key BlockComponentRegistry routes on — so the DB row and the
-- compiled floor agree by construction (R1).
--
-- Idempotent throughout (WHERE NOT EXISTS / <> guards; safe to re-apply).
--
-- ── Dual-gate outcome (R6). Run with the REAL gate: features/content-ir/registry/
--    kind-dual-gate.ts#runKindDualGate, fed the REAL compiled definitions
--    (SYSTEM_KIND_DEFINITIONS, bridges included) + the LIVE emitted_json_schema
--    + the canonical example below. Nothing here was hand-waved.
--
--    kind               component_key      structural  render  is_active
--    quiz_set           quiz               pass        pass    true
--    presentation_deck  presentation       pass        pass    true   (example pre-existed)
--    decision_tree      decision_tree      pass        pass    true
--    comparison_set     comparison_table   pass        pass    true
--    diagram_spec       diagram            pass        pass    true
--    math_problem       math_problem       pass        pass    true
--    item_presentation  item_presentation  pass        pass*   true
--    schema_proposal    schema_proposal    FAIL        pass    FALSE  <- stays inactive
--
--    * item_presentation is BRIDGELESS (ItemPresentationBlock parses `content`
--      itself). validateRender passes it with the recorded caveat "full DOM
--      render check deferred to an RTL harness" — not a bridge-verified leg.
--
-- ── Why schema_proposal legitimately FAILS the structural leg ──────────────
--    Its `schema` field is declared `{ type: "inline_object", fields: {},
--    required: true }` — an OPEN object whose contents ride the zero-loss
--    residue channel. The materializer renders an empty `fields` map as
--    `{"type":"object","properties":{},"additionalProperties":false}`, i.e. a
--    CLOSED empty object. Since `schema` is also `required`, the ONLY instance
--    that can satisfy emitted_json_schema is the degenerate `"schema": {}`.
--    Every real schema proposal (the payload the component exists to render)
--    is rejected with `/schema must NOT have additional properties`.
--    The render leg PASSES — schemaProposalServerDataFromEnvelope returns the
--    full proposal, verbatim. So the component accepts the bridge output fine;
--    the SCHEMA is what cannot express the kind.
--    Fix (out of scope here — touches system-kinds.ts + the materializer):
--    let an `inline_object` with an empty `fields` map emit
--    `additionalProperties: true`. Until then schema_proposal stays
--    is_active=false and renders via the generic viewer, which per R6 is the
--    correct, non-erroring behavior. Its canonical example below is stored
--    HONESTLY with validation_status='failed' — a fabricated 'passed' would be
--    the defect.
--
-- ── Statement ORDER is load-bearing (see step 4) ───────────────────────────
--    `platform._touch_row` bumps `kind_definition.version` on EVERY update, so
--    the step-3 `is_active` flip advances the row version. kind_example rows
--    are version-bound (R4) and `scripts/shape/set-sample.ts` looks them up by
--    `kind_version = kind_definition.version`. Inserting examples BEFORE the
--    flip therefore strands them one version behind. Step 4 re-binds them.
--    Pre-existing platform defect: the 10 gold-mine kinds activated by
--    `pnpm shape:activate --apply` are all stranded this way today (e.g.
--    timeline kind v2 / example kind_version 1). Not repaired here — out of
--    this task's blast radius — but recorded so it is not lost.


-- ── 1. kind_component rows: (kind, web, output) -> legacyBlockType ─────────

insert into content_ir.kind_component (kind_definition_id, platform, role, component_key, source, config, organization_id)
select kd.id, 'web', 'output', v.component_key, 'bundled',
       jsonb_build_object('legacyBlockType', v.component_key), kd.organization_id
from (values
  ('quiz_set', 'quiz'),
  ('presentation_deck', 'presentation'),
  ('decision_tree', 'decision_tree'),
  ('comparison_set', 'comparison_table'),
  ('diagram_spec', 'diagram'),
  ('math_problem', 'math_problem'),
  ('item_presentation', 'item_presentation'),
  ('schema_proposal', 'schema_proposal')
) as v(kind, component_key)
join content_ir.kind_definition kd on kd.kind = v.kind and kd.deleted_at is null
where not exists (
  select 1 from content_ir.kind_component c
  where c.kind_definition_id = kd.id and c.platform = 'web' and c.role = 'output'
    and c.deleted_at is null
);

-- ── 2. canonical kind_example rows (authored; each validated against the LIVE
--       emitted_json_schema with the gate's own ajv config before writing).
--       Guard is version-AGNOSTIC on purpose: keying it to kd.version would
--       re-insert a duplicate canonical row after step 3 bumped the version.
insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, v.data, v.label, v.description, 'authored', true, v.validation_status,
       case when v.validation_status = 'passed' then now() else null end, kd.organization_id
from (values
  (
    'quiz_set',
    '{"title": "Cell Biology Fundamentals", "description": "Ten-minute check on organelles, membranes, and cellular respiration.", "questions": [{"type": "multiple_choice", "question": "Which organelle is the primary site of ATP production in eukaryotic cells?", "options": ["Nucleus", "Mitochondrion", "Golgi apparatus", "Lysosome"], "correct_answer": "Mitochondrion", "explanation": "Oxidative phosphorylation occurs across the inner mitochondrial membrane, where the electron transport chain drives ATP synthase."}, {"type": "multiple_choice", "question": "What primarily determines the selective permeability of the plasma membrane?", "options": ["The phospholipid bilayer and its embedded transport proteins", "The cell wall", "The concentration of ribosomes", "The nuclear envelope"], "correct_answer": "The phospholipid bilayer and its embedded transport proteins", "explanation": "The hydrophobic core blocks most polar solutes; channel and carrier proteins provide regulated passage."}, {"type": "true_false", "question": "Prokaryotic cells contain membrane-bound organelles.", "options": ["True", "False"], "correct_answer": "False", "explanation": "Prokaryotes lack membrane-bound organelles; their genetic material occupies a nucleoid region rather than a true nucleus."}]}'::jsonb,
    'Cell biology quiz (canonical)',
    'Mixed multiple-choice + true/false quiz. correct_answer is the option TEXT (the shape the quiz bridge resolves to an index).',
    'passed'
  ),
  (
    'decision_tree',
    '{"title": "Production Incident Triage", "description": "First-responder decision path for a paging alert.", "root": {"question": "Are users currently unable to complete a core workflow?", "description": "Core workflows: sign-in, checkout, data write.", "yes": {"question": "Did the impact begin within 30 minutes of a deploy?", "yes": {"action": "Roll back the most recent deploy, then confirm recovery", "description": "Rollback is faster than root-cause under active impact.", "priority": "high", "category": "mitigation", "estimatedTime": "10 minutes"}, "no": {"action": "Declare a Sev-1, page the on-call lead, open an incident channel", "description": "Unknown cause plus active impact warrants full incident response.", "priority": "high", "category": "escalation", "estimatedTime": "5 minutes"}}, "no": {"question": "Is an error-rate or latency SLO actively burning?", "yes": {"action": "Open a Sev-3 and investigate during business hours", "priority": "medium", "category": "investigation", "estimatedTime": "1 hour"}, "no": {"action": "Silence the alert and file a tuning ticket for its threshold", "description": "A page with no user impact and no SLO burn is a bad alert.", "priority": "low", "category": "alert-hygiene", "estimatedTime": "15 minutes"}}}}'::jsonb,
    'Production incident triage (canonical)',
    'Branching question nodes with yes/no children terminating in action leaves — the shape parseDecisionTreeJSON assigns ids to.',
    'passed'
  ),
  (
    'comparison_set',
    '{"title": "Relational Databases Compared", "description": "Choosing an embedded or server relational database for a new service.", "items": ["PostgreSQL", "MySQL", "SQLite"], "criteria": [{"name": "License", "values": ["PostgreSQL License", "GPL-2.0", "Public domain"], "type": "text", "weight": 1, "higherIsBetter": true}, {"name": "Operational cost", "values": ["$$", "$$", "$"], "type": "cost", "weight": 2, "higherIsBetter": false}, {"name": "Native JSONB support", "values": ["true", "false", "false"], "type": "boolean", "weight": 2, "higherIsBetter": true}, {"name": "Concurrent write throughput", "values": ["5", "4", "2"], "type": "rating", "weight": 3, "higherIsBetter": true}]}'::jsonb,
    'Relational database comparison (canonical)',
    'Every criterion carries exactly one value per compared item — parseComparisonJSON THROWS on a length mismatch. Values are strings per the kind schema; the parser normalizes per criterion `type`.',
    'passed'
  ),
  (
    'diagram_spec',
    '{"title": "HTTP Request Lifecycle", "description": "How an authenticated request flows through the edge, the app, and the database.", "type": "flowchart", "nodes": [{"id": "client", "label": "Browser", "type": "input", "description": "Issues the request with a session cookie."}, {"id": "edge", "label": "Edge Proxy", "type": "process", "description": "Terminates TLS and enforces route guards."}, {"id": "auth", "label": "Auth Check", "type": "decision", "description": "Validates the session and resolves the user."}, {"id": "app", "label": "Application Server", "type": "process", "description": "Executes the handler."}, {"id": "db", "label": "Postgres", "type": "output", "description": "Row-level security filters every read."}], "edges": [{"id": "e1", "source": "client", "target": "edge", "label": "HTTPS", "arrow": true}, {"id": "e2", "source": "edge", "target": "auth", "label": "session cookie", "arrow": true}, {"id": "e3", "source": "auth", "target": "app", "label": "authenticated", "arrow": true}, {"id": "e4", "source": "auth", "target": "client", "label": "401 rejected", "dashed": true, "arrow": true}, {"id": "e5", "source": "app", "target": "db", "label": "RLS-filtered query", "arrow": true}], "layout": {"direction": "TB", "spacing": 80, "algorithm": "dagre"}, "renderHints": {"showLegend": true, "showEdgeLabels": true, "compactNodes": false, "hideArrows": false}}'::jsonb,
    'Request lifecycle flowchart (canonical)',
    'Flowchart with typed nodes and labelled edges. Every node carries id + label (parseDiagramJSON throws without them); every edge references a declared node id.',
    'passed'
  ),
  (
    'math_problem',
    '{"title": "Solve a Quadratic by Completing the Square", "course_name": "Algebra I", "topic_name": "Quadratic Equations", "module_name": "Completing the Square", "description": "A standard-form quadratic solved without the quadratic formula.", "intro_text": "Completing the square rewrites a quadratic so the variable appears exactly once, which makes the roots readable directly.", "problem_statement": {"text": "A quadratic equation is given in standard form.", "equation": "x^2 + 6x + 5 = 0", "instruction": "Solve for x by completing the square."}, "solutions": [{"task": "Solve x^2 + 6x + 5 = 0 by completing the square", "steps": [{"title": "Move the constant term", "equation": "x^2 + 6x = -5", "explanation": "Subtract 5 from both sides so the left side holds only the variable terms.", "simplified": "x^2 + 6x = -5"}, {"title": "Add the square of half the linear coefficient", "equation": "x^2 + 6x + 9 = -5 + 9", "explanation": "Half of 6 is 3, and 3^2 = 9. Adding 9 to both sides preserves equality and makes the left side a perfect square.", "simplified": "(x + 3)^2 = 4"}, {"title": "Take the square root and isolate x", "equation": "x + 3 = \\pm 2", "explanation": "Both roots of 4 are valid, so the equation splits into two linear equations.", "simplified": "x = -1 or x = -5"}], "solutionAnswer": "x = -1 or x = -5", "transitionText": "Substituting each root back into the original equation confirms both satisfy it."}], "hint": "Half the coefficient of x, then square it — that is the number you add to both sides.", "resources": ["Completing the square — visual derivation", "Why the quadratic formula is completing the square, generalized"], "difficulty_level": "beginner", "final_statement": "Completing the square generalizes directly into the quadratic formula.", "related_content": ["quadratic_formula", "factoring_quadratics"]}'::jsonb,
    'Quadratic by completing the square (canonical)',
    'One worked solution with three ordered steps, each carrying the equation state after the step.',
    'passed'
  ),
  (
    'item_presentation',
    '{"type": "book", "id": "the-pragmatic-programmer", "name": "The Pragmatic Programmer", "about": "Andrew Hunt and David Thomas on the craft of software: orthogonality, tracer bullets, DRY, and taking responsibility for your code. Twentieth-anniversary edition, 2019."}'::jsonb,
    'Book item presentation (canonical)',
    'The declared surface of the kind (type/id/name/about). NOTE: emitted_json_schema is closed (additionalProperties:false), so the kind''s real open-extra-field payloads cannot be expressed in a schema-valid example.',
    'passed'
  ),
  (
    'schema_proposal',
    '{"name": "support_ticket_extraction", "strict": true, "schema": {"type": "object", "properties": {"ticket_id": {"type": "string"}, "severity": {"type": "string", "enum": ["low", "medium", "high", "critical"]}, "summary": {"type": "string"}, "affected_components": {"type": "array", "items": {"type": "string"}}}, "required": ["ticket_id", "severity", "summary"], "additionalProperties": false}}'::jsonb,
    'Support-ticket extraction schema (canonical)',
    'A REAL structured-output schema proposal — the payload the schema_proposal component exists to render. Authored honestly; see the migration header for why the structural leg rejects it.',
    'failed'
  )
) as v(kind, data, label, description, validation_status)
join content_ir.kind_definition kd on kd.kind = v.kind and kd.deleted_at is null
where not exists (
  select 1 from content_ir.kind_example e
  where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null
);

-- ── 3. activation — ONLY the slugs that genuinely passed BOTH legs ─────────
--       (schema_proposal is deliberately absent; see the header.)
update content_ir.kind_definition set is_active = true
where deleted_at is null and not is_active
  and kind in ('quiz_set', 'presentation_deck', 'decision_tree', 'comparison_set', 'diagram_spec', 'math_problem', 'item_presentation');

-- ── 4. re-bind each canonical example to its kind's CURRENT version, which
--       step 3's update just advanced (platform._touch_row). Self-healing and
--       idempotent: the `<>` guard makes it a no-op once aligned. Scoped to
--       this migration's 8 slugs — the gold-mine strandings are not ours.
update content_ir.kind_example e set kind_version = kd.version
from content_ir.kind_definition kd
where kd.id = e.kind_definition_id
  and e.is_canonical and e.deleted_at is null and kd.deleted_at is null
  and e.kind_version <> kd.version
  and kd.kind in ('quiz_set', 'presentation_deck', 'decision_tree', 'comparison_set', 'diagram_spec', 'math_problem', 'item_presentation', 'schema_proposal');
