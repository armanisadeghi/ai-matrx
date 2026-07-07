-- content_ir: activate the gold-mine kind families that PASS the real dual gate.
-- Applied 2026-07-07 via scripts/shape/activate-kinds.ts --apply (Supabase JS,
-- SUPABASE_SECRET_KEY) — this file DOCUMENTS + reproduces that activation
-- idempotently. Ledgered in public._schema_migrations (source 'matrx-frontend').
--
-- Provenance — the dual gate (features/content-ir/registry/kind-dual-gate.ts,
-- SHAPE_SYSTEM.md R6). Each kind's live canonical content_ir.kind_example.data
-- was run through BOTH legs, fully in-process (no browser, no faking):
--   * structural — ajv over the live emitted_json_schema (__kind stripped); the
--     leg Python's Pydantic co-owns against the same schema + sample.
--   * render — the legacy bridge toLegacyServerData must derive real, non-empty
--     serverData from the sample (a pure function; validateRender never mounts a
--     React component, so this IS a true in-process render-leg check here, not a
--     deferred "structural-only + test-attested" fallback).
--
-- Result (31 gold-mine kinds evaluated):
--   ACTIVATED — 10 root kinds, both legs pass, each carries legacyBlockType +
--   toLegacyServerData: mermaid_diagram, task_list, resource_collection,
--   progress_tracker, timeline, structured_info, transcript,
--   troubleshooting_guide, cooking_recipe, research_report.
--
--   NOT ACTIVATED, structural PASS but render FAIL (no standalone renderer —
--   these render only nested inside their root; identical precedent to
--   flashcard_set's children, which are also inactive): task_item,
--   resource_category, resource_item, recipe_ingredient, recipe_step.
--
--   NOT ACTIVATED, no canonical example to gate (16): progress_phase,
--   progress_step, timeline_period, timeline_event, structured_info_section,
--   structured_info_item, transcript_segment, troubleshooting_issue,
--   troubleshooting_solution, troubleshooting_step, troubleshooting_link,
--   research_section, research_finding, research_theme, research_challenge,
--   research_recommendation.
--
-- Idempotent: re-applying only flips still-inactive passers; failers/no-example
-- kinds are NEVER touched by this migration.

update content_ir.kind_definition
set is_active = true
where deleted_at is null
  and is_active is not true
  and kind = any(array[
    'mermaid_diagram',
    'task_list',
    'resource_collection',
    'progress_tracker',
    'timeline',
    'structured_info',
    'transcript',
    'troubleshooting_guide',
    'cooking_recipe',
    'research_report'
  ]);
