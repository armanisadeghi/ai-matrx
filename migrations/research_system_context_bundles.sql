-- SYSTEM CONTEXT BUNDLES — the shipped input recipes for the research outputs.
--
-- Each row answers "what should this kind of output actually read?" once, as
-- data. That is the whole reason the resource catalog exists: a new
-- domain-specific output is an agent row plus a bundle row, NOT new code. These
-- six are the first proof — brand profile, reputation (business and personal),
-- gap analysis, literature review, competitive landscape — and they differ only
-- in which resources they select and how they order and cap them.
--
-- Why the differences matter:
--   * Brand profile orders pages by AUTHORITY and caps them: a profile wants the
--     most trustworthy pages about the entity, not the most numerous.
--   * Gap analysis leads with the INVENTORY — the counts and coverage are the
--     evidence of what is missing; no other output cares about them first.
--   * Literature review takes the most pages of all and always carries the
--     authority/scoring tables, because weighting evidence is its job.
--   * Reputation reviews deliberately do NOT filter to curation-kept sources:
--     a source excluded from the report may be exactly the critical coverage a
--     reputation assessment must see.
--
-- entity_id IS NULL = template, applies to any topic. is_system = read-only in
-- the UI; a user who wants a variant saves their own copy.
--
-- Idempotent: keyed on `slug`, ON CONFLICT updates the recipe in place so
-- re-applying ships an improved selection rather than a duplicate row.

INSERT INTO research.rs_context_bundle
  (slug, name, description, entity_type, entity_id, is_system, visibility,
   organization_id, agent_id, selectors, bindings, budget)
VALUES
-- ── Brand profile ─────────────────────────────────────────────────────────
(
  'research-brand-profile',
  'Brand profile inputs',
  'The brand or organization plus its key people: authority-ranked pages, the full search footprint, analyses, syntheses and media.',
  'research_topic', NULL, true, 'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '90d1865f-a532-4c09-ab88-d88014b2e9f8',
  '[
    {"kind":"topic.brief","mode":"all"},
    {"kind":"topic.inventory","mode":"all"},
    {"kind":"search.result","mode":"filtered","filter":{"includedOnly":true},"order":"importance"},
    {"kind":"page.content","mode":"filtered","filter":{"includedOnly":true,"goodScrapeOnly":true,"topN":25},"order":"authority"},
    {"kind":"page.analysis","mode":"filtered","filter":{"includedOnly":true,"currentOnly":true,"successOnly":true},"order":"importance"},
    {"kind":"synthesis.keyword","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"recent"},
    {"kind":"source.authority","mode":"all"},
    {"kind":"source.importance","mode":"all"},
    {"kind":"media.items","mode":"filtered","filter":{"topN":40},"order":"importance"}
  ]'::jsonb,
  '[
    {"variable":"research_brief","kinds":["topic.brief"]},
    {"variable":"research_inventory","kinds":["topic.inventory"]},
    {"variable":"search_results","kinds":["search.result"]},
    {"variable":"scraped_pages","kinds":["page.content"]},
    {"variable":"page_analyses","kinds":["page.analysis"]},
    {"variable":"keyword_syntheses","kinds":["synthesis.keyword"]},
    {"variable":"source_quality","kinds":["source.authority","source.importance"]},
    {"variable":"media_inventory","kinds":["media.items"]}
  ]'::jsonb,
  '{"maxTokens": 200000}'::jsonb
),

-- ── Gap analysis ──────────────────────────────────────────────────────────
(
  'research-gap-analysis',
  'Gap analysis inputs',
  'Inventory and coverage first, then the conclusions to audit — what is missing is the deliverable.',
  'research_topic', NULL, true, 'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  'ddcc51e4-bf5f-4008-82d0-17bbc557b32f',
  '[
    {"kind":"topic.brief","mode":"all"},
    {"kind":"topic.inventory","mode":"all"},
    {"kind":"synthesis.keyword","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"recent"},
    {"kind":"synthesis.topic","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"recent","limit":{"maxItems":1}},
    {"kind":"page.analysis","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"importance"},
    {"kind":"search.result","mode":"all","order":"importance"},
    {"kind":"source.authority","mode":"all"},
    {"kind":"source.importance","mode":"all"}
  ]'::jsonb,
  '[
    {"variable":"research_brief","kinds":["topic.brief"]},
    {"variable":"research_inventory","kinds":["topic.inventory"]},
    {"variable":"keyword_syntheses","kinds":["synthesis.keyword"]},
    {"variable":"research_report","kinds":["synthesis.topic"],"strategy":"first"},
    {"variable":"page_analyses","kinds":["page.analysis"]},
    {"variable":"search_results","kinds":["search.result"]},
    {"variable":"source_quality","kinds":["source.authority","source.importance"]}
  ]'::jsonb,
  '{"maxTokens": 150000}'::jsonb
),

-- ── Literature & evidence review ──────────────────────────────────────────
(
  'research-literature-review',
  'Literature review inputs',
  'The widest set of full page bodies plus every quality signal — evidence weighting needs both.',
  'research_topic', NULL, true, 'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '282a1431-f192-4427-8779-fbf40afd6dd1',
  '[
    {"kind":"topic.brief","mode":"all"},
    {"kind":"topic.inventory","mode":"all"},
    {"kind":"page.content","mode":"filtered","filter":{"includedOnly":true,"goodScrapeOnly":true,"topN":40},"order":"authority"},
    {"kind":"page.analysis","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"authority"},
    {"kind":"page.scoring","mode":"filtered","filter":{"includedOnly":true},"order":"authority"},
    {"kind":"synthesis.keyword","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"recent"},
    {"kind":"source.authority","mode":"all"},
    {"kind":"source.importance","mode":"all"}
  ]'::jsonb,
  '[
    {"variable":"research_brief","kinds":["topic.brief"]},
    {"variable":"research_inventory","kinds":["topic.inventory"]},
    {"variable":"scraped_pages","kinds":["page.content"]},
    {"variable":"page_analyses","kinds":["page.analysis"]},
    {"variable":"page_scoring","kinds":["page.scoring"]},
    {"variable":"keyword_syntheses","kinds":["synthesis.keyword"]},
    {"variable":"source_quality","kinds":["source.authority","source.importance"]}
  ]'::jsonb,
  '{"maxTokens": 250000}'::jsonb
),

-- ── Competitive landscape ─────────────────────────────────────────────────
(
  'research-competitive-landscape',
  'Competitive landscape inputs',
  'Per-competitor material: the full search footprint, pages, and the human tag grouping that usually already separates the players.',
  'research_topic', NULL, true, 'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '078feda2-a535-4142-bc82-19f885ef6f4a',
  '[
    {"kind":"topic.brief","mode":"all"},
    {"kind":"search.result","mode":"filtered","filter":{"includedOnly":true},"order":"importance"},
    {"kind":"page.content","mode":"filtered","filter":{"includedOnly":true,"goodScrapeOnly":true,"topN":30},"order":"importance"},
    {"kind":"page.analysis","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"importance"},
    {"kind":"tag.map","mode":"all"},
    {"kind":"synthesis.keyword","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"recent"},
    {"kind":"source.authority","mode":"all"},
    {"kind":"source.importance","mode":"all"}
  ]'::jsonb,
  '[
    {"variable":"research_brief","kinds":["topic.brief"]},
    {"variable":"search_results","kinds":["search.result"]},
    {"variable":"scraped_pages","kinds":["page.content"]},
    {"variable":"page_analyses","kinds":["page.analysis"]},
    {"variable":"tag_map","kinds":["tag.map"]},
    {"variable":"keyword_syntheses","kinds":["synthesis.keyword"]},
    {"variable":"source_quality","kinds":["source.authority","source.importance"]}
  ]'::jsonb,
  '{"maxTokens": 200000}'::jsonb
),

-- ── Reputation review (business) ──────────────────────────────────────────
-- NOTE: no `includedOnly` anywhere. A source excluded during curation may be
-- exactly the critical coverage a reputation assessment exists to surface.
(
  'research-reputation-business',
  'Reputation review inputs (business)',
  'Everything found about a business, including sources excluded from the report — critical coverage is the point here.',
  'research_topic', NULL, true, 'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '75dcbb31-d39c-4b58-a5f6-ec48ad092a7f',
  '[
    {"kind":"topic.brief","mode":"all"},
    {"kind":"topic.inventory","mode":"all"},
    {"kind":"search.result","mode":"all","order":"rank"},
    {"kind":"page.content","mode":"filtered","filter":{"goodScrapeOnly":true,"topN":30},"order":"rank"},
    {"kind":"page.analysis","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"importance"},
    {"kind":"synthesis.keyword","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"recent"},
    {"kind":"source.authority","mode":"all"},
    {"kind":"source.importance","mode":"all"}
  ]'::jsonb,
  '[
    {"variable":"research_brief","kinds":["topic.brief"]},
    {"variable":"research_inventory","kinds":["topic.inventory"]},
    {"variable":"search_results","kinds":["search.result"]},
    {"variable":"scraped_pages","kinds":["page.content"]},
    {"variable":"page_analyses","kinds":["page.analysis"]},
    {"variable":"keyword_syntheses","kinds":["synthesis.keyword"]},
    {"variable":"source_quality","kinds":["source.authority","source.importance"]}
  ]'::jsonb,
  '{"maxTokens": 200000}'::jsonb
),

-- ── Reputation review (personal) ──────────────────────────────────────────
(
  'research-reputation-personal',
  'Reputation review inputs (personal)',
  'Everything found about an individual''s public professional record, including sources excluded from the report.',
  'research_topic', NULL, true, 'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  'c3b7b2e8-9b40-46e8-b77a-8293f51f019a',
  '[
    {"kind":"topic.brief","mode":"all"},
    {"kind":"topic.inventory","mode":"all"},
    {"kind":"search.result","mode":"all","order":"rank"},
    {"kind":"page.content","mode":"filtered","filter":{"goodScrapeOnly":true,"topN":30},"order":"rank"},
    {"kind":"page.analysis","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"importance"},
    {"kind":"synthesis.keyword","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"recent"},
    {"kind":"source.authority","mode":"all"},
    {"kind":"source.importance","mode":"all"}
  ]'::jsonb,
  '[
    {"variable":"research_brief","kinds":["topic.brief"]},
    {"variable":"research_inventory","kinds":["topic.inventory"]},
    {"variable":"search_results","kinds":["search.result"]},
    {"variable":"scraped_pages","kinds":["page.content"]},
    {"variable":"page_analyses","kinds":["page.analysis"]},
    {"variable":"keyword_syntheses","kinds":["synthesis.keyword"]},
    {"variable":"source_quality","kinds":["source.authority","source.importance"]}
  ]'::jsonb,
  '{"maxTokens": 200000}'::jsonb
),

-- ── The four generic publishing outputs ───────────────────────────────────
-- These reproduce EXACTLY what Outputs Studio sent before bundles existed: the
-- assembled document if there is one, else the current topic report, and
-- nothing else. Shipped as data so the generic path and the domain-specific
-- path are the same mechanism — and so the no-regression claim is checkable.
(
  'research-report-only',
  'Report only',
  'Just the finished report (assembled document, or the current topic report). The default input for podcast, blog, slides and SEO.',
  'research_topic', NULL, true, 'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  NULL,
  '[
    {"kind":"document.report","mode":"filtered","filter":{"currentOnly":true},"order":"recent","limit":{"maxItems":1}},
    {"kind":"synthesis.topic","mode":"filtered","filter":{"currentOnly":true,"successOnly":true},"order":"recent","limit":{"maxItems":1}}
  ]'::jsonb,
  '[
    {"variable":"research_report","kinds":["document.report","synthesis.topic"],"strategy":"first"}
  ]'::jsonb,
  NULL
)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  agent_id    = EXCLUDED.agent_id,
  selectors   = EXCLUDED.selectors,
  bindings    = EXCLUDED.bindings,
  budget      = EXCLUDED.budget,
  is_system   = true,
  visibility  = EXCLUDED.visibility;
