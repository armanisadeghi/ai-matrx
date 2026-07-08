-- content_ir_generic_structured_roots.sql
--
-- Retires the three "no-component root" kinds that have sat as permanent
-- red/yellow gaps on the Shape System tracker since wave 1:
--
--   q_and_a_set · study_pack_set · schema_showcase
--
-- Each has a schema in content_ir.kind_definition but NO renderer, so it could
-- never activate and its block fell through the unified renderer to a raw code
-- block. Shape System ruling R6 ("inactive/unknown -> generic viewer, never an
-- error, never hidden content") now has a real destination: the bundled
-- `generic_structured` component (components/mardown-display/blocks/generic/
-- GenericStructuredBlock.tsx), wired at the render seam in
-- features/content-ir/react/kind-route.ts.
--
-- This migration does exactly two things per kind:
--   1. authors the missing CANONICAL kind_example (R4);
--   2. registers the (kind, web, output) -> generic_structured resolver row (R1).
--
-- The examples were validated FOR REAL before this file was written: the
-- production structural leg (`validateStructuralLeg`, features/content-ir/
-- registry/kind-dual-gate.ts — ajv { allErrors: true, strict: false } with
-- deep __kind stripping) was run against each kind's LIVE emitted_json_schema,
-- and a negative control (missing required / wrong type / bad enum / extra key)
-- was confirmed to FAIL. Hence validation_status = 'passed'.
--
-- This migration deliberately does NOT touch kind_definition.is_active.
-- Activation is the dual gate's verdict and is owned centrally (`shape:activate`).
-- NOTE: the dual gate's RENDER leg reads a COMPILED TS facet
-- (`legacyBlockType` / `component` on a KindDefinition), not a kind_component
-- row — so these three still will NOT pass the gate until `generic_structured`
-- is added to the compiled bootstrap (features/content-ir/registry/system-kinds.ts).
-- Rendering, however, no longer depends on that: the seam resolves them today.
--
-- Idempotent: re-running is safe. Conflicts are inferred on the real partial
-- unique indexes (kind_example_canonical_unique, kind_component_default_unique).

begin;

-- ── 1. Canonical examples (R4) ──────────────────────────────────────────────
with sample(kind, label, description, data) as (
  values
    (
      'q_and_a_set',
      'Photosynthesis Q&A (canonical)',
      'A three-card question/answer set exercising the flashcard and basic_card branches of the cards anyOf.',
      $json${
        "title": "Photosynthesis — Q&A",
        "cards": [
          {
            "front": "What pigment captures light energy in photosynthesis?",
            "back": "Chlorophyll, held in the thylakoid membranes of the chloroplast.",
            "topic": "Light reactions",
            "difficulty": "easy",
            "tags": ["biology", "plants"]
          },
          {
            "front": "Where does the Calvin cycle take place?",
            "back": "In the stroma of the chloroplast, using ATP and NADPH from the light reactions.",
            "topic": "Calvin cycle",
            "difficulty": "medium"
          },
          {
            "front": "Write the overall equation for photosynthesis.",
            "back": "6 CO2 + 6 H2O + light energy -> C6H12O6 + 6 O2"
          }
        ]
      }$json$::jsonb
    ),
    (
      'study_pack_set',
      'Cell biology exam prep pack (canonical)',
      'A study pack whose included_sets exercises both the quiz_set and q_and_a_set branches of the anyOf.',
      $json${
        "title": "Cell Biology — Exam Prep Pack",
        "topic": "Cell biology",
        "difficulty": "intermediate",
        "grade_level": "Undergraduate year 1",
        "description": "A combined quiz and Q&A pack covering organelles and membrane transport.",
        "included_sets": [
          {
            "title": "Organelles quiz",
            "description": "Ten-minute check on organelle function.",
            "questions": [
              {
                "type": "multiple_choice",
                "question": "Which organelle is the primary site of ATP synthesis?",
                "options": ["Mitochondrion", "Ribosome", "Golgi apparatus", "Lysosome"],
                "correct_answer": "Mitochondrion",
                "explanation": "Oxidative phosphorylation occurs across the inner mitochondrial membrane."
              },
              {
                "type": "true_false",
                "question": "Ribosomes are bounded by a lipid membrane.",
                "options": ["True", "False"],
                "correct_answer": "False",
                "explanation": "Ribosomes are ribonucleoprotein complexes, not membrane-bound organelles."
              }
            ]
          },
          {
            "title": "Membrane transport Q&A",
            "cards": [
              {
                "front": "What drives passive diffusion across a membrane?",
                "back": "The concentration gradient alone — no ATP is consumed.",
                "topic": "Membrane transport",
                "difficulty": "easy"
              },
              {
                "front": "How does the sodium-potassium pump differ from facilitated diffusion?",
                "back": "It is active transport: it hydrolyses ATP to move ions against their gradients.",
                "topic": "Membrane transport",
                "difficulty": "medium"
              }
            ]
          }
        ]
      }$json$::jsonb
    ),
    (
      'schema_showcase',
      'Ingestion pipeline profile (canonical)',
      'Exercises every branch of the showcase schema: enum, nullable, arrays of scalars, nested object, string-map metadata, child items, a $ref, and the polymorphic value.',
      $json${
        "label": "Ingestion pipeline profile",
        "count": 42,
        "status": "published",
        "active": true,
        "notes": null,
        "flags": [true, false, true],
        "labels": ["ingest", "nightly"],
        "scores": [0.91, 0.87, 0.78],
        "config": { "enabled": true, "retries": 3, "timeout_ms": 30000 },
        "metadata": { "owner": "platform", "region": "us-west-1" },
        "children": [
          { "name": "parse", "weight": 0.4 },
          { "name": "embed", "weight": 0.6 }
        ],
        "nested_ref": { "ref_id": "profile_v2" },
        "polymorphic_value": 3.14
      }$json$::jsonb
    )
)
insert into content_ir.kind_example (
  kind_definition_id, kind_version, data, label, description,
  source, is_canonical, validation_status, validated_at, organization_id
)
select
  kd.id, kd.version, s.data, s.label, s.description,
  'authored', true, 'passed', now(), kd.organization_id
from sample s
join content_ir.kind_definition kd
  on kd.kind = s.kind and kd.deleted_at is null
on conflict (kind_definition_id, kind_version)
  where (is_canonical and deleted_at is null)
do update set
  data              = excluded.data,
  label             = excluded.label,
  description       = excluded.description,
  source            = excluded.source,
  validation_status = excluded.validation_status,
  validated_at      = excluded.validated_at,
  updated_at        = now();

-- ── 2. Resolver rows (R1): (kind, web, output) -> generic_structured ─────────
-- `source = 'bundled'` because the component ships compiled with the app.
-- `is_active = true` is truthful: the generic viewer really is this kind's web
-- output component today. It is NOT a claim that a bespoke renderer exists —
-- GenericStructuredBlock always renders the "unverified shape" affordance, so
-- naming it here can never silently hide the missing renderer.
insert into content_ir.kind_component (
  kind_definition_id, platform, role, component_key,
  source, config, is_default, is_active, sort_order, organization_id
)
select
  kd.id, 'web', 'output', 'generic_structured',
  'bundled', '{}'::jsonb, true, true, 100, kd.organization_id
from content_ir.kind_definition kd
where kd.kind in ('q_and_a_set', 'study_pack_set', 'schema_showcase')
  and kd.deleted_at is null
on conflict (kind_definition_id, platform, role)
  where (is_default and deleted_at is null)
do update set
  component_key = excluded.component_key,
  source        = excluded.source,
  config        = excluded.config,
  is_active     = excluded.is_active,
  updated_at    = now();

commit;
