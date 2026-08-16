-- ============================================================================
-- content-ir kinds for the Website Factory per-page pipeline — FULL package.
--
-- Five step kinds, each already written to plan.node_artifact by aidream (the
-- ONE writer), plus the five nested child kinds they compose:
--
--   plan_page_research  (p2_research, Deepen)      + plan_research_source
--   plan_page_outline   (p3_family)                + plan_deferred_topic,
--                                                    plan_planned_link
--   plan_page_draft     (p4_write)                 + plan_draft_section
--   plan_page_review    (p5_review)                + plan_review_issue
--   cms_page_build      (p6_build, CMS fill)
--
-- WHY: every one of these was rendering as a JSON dump on the page step rail
-- (features/marketing/content-plan/components/NodeStepRail.tsx). Our user is a
-- non-technical subject-matter expert; a JSON dump is not an answer for them.
--
-- plan_page_review.revised IS a plan_page_draft and is declared as one, so the
-- review's component composes the DRAFT's component parts — one shape, one
-- component, per THE CANONICAL COMPONENT LAW.
--
-- Rows applied here:
--   * content_ir.kind_definition — all ten. data / emitted_block_schema /
--     emitted_json_schema / emitted_fingerprint are CONVERTER-EMITTED from
--     features/content-ir/kinds/{plan-page-*,cms-page-build}.ts — never
--     hand-written. authoring_owner 'ts', platform org, visibility public,
--     is_active FALSE until the dual gate flips it.
--   * content_ir.kind_edge — every parent→child field edge.
--   * content_ir.kind_example — one canonical example per kind (+ a minimal
--     second for the roots). validation_status is deliberately NOT written:
--     the kind_example recompute trigger DERIVES it on every write.
--   * NO kind_surface rows — `__kind` JSON is the only arrival form.
--   * content_ir.kind_component — web/output for the five ROOT kinds only.
--     The five children are nested-only (they render inside their parent), so
--     they stay inactive with no component. That is correct, not a gap — the
--     same shape media_chapter has.
--
-- Idempotent on business keys; re-apply is safe. is_active on existing
-- kind_definition rows is deliberately NOT touched on re-apply.
-- ============================================================================

BEGIN;

-- ── 1. kind_definition: children first (root edges resolve to them) ────────

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, sample_data,
   emitted_block_schema, emitted_json_schema, emitted_fingerprint,
   is_active, organization_id, visibility)
VALUES
  (
    'plan_research_source',
    'Page Research Source',
    'ts',
    $J$[{"name":"label","required":true,"description":"How to refer to this source in prose.","type":"string"},{"name":"source_type","nullable":true,"description":"What kind of source this is.","type":"enum","values":["study","government","industry-report","news","dataset","book","video","internal"],"open":true},{"name":"url","nullable":true,"description":"Where it lives. Citations are receipts — a URL is present only when the source genuinely exists.","type":"string"},{"name":"notes","nullable":true,"description":"What this source supports on this page.","type":"string"}]$J$::jsonb,
    $J${"__kind":"plan_research_source","label":"Hip strengthening compared with knee exercises for patellofemoral pain","source_type":"study","url":"https://example.org/journals/pfps-hip-vs-knee","notes":"Supports the claim that proximal strengthening outperforms isolated quad work."}$J$::jsonb,
    $J${"name":"plan_research_source","schema":{"type":"object","properties":{"label":{"type":"string","description":"How to refer to this source in prose."},"source_type":{"anyOf":[{"type":"string","enum":["study","government","industry-report","news","dataset","book","video","internal"]},{"type":"string"},{"type":"null"}],"description":"What kind of source this is."},"url":{"type":["string","null"],"description":"Where it lives. Citations are receipts — a URL is present only when the source genuinely exists."},"notes":{"type":["string","null"],"description":"What this source supports on this page."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_research_source"}},"required":["__kind","label"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    $J${"name":"plan_research_source","schema":{"type":"object","properties":{"label":{"type":"string","description":"How to refer to this source in prose."},"source_type":{"anyOf":[{"type":"string","enum":["study","government","industry-report","news","dataset","book","video","internal"]},{"type":"string"},{"type":"null"}],"description":"What kind of source this is."},"url":{"type":["string","null"],"description":"Where it lives. Citations are receipts — a URL is present only when the source genuinely exists."},"notes":{"type":["string","null"],"description":"What this source supports on this page."}},"required":["label"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    'mg-1f0log7yhkynp',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'plan_deferred_topic',
    'Deferred Topic',
    'ts',
    $J$[{"name":"topic","required":true,"description":"The topic this page deliberately does not cover.","type":"string"},{"name":"to_route","description":"The sibling page that owns it. Empty when no page owns it yet — a real gap.","type":"string"}]$J$::jsonb,
    $J${"__kind":"plan_deferred_topic","topic":"Fees and insurance coverage","to_route":"/fees"}$J$::jsonb,
    $J${"name":"plan_deferred_topic","schema":{"type":"object","properties":{"topic":{"type":"string","description":"The topic this page deliberately does not cover."},"to_route":{"type":"string","description":"The sibling page that owns it. Empty when no page owns it yet — a real gap."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_deferred_topic"}},"required":["__kind","topic"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    $J${"name":"plan_deferred_topic","schema":{"type":"object","properties":{"topic":{"type":"string","description":"The topic this page deliberately does not cover."},"to_route":{"type":"string","description":"The sibling page that owns it. Empty when no page owns it yet — a real gap."}},"required":["topic"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    'dj-dfk3rjy0e7vt',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'plan_planned_link',
    'Planned Internal Link',
    'ts',
    $J$[{"name":"to_route","required":true,"description":"The route this page should link to.","type":"string"},{"name":"anchor_text","required":true,"description":"The words the link should be wrapped around.","type":"string"},{"name":"reason","description":"Why this link belongs on this page.","type":"string"}]$J$::jsonb,
    $J${"__kind":"plan_planned_link","to_route":"/services/running-assessment","anchor_text":"running assessment","reason":"The natural next step for a reader who recognizes their symptoms here."}$J$::jsonb,
    $J${"name":"plan_planned_link","schema":{"type":"object","properties":{"to_route":{"type":"string","description":"The route this page should link to."},"anchor_text":{"type":"string","description":"The words the link should be wrapped around."},"reason":{"type":"string","description":"Why this link belongs on this page."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_planned_link"}},"required":["__kind","to_route","anchor_text"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    $J${"name":"plan_planned_link","schema":{"type":"object","properties":{"to_route":{"type":"string","description":"The route this page should link to."},"anchor_text":{"type":"string","description":"The words the link should be wrapped around."},"reason":{"type":"string","description":"Why this link belongs on this page."}},"required":["to_route","anchor_text"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    'f1-19zxcva1y5iqho',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'plan_draft_section',
    'Page Draft Section',
    'ts',
    $J$[{"name":"heading","required":true,"description":"The section's heading, as it appears on the page.","type":"string"},{"name":"level","description":"Heading level — 2 or 3. The page's h1 is the draft's own `h1` field, never a section.","default":2,"type":"number"},{"name":"intent","description":"What this section is FOR, in the writer's own words. Survives editing, and is what a re-render or a human editor reads to stay on-intent.","type":"string"},{"name":"body","description":"The section's prose. Plain text — never HTML; the builder renders it.","type":"string"},{"name":"bullets","description":"Bulleted points belonging to this section, in order.","type":"string[]"}]$J$::jsonb,
    $J${"__kind":"plan_draft_section","heading":"How we assess it","level":2,"intent":"Show the reader what the first appointment involves, which is the single most common pre-booking question.","body":"The first visit looks above and below the knee before it looks at the knee. We watch you walk, run if you can, and step down from a box.","bullets":["Hip strength and control, single-leg","Ankle mobility and foot loading","Running cadence and stride, when running is the aggravating activity"]}$J$::jsonb,
    $J${"name":"plan_draft_section","schema":{"type":"object","properties":{"heading":{"type":"string","description":"The section's heading, as it appears on the page."},"level":{"type":"number","description":"Heading level — 2 or 3. The page's h1 is the draft's own `h1` field, never a section.","default":2},"intent":{"type":"string","description":"What this section is FOR, in the writer's own words. Survives editing, and is what a re-render or a human editor reads to stay on-intent."},"body":{"type":"string","description":"The section's prose. Plain text — never HTML; the builder renders it."},"bullets":{"type":"array","items":{"type":"string"},"description":"Bulleted points belonging to this section, in order."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_draft_section"}},"required":["__kind","heading"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    $J${"name":"plan_draft_section","schema":{"type":"object","properties":{"heading":{"type":"string","description":"The section's heading, as it appears on the page."},"level":{"type":"number","description":"Heading level — 2 or 3. The page's h1 is the draft's own `h1` field, never a section.","default":2},"intent":{"type":"string","description":"What this section is FOR, in the writer's own words. Survives editing, and is what a re-render or a human editor reads to stay on-intent."},"body":{"type":"string","description":"The section's prose. Plain text — never HTML; the builder renders it."},"bullets":{"type":"array","items":{"type":"string"},"description":"Bulleted points belonging to this section, in order."}},"required":["heading"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    'pn-1cuqx4v1ane8b9',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'plan_review_issue',
    'Page Review Issue',
    'ts',
    $J$[{"name":"severity","description":"How badly this hurts the page — blocker (must not publish), important, or minor.","default":"minor","type":"enum","values":["blocker","important","minor"]},{"name":"section","description":"The section heading this applies to. Empty means it applies to the whole page.","type":"string"},{"name":"problem","required":true,"description":"What is wrong, stated plainly.","type":"string"},{"name":"fix","description":"What to do about it.","type":"string"}]$J$::jsonb,
    $J${"__kind":"plan_review_issue","severity":"blocker","section":"What runner's knee actually is","problem":"The draft claimed \"runner's knee affects 71% of all runners\". No source in the research supports that figure, and the cited survey reports a far lower range.","fix":"Remove the statistic. State that it is one of the most common running complaints, which the survey does support."}$J$::jsonb,
    $J${"name":"plan_review_issue","schema":{"type":"object","properties":{"severity":{"type":"string","enum":["blocker","important","minor"],"description":"How badly this hurts the page — blocker (must not publish), important, or minor.","default":"minor"},"section":{"type":"string","description":"The section heading this applies to. Empty means it applies to the whole page."},"problem":{"type":"string","description":"What is wrong, stated plainly."},"fix":{"type":"string","description":"What to do about it."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_review_issue"}},"required":["__kind","problem"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    $J${"name":"plan_review_issue","schema":{"type":"object","properties":{"severity":{"type":"string","enum":["blocker","important","minor"],"description":"How badly this hurts the page — blocker (must not publish), important, or minor.","default":"minor"},"section":{"type":"string","description":"The section heading this applies to. Empty means it applies to the whole page."},"problem":{"type":"string","description":"What is wrong, stated plainly."},"fix":{"type":"string","description":"What to do about it."}},"required":["problem"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    'jv-7yqmq41y7uxqm',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'plan_page_research',
    'Page Research',
    'ts',
    $J$[{"name":"brief","description":"The research distilled into instructions for the writer, one per line, in the order to follow them.","type":"string[]"},{"name":"sources","description":"The citable references this page's claims rest on.","type":"array"},{"name":"primary_keyword","nullable":true,"description":"The phrase this page is written to win.","type":"string"},{"name":"research_report","nullable":true,"description":"A POINTER to the grounding document (topic, version, size) — never the document body itself.","type":"string"}]$J$::jsonb,
    $J${"__kind":"plan_page_research","brief":["Lead with the fact that patellofemoral pain is a loading problem, not joint degeneration — this is the misconception that brings most readers to the page.","Name hip abductor weakness and ankle dorsiflexion restriction as the two most common upstream causes.","Give a realistic recovery window of six to ten weeks; do not promise a fixed number of sessions.","Do not recommend specific exercises by name — the assessment decides them, and a generic list invites self-treatment."],"sources":[{"label":"Hip strengthening compared with knee exercises for patellofemoral pain","source_type":"study","url":"https://example.org/journals/pfps-hip-vs-knee","notes":"Supports the claim that proximal strengthening outperforms isolated quad work."},{"label":"National clinical guideline on patellofemoral pain","source_type":"government","url":"https://example.gov/guidelines/patellofemoral-pain","notes":"Basis for the six-to-ten week recovery window."},{"label":"Running injury incidence survey, 2025","source_type":"industry-report","url":"https://example.org/reports/running-injury-2025","notes":"Prevalence figure used in the introduction."},{"label":"Clinic intake notes on common patient questions","source_type":"internal","url":null,"notes":"Why the assessment section leads — it is the most asked pre-booking question. No public URL; an internal source is still a source."}],"primary_keyword":"physical therapy for runner's knee","research_report":"research_topic:0d0f9a2c v3 (48210 chars, 12 sources)"}$J$::jsonb,
    $J${"name":"plan_page_research","schema":{"type":"object","properties":{"brief":{"type":"array","items":{"type":"string"},"description":"The research distilled into instructions for the writer, one per line, in the order to follow them."},"sources":{"type":"array","items":{"$ref":"#/$defs/plan_research_source"},"description":"The citable references this page's claims rest on."},"primary_keyword":{"type":["string","null"],"description":"The phrase this page is written to win."},"research_report":{"type":["string","null"],"description":"A POINTER to the grounding document (topic, version, size) — never the document body itself."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_page_research"}},"required":["__kind"],"additionalProperties":false,"$defs":{"plan_research_source":{"type":"object","properties":{"label":{"type":"string","description":"How to refer to this source in prose."},"source_type":{"anyOf":[{"type":"string","enum":["study","government","industry-report","news","dataset","book","video","internal"]},{"type":"string"},{"type":"null"}],"description":"What kind of source this is."},"url":{"type":["string","null"],"description":"Where it lives. Citations are receipts — a URL is present only when the source genuinely exists."},"notes":{"type":["string","null"],"description":"What this source supports on this page."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_research_source"}},"required":["__kind","label"],"additionalProperties":false}}},"strict":true,"unresolved":[]}$J$::jsonb,
    $J${"name":"plan_page_research","schema":{"type":"object","properties":{"brief":{"type":"array","items":{"type":"string"},"description":"The research distilled into instructions for the writer, one per line, in the order to follow them."},"sources":{"type":"array","items":{"$ref":"#/$defs/plan_research_source"},"description":"The citable references this page's claims rest on."},"primary_keyword":{"type":["string","null"],"description":"The phrase this page is written to win."},"research_report":{"type":["string","null"],"description":"A POINTER to the grounding document (topic, version, size) — never the document body itself."}},"required":[],"additionalProperties":false,"$defs":{"plan_research_source":{"type":"object","properties":{"label":{"type":"string","description":"How to refer to this source in prose."},"source_type":{"anyOf":[{"type":"string","enum":["study","government","industry-report","news","dataset","book","video","internal"]},{"type":"string"},{"type":"null"}],"description":"What kind of source this is."},"url":{"type":["string","null"],"description":"Where it lives. Citations are receipts — a URL is present only when the source genuinely exists."},"notes":{"type":["string","null"],"description":"What this source supports on this page."}},"required":["label"],"additionalProperties":false}}},"strict":true,"unresolved":[]}$J$::jsonb,
    '18g-1kqwfbr1rzane1',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'plan_page_outline',
    'Page Placement',
    'ts',
    $J$[{"name":"differentiator","required":true,"description":"One sentence: why this page exists and its siblings do not cover it.","type":"string"},{"name":"covers","description":"What this page owns — the subjects it is responsible for.","type":"string[]"},{"name":"must_not_cover","description":"Subjects belonging to a sibling page — covering them here cannibalizes it.","type":"string[]"},{"name":"defer_to","description":"Topics handed to a named sibling page.","type":"array"},{"name":"internal_links","description":"Links this page should carry, with their anchor text.","type":"array"},{"name":"uncovered_gaps","description":"Topics the family plans that NO page owns — real planning gaps, surfaced rather than absorbed.","type":"string[]"}]$J$::jsonb,
    $J${"__kind":"plan_page_outline","differentiator":"This is the only page that explains what runner's knee is and how it is assessed; every sibling page is either a different condition or a different service.","covers":["What patellofemoral pain is, in plain language","The upstream causes at the hip and foot","What the first assessment involves","Realistic recovery timelines for returning to running"],"must_not_cover":["General pricing and insurance questions","The clinic's staff credentials and philosophy","Post-surgical knee rehabilitation, which is a different pathway entirely"],"defer_to":[{"topic":"Fees and insurance coverage","to_route":"/fees"},{"topic":"Our therapists","to_route":"/about/team"},{"topic":"Return-to-sport testing protocols","to_route":""}],"internal_links":[{"to_route":"/services/running-assessment","anchor_text":"running assessment","reason":"The natural next step for a reader who recognizes their symptoms here."},{"to_route":"/fees","anchor_text":"what an assessment costs","reason":"Answers the question this page deliberately does not, without breaking the boundary."}],"uncovered_gaps":["Return-to-sport testing protocols — the plan wants this subject and no page has claimed it."]}$J$::jsonb,
    $J${"name":"plan_page_outline","schema":{"type":"object","properties":{"differentiator":{"type":"string","description":"One sentence: why this page exists and its siblings do not cover it."},"covers":{"type":"array","items":{"type":"string"},"description":"What this page owns — the subjects it is responsible for."},"must_not_cover":{"type":"array","items":{"type":"string"},"description":"Subjects belonging to a sibling page — covering them here cannibalizes it."},"defer_to":{"type":"array","items":{"$ref":"#/$defs/plan_deferred_topic"},"description":"Topics handed to a named sibling page."},"internal_links":{"type":"array","items":{"$ref":"#/$defs/plan_planned_link"},"description":"Links this page should carry, with their anchor text."},"uncovered_gaps":{"type":"array","items":{"type":"string"},"description":"Topics the family plans that NO page owns — real planning gaps, surfaced rather than absorbed."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_page_outline"}},"required":["__kind","differentiator"],"additionalProperties":false,"$defs":{"plan_deferred_topic":{"type":"object","properties":{"topic":{"type":"string","description":"The topic this page deliberately does not cover."},"to_route":{"type":"string","description":"The sibling page that owns it. Empty when no page owns it yet — a real gap."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_deferred_topic"}},"required":["__kind","topic"],"additionalProperties":false},"plan_planned_link":{"type":"object","properties":{"to_route":{"type":"string","description":"The route this page should link to."},"anchor_text":{"type":"string","description":"The words the link should be wrapped around."},"reason":{"type":"string","description":"Why this link belongs on this page."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_planned_link"}},"required":["__kind","to_route","anchor_text"],"additionalProperties":false}}},"strict":true,"unresolved":[]}$J$::jsonb,
    $J${"name":"plan_page_outline","schema":{"type":"object","properties":{"differentiator":{"type":"string","description":"One sentence: why this page exists and its siblings do not cover it."},"covers":{"type":"array","items":{"type":"string"},"description":"What this page owns — the subjects it is responsible for."},"must_not_cover":{"type":"array","items":{"type":"string"},"description":"Subjects belonging to a sibling page — covering them here cannibalizes it."},"defer_to":{"type":"array","items":{"$ref":"#/$defs/plan_deferred_topic"},"description":"Topics handed to a named sibling page."},"internal_links":{"type":"array","items":{"$ref":"#/$defs/plan_planned_link"},"description":"Links this page should carry, with their anchor text."},"uncovered_gaps":{"type":"array","items":{"type":"string"},"description":"Topics the family plans that NO page owns — real planning gaps, surfaced rather than absorbed."}},"required":["differentiator"],"additionalProperties":false,"$defs":{"plan_deferred_topic":{"type":"object","properties":{"topic":{"type":"string","description":"The topic this page deliberately does not cover."},"to_route":{"type":"string","description":"The sibling page that owns it. Empty when no page owns it yet — a real gap."}},"required":["topic"],"additionalProperties":false},"plan_planned_link":{"type":"object","properties":{"to_route":{"type":"string","description":"The route this page should link to."},"anchor_text":{"type":"string","description":"The words the link should be wrapped around."},"reason":{"type":"string","description":"Why this link belongs on this page."}},"required":["to_route","anchor_text"],"additionalProperties":false}}},"strict":true,"unresolved":[]}$J$::jsonb,
    '1lj-v1yev123ie5p',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'plan_page_draft',
    'Page Draft',
    'ts',
    $J$[{"name":"h1","required":true,"description":"The page's single h1 — its headline.","type":"string"},{"name":"intro","description":"The opening paragraph, before the first section.","type":"string"},{"name":"sections","description":"The body sections, in page order.","type":"array"},{"name":"call_to_action","description":"What the page asks the reader to do next.","type":"string"},{"name":"meta_title","description":"The page's title tag, for search results.","type":"string"},{"name":"meta_description","description":"The page's meta description, for search results.","type":"string"}]$J$::jsonb,
    $J${"__kind":"plan_page_draft","h1":"Physical Therapy for Runner's Knee","intro":"Runner's knee rarely comes from the knee itself. Most cases trace back to how the hip and foot are loading, which is why a program that only stretches the quad tends to stall.","sections":[{"heading":"What runner's knee actually is","level":2,"intent":"Name the condition plainly before any advice, so a reader can tell whether this page is about their problem.","body":"Patellofemoral pain syndrome is pain around or behind the kneecap, usually worse on stairs, hills, and after sitting a long while. It is a loading problem, not a sign that the joint is wearing out.","bullets":[]},{"heading":"How we assess it","level":2,"intent":"Show the reader what the first appointment involves, which is the single most common pre-booking question.","body":"The first visit looks above and below the knee before it looks at the knee. We watch you walk, run if you can, and step down from a box.","bullets":["Hip strength and control, single-leg","Ankle mobility and foot loading","Running cadence and stride, when running is the aggravating activity"]},{"heading":"What treatment looks like","level":2,"intent":"Set an honest expectation of duration and effort so the reader is not surprised later.","body":"Most people are running again within six to ten weeks. The program is progressive strength work two to three times a week, with a gradual return-to-run plan layered on once you can load the knee without next-day pain.","bullets":[]}],"call_to_action":"Book an assessment and bring the shoes you run in most often.","meta_title":"Physical Therapy for Runner's Knee | Northside Physio","meta_description":"Runner's knee is a loading problem, not joint wear. See how our assessment finds the cause at the hip and foot, and what a six-to-ten week program looks like."}$J$::jsonb,
    $J${"name":"plan_page_draft","schema":{"type":"object","properties":{"h1":{"type":"string","description":"The page's single h1 — its headline."},"intro":{"type":"string","description":"The opening paragraph, before the first section."},"sections":{"type":"array","items":{"$ref":"#/$defs/plan_draft_section"},"description":"The body sections, in page order."},"call_to_action":{"type":"string","description":"What the page asks the reader to do next."},"meta_title":{"type":"string","description":"The page's title tag, for search results."},"meta_description":{"type":"string","description":"The page's meta description, for search results."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_page_draft"}},"required":["__kind","h1"],"additionalProperties":false,"$defs":{"plan_draft_section":{"type":"object","properties":{"heading":{"type":"string","description":"The section's heading, as it appears on the page."},"level":{"type":"number","description":"Heading level — 2 or 3. The page's h1 is the draft's own `h1` field, never a section.","default":2},"intent":{"type":"string","description":"What this section is FOR, in the writer's own words. Survives editing, and is what a re-render or a human editor reads to stay on-intent."},"body":{"type":"string","description":"The section's prose. Plain text — never HTML; the builder renders it."},"bullets":{"type":"array","items":{"type":"string"},"description":"Bulleted points belonging to this section, in order."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_draft_section"}},"required":["__kind","heading"],"additionalProperties":false}}},"strict":true,"unresolved":[]}$J$::jsonb,
    $J${"name":"plan_page_draft","schema":{"type":"object","properties":{"h1":{"type":"string","description":"The page's single h1 — its headline."},"intro":{"type":"string","description":"The opening paragraph, before the first section."},"sections":{"type":"array","items":{"$ref":"#/$defs/plan_draft_section"},"description":"The body sections, in page order."},"call_to_action":{"type":"string","description":"What the page asks the reader to do next."},"meta_title":{"type":"string","description":"The page's title tag, for search results."},"meta_description":{"type":"string","description":"The page's meta description, for search results."}},"required":["h1"],"additionalProperties":false,"$defs":{"plan_draft_section":{"type":"object","properties":{"heading":{"type":"string","description":"The section's heading, as it appears on the page."},"level":{"type":"number","description":"Heading level — 2 or 3. The page's h1 is the draft's own `h1` field, never a section.","default":2},"intent":{"type":"string","description":"What this section is FOR, in the writer's own words. Survives editing, and is what a re-render or a human editor reads to stay on-intent."},"body":{"type":"string","description":"The section's prose. Plain text — never HTML; the builder renders it."},"bullets":{"type":"array","items":{"type":"string"},"description":"Bulleted points belonging to this section, in order."}},"required":["heading"],"additionalProperties":false}}},"strict":true,"unresolved":[]}$J$::jsonb,
    '1bx-1y5fksnkkmf6t',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'plan_page_review',
    'Page Review',
    'ts',
    $J$[{"name":"verdict","description":"`approved` — the draft stands as written. `revised` — the reviewer rewrote it.","default":"revised","type":"enum","values":["approved","revised"]},{"name":"issues","description":"Everything the review found, worst first.","type":"array"},{"name":"revised","required":true,"description":"The improved draft. On an `approved` verdict this is the input draft, unchanged.","type":"object"}]$J$::jsonb,
    $J${"__kind":"plan_page_review","verdict":"revised","issues":[{"severity":"blocker","section":"What runner's knee actually is","problem":"The draft claimed \"runner's knee affects 71% of all runners\". No source in the research supports that figure, and the cited survey reports a far lower range.","fix":"Remove the statistic. State that it is one of the most common running complaints, which the survey does support."},{"severity":"important","section":"What treatment looks like","problem":"The recovery window was written as \"about four weeks\", which contradicts the six-to-ten weeks the clinical guideline in the research gives.","fix":"Use six to ten weeks, and say it depends on how the knee tolerates loading."},{"severity":"minor","section":"","problem":"The meta description ran to 189 characters and would be truncated in search results.","fix":"Shorten it to under 160 characters while keeping the loading-problem framing."}],"revised":{"__kind":"plan_page_draft","h1":"Physical Therapy for Runner's Knee","intro":"Runner's knee rarely comes from the knee itself. Most cases trace back to how the hip and foot are loading, which is why a program that only stretches the quad tends to stall.","sections":[{"heading":"What runner's knee actually is","level":2,"intent":"Name the condition plainly before any advice, so a reader can tell whether this page is about their problem.","body":"Patellofemoral pain syndrome is pain around or behind the kneecap, usually worse on stairs, hills, and after sitting a long while. It is a loading problem, not a sign that the joint is wearing out.","bullets":[]},{"heading":"How we assess it","level":2,"intent":"Show the reader what the first appointment involves, which is the single most common pre-booking question.","body":"The first visit looks above and below the knee before it looks at the knee. We watch you walk, run if you can, and step down from a box.","bullets":["Hip strength and control, single-leg","Ankle mobility and foot loading","Running cadence and stride, when running is the aggravating activity"]},{"heading":"What treatment looks like","level":2,"intent":"Set an honest expectation of duration and effort so the reader is not surprised later.","body":"Most people are running again within six to ten weeks. The program is progressive strength work two to three times a week, with a gradual return-to-run plan layered on once you can load the knee without next-day pain.","bullets":[]}],"call_to_action":"Book an assessment and bring the shoes you run in most often.","meta_title":"Physical Therapy for Runner's Knee | Northside Physio","meta_description":"Runner's knee is a loading problem, not joint wear. See how our assessment finds the cause at the hip and foot, and what a six-to-ten week program looks like."}}$J$::jsonb,
    $J${"name":"plan_page_review","schema":{"type":"object","properties":{"verdict":{"type":"string","enum":["approved","revised"],"description":"`approved` — the draft stands as written. `revised` — the reviewer rewrote it.","default":"revised"},"issues":{"type":"array","items":{"$ref":"#/$defs/plan_review_issue"},"description":"Everything the review found, worst first."},"revised":{"$ref":"#/$defs/plan_page_draft","description":"The improved draft. On an `approved` verdict this is the input draft, unchanged."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_page_review"}},"required":["__kind","revised"],"additionalProperties":false,"$defs":{"plan_review_issue":{"type":"object","properties":{"severity":{"type":"string","enum":["blocker","important","minor"],"description":"How badly this hurts the page — blocker (must not publish), important, or minor.","default":"minor"},"section":{"type":"string","description":"The section heading this applies to. Empty means it applies to the whole page."},"problem":{"type":"string","description":"What is wrong, stated plainly."},"fix":{"type":"string","description":"What to do about it."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_review_issue"}},"required":["__kind","problem"],"additionalProperties":false},"plan_page_draft":{"type":"object","properties":{"h1":{"type":"string","description":"The page's single h1 — its headline."},"intro":{"type":"string","description":"The opening paragraph, before the first section."},"sections":{"type":"array","items":{"$ref":"#/$defs/plan_draft_section"},"description":"The body sections, in page order."},"call_to_action":{"type":"string","description":"What the page asks the reader to do next."},"meta_title":{"type":"string","description":"The page's title tag, for search results."},"meta_description":{"type":"string","description":"The page's meta description, for search results."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_page_draft"}},"required":["__kind","h1"],"additionalProperties":false},"plan_draft_section":{"type":"object","properties":{"heading":{"type":"string","description":"The section's heading, as it appears on the page."},"level":{"type":"number","description":"Heading level — 2 or 3. The page's h1 is the draft's own `h1` field, never a section.","default":2},"intent":{"type":"string","description":"What this section is FOR, in the writer's own words. Survives editing, and is what a re-render or a human editor reads to stay on-intent."},"body":{"type":"string","description":"The section's prose. Plain text — never HTML; the builder renders it."},"bullets":{"type":"array","items":{"type":"string"},"description":"Bulleted points belonging to this section, in order."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"plan_draft_section"}},"required":["__kind","heading"],"additionalProperties":false}}},"strict":true,"unresolved":[]}$J$::jsonb,
    $J${"name":"plan_page_review","schema":{"type":"object","properties":{"verdict":{"type":"string","enum":["approved","revised"],"description":"`approved` — the draft stands as written. `revised` — the reviewer rewrote it.","default":"revised"},"issues":{"type":"array","items":{"$ref":"#/$defs/plan_review_issue"},"description":"Everything the review found, worst first."},"revised":{"$ref":"#/$defs/plan_page_draft","description":"The improved draft. On an `approved` verdict this is the input draft, unchanged."}},"required":["revised"],"additionalProperties":false,"$defs":{"plan_review_issue":{"type":"object","properties":{"severity":{"type":"string","enum":["blocker","important","minor"],"description":"How badly this hurts the page — blocker (must not publish), important, or minor.","default":"minor"},"section":{"type":"string","description":"The section heading this applies to. Empty means it applies to the whole page."},"problem":{"type":"string","description":"What is wrong, stated plainly."},"fix":{"type":"string","description":"What to do about it."}},"required":["problem"],"additionalProperties":false},"plan_page_draft":{"type":"object","properties":{"h1":{"type":"string","description":"The page's single h1 — its headline."},"intro":{"type":"string","description":"The opening paragraph, before the first section."},"sections":{"type":"array","items":{"$ref":"#/$defs/plan_draft_section"},"description":"The body sections, in page order."},"call_to_action":{"type":"string","description":"What the page asks the reader to do next."},"meta_title":{"type":"string","description":"The page's title tag, for search results."},"meta_description":{"type":"string","description":"The page's meta description, for search results."}},"required":["h1"],"additionalProperties":false},"plan_draft_section":{"type":"object","properties":{"heading":{"type":"string","description":"The section's heading, as it appears on the page."},"level":{"type":"number","description":"Heading level — 2 or 3. The page's h1 is the draft's own `h1` field, never a section.","default":2},"intent":{"type":"string","description":"What this section is FOR, in the writer's own words. Survives editing, and is what a re-render or a human editor reads to stay on-intent."},"body":{"type":"string","description":"The section's prose. Plain text — never HTML; the builder renders it."},"bullets":{"type":"array","items":{"type":"string"},"description":"Bulleted points belonging to this section, in order."}},"required":["heading"],"additionalProperties":false}}},"strict":true,"unresolved":[]}$J$::jsonb,
    '2d1-meq5n1i3z4s1',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'cms_page_build',
    'Built Page',
    'ts',
    $J$[{"name":"route","required":true,"description":"The path this page lives at on the site.","type":"string"},{"name":"page_id","description":"The CMS page row this build wrote to.","type":"string"},{"name":"write_target","description":"`live` — visitors see this now. `draft` — the page is published and its live content was deliberately left alone.","type":"enum","values":["live","draft"]},{"name":"html","description":"The built markup. Author-supplied — always render sandboxed.","type":"string"},{"name":"css","description":"Styles that accompany the markup.","type":"string"},{"name":"meta_title","description":"The page's title tag, as built.","type":"string"},{"name":"meta_description","description":"The page's meta description, as built.","type":"string"}]$J$::jsonb,
    $J${"__kind":"cms_page_build","route":"/services/runners-knee","page_id":"7f3c1e88-5a2b-4c19-9d64-2b8e0a1f4c37","write_target":"live","html":"<article class=\"page\"><h1>Physical Therapy for Runner's Knee</h1><p class=\"lede\">Runner's knee rarely comes from the knee itself. Most cases trace back to how the hip and foot are loading.</p><section><h2>What runner's knee actually is</h2><p>Patellofemoral pain syndrome is pain around or behind the kneecap, usually worse on stairs, hills, and after sitting a long while.</p></section><section><h2>How we assess it</h2><p>The first visit looks above and below the knee before it looks at the knee.</p><ul><li>Hip strength and control, single-leg</li><li>Ankle mobility and foot loading</li></ul></section><p class=\"cta\">Book an assessment and bring the shoes you run in most often.</p></article>","css":".page{max-width:68ch;margin:0 auto;line-height:1.6}.lede{font-size:1.125rem}.cta{font-weight:600}","meta_title":"Physical Therapy for Runner's Knee | Northside Physio","meta_description":"Runner's knee is a loading problem, not joint wear. See how our assessment finds the cause at the hip and foot, and what a six-to-ten week program looks like."}$J$::jsonb,
    $J${"name":"cms_page_build","schema":{"type":"object","properties":{"route":{"type":"string","description":"The path this page lives at on the site."},"page_id":{"type":"string","description":"The CMS page row this build wrote to."},"write_target":{"type":"string","enum":["live","draft"],"description":"`live` — visitors see this now. `draft` — the page is published and its live content was deliberately left alone."},"html":{"type":"string","description":"The built markup. Author-supplied — always render sandboxed."},"css":{"type":"string","description":"Styles that accompany the markup."},"meta_title":{"type":"string","description":"The page's title tag, as built."},"meta_description":{"type":"string","description":"The page's meta description, as built."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"cms_page_build"}},"required":["__kind","route"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    $J${"name":"cms_page_build","schema":{"type":"object","properties":{"route":{"type":"string","description":"The path this page lives at on the site."},"page_id":{"type":"string","description":"The CMS page row this build wrote to."},"write_target":{"type":"string","enum":["live","draft"],"description":"`live` — visitors see this now. `draft` — the page is published and its live content was deliberately left alone."},"html":{"type":"string","description":"The built markup. Author-supplied — always render sandboxed."},"css":{"type":"string","description":"Styles that accompany the markup."},"meta_title":{"type":"string","description":"The page's title tag, as built."},"meta_description":{"type":"string","description":"The page's meta description, as built."}},"required":["route"],"additionalProperties":false},"strict":true,"unresolved":[]}$J$::jsonb,
    'qs-ea0chx1x5zwgf',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  )
-- Arbiter is `kind_definition_global_slug_unique` — a PARTIAL unique index on
-- (kind) WHERE deleted_at IS NULL, so the predicate must be restated here.
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


-- ── 2. kind_edge: every parent→child field edge ────────────────────────────

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'sources', c.id, 0, p.organization_id
FROM content_ir.kind_definition p
JOIN content_ir.kind_definition c
  ON c.kind = 'plan_research_source'
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
WHERE p.kind = 'plan_page_research'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'defer_to', c.id, 0, p.organization_id
FROM content_ir.kind_definition p
JOIN content_ir.kind_definition c
  ON c.kind = 'plan_deferred_topic'
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
WHERE p.kind = 'plan_page_outline'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'internal_links', c.id, 0, p.organization_id
FROM content_ir.kind_definition p
JOIN content_ir.kind_definition c
  ON c.kind = 'plan_planned_link'
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
WHERE p.kind = 'plan_page_outline'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'sections', c.id, 0, p.organization_id
FROM content_ir.kind_definition p
JOIN content_ir.kind_definition c
  ON c.kind = 'plan_draft_section'
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
WHERE p.kind = 'plan_page_draft'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'issues', c.id, 0, p.organization_id
FROM content_ir.kind_definition p
JOIN content_ir.kind_definition c
  ON c.kind = 'plan_review_issue'
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
WHERE p.kind = 'plan_page_review'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'revised', c.id, null, p.organization_id
FROM content_ir.kind_definition p
JOIN content_ir.kind_definition c
  ON c.kind = 'plan_page_draft'
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
WHERE p.kind = 'plan_page_review'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL
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
    'plan_page_research', 'Runner''s knee research (canonical)', true,
    'A full research record: writer instructions, four citable sources with types and notes, the phrase the page targets, and a pointer to the grounding document.',
    $J${"__kind":"plan_page_research","brief":["Lead with the fact that patellofemoral pain is a loading problem, not joint degeneration — this is the misconception that brings most readers to the page.","Name hip abductor weakness and ankle dorsiflexion restriction as the two most common upstream causes.","Give a realistic recovery window of six to ten weeks; do not promise a fixed number of sessions.","Do not recommend specific exercises by name — the assessment decides them, and a generic list invites self-treatment."],"sources":[{"label":"Hip strengthening compared with knee exercises for patellofemoral pain","source_type":"study","url":"https://example.org/journals/pfps-hip-vs-knee","notes":"Supports the claim that proximal strengthening outperforms isolated quad work."},{"label":"National clinical guideline on patellofemoral pain","source_type":"government","url":"https://example.gov/guidelines/patellofemoral-pain","notes":"Basis for the six-to-ten week recovery window."},{"label":"Running injury incidence survey, 2025","source_type":"industry-report","url":"https://example.org/reports/running-injury-2025","notes":"Prevalence figure used in the introduction."},{"label":"Clinic intake notes on common patient questions","source_type":"internal","url":null,"notes":"Why the assessment section leads — it is the most asked pre-booking question. No public URL; an internal source is still a source."}],"primary_keyword":"physical therapy for runner's knee","research_report":"research_topic:0d0f9a2c v3 (48210 chars, 12 sources)"}$J$
  ),
  (
    'plan_page_research', 'Minimal research record', false,
    'The minimal legal form: instructions only, no sources yet, no keyword set. Every field is optional and the record still renders.',
    $J${"__kind":"plan_page_research","brief":["Cover parking, public transport, and after-hours contact — this is a logistics page, not a clinical one."],"sources":[],"primary_keyword":null,"research_report":null}$J$
  ),
  (
    'plan_page_outline', 'Runner''s knee placement (canonical)', true,
    'A full family placement: what only this page does, what it covers, the boundary against sibling pages, planned links, and one topic no page owns yet.',
    $J${"__kind":"plan_page_outline","differentiator":"This is the only page that explains what runner's knee is and how it is assessed; every sibling page is either a different condition or a different service.","covers":["What patellofemoral pain is, in plain language","The upstream causes at the hip and foot","What the first assessment involves","Realistic recovery timelines for returning to running"],"must_not_cover":["General pricing and insurance questions","The clinic's staff credentials and philosophy","Post-surgical knee rehabilitation, which is a different pathway entirely"],"defer_to":[{"topic":"Fees and insurance coverage","to_route":"/fees"},{"topic":"Our therapists","to_route":"/about/team"},{"topic":"Return-to-sport testing protocols","to_route":""}],"internal_links":[{"to_route":"/services/running-assessment","anchor_text":"running assessment","reason":"The natural next step for a reader who recognizes their symptoms here."},{"to_route":"/fees","anchor_text":"what an assessment costs","reason":"Answers the question this page deliberately does not, without breaking the boundary."}],"uncovered_gaps":["Return-to-sport testing protocols — the plan wants this subject and no page has claimed it."]}$J$
  ),
  (
    'plan_page_outline', 'Minimal placement', false,
    'Minimal legal form: a differentiator and what the page covers, with no boundary or links worked out yet.',
    $J${"__kind":"plan_page_outline","differentiator":"The only page that tells a visitor how to reach the clinic and when it is open.","covers":["Address, parking, and public transport","Opening hours"],"must_not_cover":[],"defer_to":[],"internal_links":[],"uncovered_gaps":[]}$J$
  ),
  (
    'plan_page_draft', 'Runner''s knee draft (canonical)', true,
    'A complete page draft: headline, opening, three sections carrying the writer''s intent and prose, a call to action, and the search listing.',
    $J${"__kind":"plan_page_draft","h1":"Physical Therapy for Runner's Knee","intro":"Runner's knee rarely comes from the knee itself. Most cases trace back to how the hip and foot are loading, which is why a program that only stretches the quad tends to stall.","sections":[{"heading":"What runner's knee actually is","level":2,"intent":"Name the condition plainly before any advice, so a reader can tell whether this page is about their problem.","body":"Patellofemoral pain syndrome is pain around or behind the kneecap, usually worse on stairs, hills, and after sitting a long while. It is a loading problem, not a sign that the joint is wearing out.","bullets":[]},{"heading":"How we assess it","level":2,"intent":"Show the reader what the first appointment involves, which is the single most common pre-booking question.","body":"The first visit looks above and below the knee before it looks at the knee. We watch you walk, run if you can, and step down from a box.","bullets":["Hip strength and control, single-leg","Ankle mobility and foot loading","Running cadence and stride, when running is the aggravating activity"]},{"heading":"What treatment looks like","level":2,"intent":"Set an honest expectation of duration and effort so the reader is not surprised later.","body":"Most people are running again within six to ten weeks. The program is progressive strength work two to three times a week, with a gradual return-to-run plan layered on once you can load the knee without next-day pain.","bullets":[]}],"call_to_action":"Book an assessment and bring the shoes you run in most often.","meta_title":"Physical Therapy for Runner's Knee | Northside Physio","meta_description":"Runner's knee is a loading problem, not joint wear. See how our assessment finds the cause at the hip and foot, and what a six-to-ten week program looks like."}$J$
  ),
  (
    'plan_page_draft', 'Minimal draft', false,
    'Minimal legal form: a headline and one section with prose. Intent, bullets, call to action, and meta fields are all optional.',
    $J${"__kind":"plan_page_draft","h1":"Contact Northside Physio","sections":[{"heading":"Where to find us","body":"We are on the ground floor at 44 Bridge Street, with parking behind the building."}]}$J$
  ),
  (
    'plan_page_review', 'Review that rewrote the page (canonical)', true,
    'A `revised` verdict with three findings across all severities — including a fabricated statistic caught before publication — and the improved draft the reviewer produced.',
    $J${"__kind":"plan_page_review","verdict":"revised","issues":[{"severity":"blocker","section":"What runner's knee actually is","problem":"The draft claimed \"runner's knee affects 71% of all runners\". No source in the research supports that figure, and the cited survey reports a far lower range.","fix":"Remove the statistic. State that it is one of the most common running complaints, which the survey does support."},{"severity":"important","section":"What treatment looks like","problem":"The recovery window was written as \"about four weeks\", which contradicts the six-to-ten weeks the clinical guideline in the research gives.","fix":"Use six to ten weeks, and say it depends on how the knee tolerates loading."},{"severity":"minor","section":"","problem":"The meta description ran to 189 characters and would be truncated in search results.","fix":"Shorten it to under 160 characters while keeping the loading-problem framing."}],"revised":{"__kind":"plan_page_draft","h1":"Physical Therapy for Runner's Knee","intro":"Runner's knee rarely comes from the knee itself. Most cases trace back to how the hip and foot are loading, which is why a program that only stretches the quad tends to stall.","sections":[{"heading":"What runner's knee actually is","level":2,"intent":"Name the condition plainly before any advice, so a reader can tell whether this page is about their problem.","body":"Patellofemoral pain syndrome is pain around or behind the kneecap, usually worse on stairs, hills, and after sitting a long while. It is a loading problem, not a sign that the joint is wearing out.","bullets":[]},{"heading":"How we assess it","level":2,"intent":"Show the reader what the first appointment involves, which is the single most common pre-booking question.","body":"The first visit looks above and below the knee before it looks at the knee. We watch you walk, run if you can, and step down from a box.","bullets":["Hip strength and control, single-leg","Ankle mobility and foot loading","Running cadence and stride, when running is the aggravating activity"]},{"heading":"What treatment looks like","level":2,"intent":"Set an honest expectation of duration and effort so the reader is not surprised later.","body":"Most people are running again within six to ten weeks. The program is progressive strength work two to three times a week, with a gradual return-to-run plan layered on once you can load the knee without next-day pain.","bullets":[]}],"call_to_action":"Book an assessment and bring the shoes you run in most often.","meta_title":"Physical Therapy for Runner's Knee | Northside Physio","meta_description":"Runner's knee is a loading problem, not joint wear. See how our assessment finds the cause at the hip and foot, and what a six-to-ten week program looks like."}}$J$
  ),
  (
    'plan_page_review', 'Review that approved the page', false,
    'An `approved` verdict with no findings — `revised` is the input draft, unchanged, and is always present.',
    $J${"__kind":"plan_page_review","verdict":"approved","issues":[],"revised":{"__kind":"plan_page_draft","h1":"Contact Northside Physio","sections":[{"heading":"Where to find us","body":"We are on the ground floor at 44 Bridge Street, with parking behind the building."}]}}$J$
  ),
  (
    'cms_page_build', 'Built page written live (canonical)', true,
    'A build that replaced what visitors see: route, the CMS page it wrote to, its write target, the markup and styles, and the search listing.',
    $J${"__kind":"cms_page_build","route":"/services/runners-knee","page_id":"7f3c1e88-5a2b-4c19-9d64-2b8e0a1f4c37","write_target":"live","html":"<article class=\"page\"><h1>Physical Therapy for Runner's Knee</h1><p class=\"lede\">Runner's knee rarely comes from the knee itself. Most cases trace back to how the hip and foot are loading.</p><section><h2>What runner's knee actually is</h2><p>Patellofemoral pain syndrome is pain around or behind the kneecap, usually worse on stairs, hills, and after sitting a long while.</p></section><section><h2>How we assess it</h2><p>The first visit looks above and below the knee before it looks at the knee.</p><ul><li>Hip strength and control, single-leg</li><li>Ankle mobility and foot loading</li></ul></section><p class=\"cta\">Book an assessment and bring the shoes you run in most often.</p></article>","css":".page{max-width:68ch;margin:0 auto;line-height:1.6}.lede{font-size:1.125rem}.cta{font-weight:600}","meta_title":"Physical Therapy for Runner's Knee | Northside Physio","meta_description":"Runner's knee is a loading problem, not joint wear. See how our assessment finds the cause at the hip and foot, and what a six-to-ten week program looks like."}$J$
  ),
  (
    'cms_page_build', 'Build saved as a draft', false,
    'The page is published, so the build deliberately wrote to the draft twin instead of overwriting live content — the write_target rule in one record.',
    $J${"__kind":"cms_page_build","route":"/contact","page_id":"b1d4a907-3e65-4f28-8a11-6c9f2d3b5e40","write_target":"draft","html":"<article class=\"page\"><h1>Contact Northside Physio</h1><p>We are on the ground floor at 44 Bridge Street, with parking behind the building.</p></article>","css":".page{max-width:68ch;margin:0 auto;line-height:1.6}","meta_title":"Contact Northside Physio","meta_description":"Find us at 44 Bridge Street, with parking behind the building. Opening hours and how to reach us."}$J$
  ),
  (
    'plan_research_source', 'Cited study (canonical)', true,
    'One citable source: label, type, URL, and what it supports on the page.',
    $J${"__kind":"plan_research_source","label":"Hip strengthening compared with knee exercises for patellofemoral pain","source_type":"study","url":"https://example.org/journals/pfps-hip-vs-knee","notes":"Supports the claim that proximal strengthening outperforms isolated quad work."}$J$
  ),
  (
    'plan_deferred_topic', 'Topic handed to a sibling (canonical)', true,
    'A topic this page deliberately leaves alone, and the page that owns it.',
    $J${"__kind":"plan_deferred_topic","topic":"Fees and insurance coverage","to_route":"/fees"}$J$
  ),
  (
    'plan_planned_link', 'Planned internal link (canonical)', true,
    'A link this page should carry, with its anchor and reason.',
    $J${"__kind":"plan_planned_link","to_route":"/services/running-assessment","anchor_text":"running assessment","reason":"The natural next step for a reader who recognizes their symptoms here."}$J$
  ),
  (
    'plan_draft_section', 'Body section with bullets (canonical)', true,
    'One section: heading, level, the writer''s intent, prose, and bullets. The body is plain prose — never HTML.',
    $J${"__kind":"plan_draft_section","heading":"How we assess it","level":2,"intent":"Show the reader what the first appointment involves, which is the single most common pre-booking question.","body":"The first visit looks above and below the knee before it looks at the knee. We watch you walk, run if you can, and step down from a box.","bullets":["Hip strength and control, single-leg","Ankle mobility and foot loading","Running cadence and stride, when running is the aggravating activity"]}$J$
  ),
  (
    'plan_review_issue', 'Fabricated statistic caught (canonical)', true,
    'A blocker: an invented figure no source supports, with the correction to make. This is the class of finding the review pass exists for.',
    $J${"__kind":"plan_review_issue","severity":"blocker","section":"What runner's knee actually is","problem":"The draft claimed \"runner's knee affects 71% of all runners\". No source in the research supports that figure, and the cited survey reports a far lower range.","fix":"Remove the statistic. State that it is one of the most common running complaints, which the survey does support."}$J$
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


-- ── 4. kind_component: web output → the compiled bridge, ROOTS ONLY ────────
-- The five child kinds render INSIDE their parent's component and therefore
-- get no row and stay inactive — the media_chapter precedent.

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'plan_page_research', 'bundled',
       $J${"legacyBlockType":"plan_page_research"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'plan_page_research'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'plan_page_research'
      AND c.deleted_at IS NULL
  );

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'plan_page_outline', 'bundled',
       $J${"legacyBlockType":"plan_page_outline"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'plan_page_outline'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'plan_page_outline'
      AND c.deleted_at IS NULL
  );

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'plan_page_draft', 'bundled',
       $J${"legacyBlockType":"plan_page_draft"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'plan_page_draft'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'plan_page_draft'
      AND c.deleted_at IS NULL
  );

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'plan_page_review', 'bundled',
       $J${"legacyBlockType":"plan_page_review"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'plan_page_review'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'plan_page_review'
      AND c.deleted_at IS NULL
  );

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'cms_page_build', 'bundled',
       $J${"legacyBlockType":"cms_page_build"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'cms_page_build'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'cms_page_build'
      AND c.deleted_at IS NULL
  );


COMMIT;

