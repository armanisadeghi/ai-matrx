-- content_ir_research_evidence_kind_routes.sql
--
-- KINDS EVERYWHERE, army mission "FE kind component routes" (copy-B batch 2).
-- Ledger: docs/KIND_COMPONENT_LEDGER.md.
--
-- The research/evidence cluster — the child kinds of `video_transcript_research`
-- plus the two research auto-tagger outputs — had schemas but NO
-- (kind, platform='web', role='output') row, so each reached a reader only by
-- SILENT fallback (`by:'generic', unverified:true, reason:'no-component'`):
--
--   claim_evidence · entity_mention · evidence_source · notable_timestamp
--   topic_relevance · transcript_usage
--   research_cross_cutting_tags · research_tag_suggestions
--
-- NESTING (content_ir.kind_edge, verified live 2026-08-20): video_transcript_research
-- → claims=claim_evidence, entities=entity_mention, notableTimestamps=notable_timestamp,
-- topics=topic_relevance, usage=transcript_usage; and claim_evidence →
-- supportingEvidence/contrastingEvidence = evidence_source. Nested instances render by
-- RECURSION through the registry, so each child needs its own registered route to be
-- rendered honestly on its own — which is exactly what this adds.
--
-- ROUTE DECISION — the explicit basic route. Searched first: all 83 registered
-- web/output rows, `features/content-ir/kinds/*`, and a repo-wide grep per slug.
-- The parent `video_transcript_research` has a source='db' user component
-- (`transcript_research_report`) that renders the WHOLE parent; there is no
-- standalone component for any child and NO bespoke display of any of the eight
-- anywhere in the repo, so nothing legacy is retired here. Building eight
-- renderers for research fragments would be the defect; each gets the platform
-- floor REGISTERED, so the resolver answers `by:'db'` instead of falling back.
--
-- CANONICAL EXAMPLES (R4): five are authored below. They were validated FOR REAL
-- before this file was written — the production structural leg
-- (`validateStructuralLeg`, features/content-ir/registry/kind-dual-gate.ts) was run
-- against each kind's LIVE `emitted_json_schema`, and a negative control (missing
-- required / extra key under additionalProperties:false / below minimum / above
-- maximum / wrong type) was confirmed to FAIL. Hence validation_status='passed'.
-- `research_cross_cutting_tags` and `research_tag_suggestions` already had passing
-- canonical examples and are left untouched.
--
-- claim_evidence gets its ROUTE here but NO example: its `emitted_json_schema`
-- references `#/$defs/EvidenceSource` while carrying no `$defs`, so the schema
-- cannot compile at all ("can't resolve reference #/$defs/EvidenceSource from id #")
-- and no example can be validated against it. That is a producer-side defect in the
-- emitted schema (4 more active kinds share it: plan_page_draft, plan_page_outline,
-- plan_page_research, plan_page_review) — see FOUND_DEFECTS.md. Fixing it means
-- REGENERATING the schema from its pydantic source, never hand-editing the registry
-- row, so it is out of this repo's reach and the ledger row stays `blocked` on the
-- example while the route itself lands.
--
-- Does NOT touch kind_definition.is_active and does NOT touch metadata.maturity.
-- Idempotent, data-only (no DDL). Safe to re-apply.

begin;

-- ── 1. Canonical examples (R4) ──────────────────────────────────────────────
with sample(kind, label, description, data) as (
  values
    (
      'evidence_source',
      'Systematic review supporting a claim (canonical)',
      'The minimal evidence citation: a summary in plain language plus the titled source it came from.',
      $json${
        "summary": "A 2024 systematic review found no consistent link between the two, across 31 trials.",
        "sourceTitle": "Systematic review of 31 randomized trials (2024)",
        "sourceUrl": "https://example.org/reviews/2024-systematic-review"
      }$json$::jsonb
    ),
    (
      'entity_mention',
      'Organization cited in a transcript (canonical)',
      'An entity the transcript names, with the role it plays in the argument and every surface form it was called by.',
      $json${
        "name": "World Health Organization",
        "entityType": "organization",
        "role": "Cited as the source of the 2023 guideline the speaker relies on.",
        "mentions": ["the WHO", "World Health Organization", "the agency"]
      }$json$::jsonb
    ),
    (
      'notable_timestamp',
      'Key-claim marker in a video (canonical)',
      'A single point of interest in a recording — both the human timecode and the machine offset.',
      $json${
        "timecode": "00:12:45",
        "seconds": 765,
        "label": "Speaker states the central claim for the first time",
        "type": "key_claim"
      }$json$::jsonb
    ),
    (
      'topic_relevance',
      'Scored topic with its rationale (canonical)',
      'A topic the source covers, scored 0-1, with the reason the score is what it is.',
      $json${
        "topic": "Regulatory approval process",
        "relevanceScore": 0.82,
        "rationale": "Roughly a third of the transcript walks through the approval timeline in detail."
      }$json$::jsonb
    ),
    (
      'transcript_usage',
      'Transcript run accounting (canonical)',
      'What produced a transcript analysis: the model, the recording length, timestamp precision, and token spend.',
      $json${
        "model": "gemini-2.5-pro",
        "videoDuration": "00:41:18",
        "timestampPrecision": "second",
        "inputTokens": 184320,
        "outputTokens": 6144,
        "totalTokens": 190464,
        "notes": "Timestamps taken from the provider transcript; no re-alignment was needed."
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

-- ── 2. Resolver rows (R1): (kind, web, output) -> generic_structured ────────
insert into content_ir.kind_component (
  kind_definition_id, platform, role, component_key,
  source, config, is_default, is_active, sort_order, organization_id, metadata
)
select
  kd.id, 'web', 'output', 'generic_structured',
  'bundled', '{}'::jsonb, true, true, 100, kd.organization_id,
  jsonb_build_object(
    'note',
    'Explicit basic route (army: FE kind component routes, copy-B, 2026-08-20): registered so this kind never reaches the reader by silent fallback. Not a bespoke renderer and not a maturity promotion.'
  )
from content_ir.kind_definition kd
where kd.deleted_at is null
  and kd.kind in (
    'claim_evidence',
    'entity_mention',
    'evidence_source',
    'notable_timestamp',
    'topic_relevance',
    'transcript_usage',
    'research_cross_cutting_tags',
    'research_tag_suggestions'
  )
on conflict (kind_definition_id, platform, role)
  where (is_default and deleted_at is null)
do update set
  component_key = excluded.component_key,
  source        = excluded.source,
  config        = excluded.config,
  is_active     = excluded.is_active,
  metadata      = excluded.metadata,
  updated_at    = now();

commit;
