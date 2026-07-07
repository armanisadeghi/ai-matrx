-- rb_research_skill.sql
-- Render-block SKILL + content block for the `<research>` XML-tag render block.
--
-- Trigger:      the XML tag `<research> … </research>`
--               (content-splitter-v2.ts → XML_TAG_BLOCKS.research = ["<research>"])
-- Renderer:     components/mardown-display/blocks/research/ResearchBlock.tsx  (LIVE, registered
--               in BlockComponentRegistry.tsx as ResearchBlock + ResearchLoading)
-- Parser:       components/mardown-display/blocks/research/parseResearchMarkdown.ts
--
-- The parser is header-driven: it strips the <research></research> wrapper, splits the body on
-- markdown headers (# … ######), then categorizes each section by a case-insensitive substring
-- match on the header title. ONLY these titles are recognized; anything else lands in the Debug
-- tab as an "unrecognized section". This skill encodes exactly those recognized titles + shapes.
--
-- COEXISTENCE: a legacy content block `deep-research-report` (category 01c14d75, a template
-- category — NOT the shared Render Blocks content-block category) already emits this same
-- `<research>` tag. We do NOT touch it. This migration adds a NEW block_id `research-block` in the
-- canonical Render Blocks content-block category (6913d9fc) so both coexist.
--
-- Idempotent. Apply centrally with the other render-block skills. Do NOT apply standalone.

BEGIN;

-- ============================================================================
-- 1. SKILL  →  skill.definition
-- ============================================================================
-- The body + description live once in a TEMP table so the INSERT (first apply) and the
-- body is defined once — no duplicated literal, no self-
-- referencing no-op. The TEMP table is dropped at COMMIT.

CREATE TEMP TABLE _rb_research_skill ON COMMIT DROP AS
SELECT
  'How and when to emit a <research> render block: the recognized section headings the parser reads, the exact heading titles and field labels that populate Overview / Executive Summary / Introduction / Findings / Conclusion / Methodology, syntax rules that keep content out of the Debug tab, sizing, and editing etiquette.'::text AS description,
  $BODY$# Research Analysis

You can present a structured research report as a live, interactive `<research>` block.
It renders as a tabbed dashboard — Overview, Findings, Analysis, Recommendations, and a
Debug tab — with expandable sections, a confidence filter, a fullscreen "Research View",
a Print button, and a "Canvas" button that opens the report as an editable artifact.

Reach for it when the user asks for a literature review, a market/technology scan, a
"deep research" report, a state-of-the-field synthesis, or any multi-source analysis that
benefits from scannable sections and metadata (scope, focus areas, analysis period).

For ordinary prose answers, a short list, or a single-source summary, just write markdown.
The `<research>` block earns its weight only when you have a genuinely structured report.

## How to emit a research block

Wrap a markdown document in a single `<research>` … `</research>` tag. The renderer is
HEADING-DRIVEN: it splits your document on markdown headings and routes each section by the
heading's title. Use these EXACT heading titles (case-insensitive) so the section is
recognized — any other heading is still shown, but only in the Debug tab, not the main UI.

```
<research>
# Research Analysis: On-Device LLMs (2026-2028)

## Overview

A synthesis of on-device large-language-model inference and its near-term trajectory.

**Research Scope:** Consumer + edge hardware, 2026 through 2028
**Key Focus Areas:** Quantization, NPUs, privacy, latency
**Analysis Period:** Jan 2026 - Jun 2026

## Executive Summary

On-device inference has crossed the usability threshold for 3-8B models on flagship phones...

## Introduction

Local inference removes the round-trip to a data center. This report asks:

1. Which model sizes run acceptably on 2026 consumer silicon?
2. Where does on-device still lose to the cloud?
3. What unlocks the next step-change?

## Key Research Findings

#### Research Finding 1: **NPU throughput doubled year over year**

Flagship NPUs now sustain 40+ tokens/sec on 4-bit 7B models...

#### Research Finding 2: **Quantization-aware training closed the quality gap**

4-bit QAT models now score within 2% of fp16 baselines...

## Conclusion

On-device LLMs are production-ready for a well-defined class of tasks. The key takeaways:

1. 3-8B, 4-bit models are the current sweet spot on flagship hardware.
2. Privacy and latency, not raw quality, are the decisive advantages.
3. Memory bandwidth, not compute, is the binding constraint through 2027.

## Methodology

**Search Strategy:** Peer-reviewed venues (NeurIPS, MLSys) plus vendor whitepapers.
**Source Selection Criteria:** 2025-2026 primary sources; benchmarks reproducible.
**Analysis Framework:** Quality-latency-privacy trade-off across hardware tiers.
</research>
```

Rules:
- ONE `<research>` block per report. Open `<research>` on its own line, close `</research>` on
  its own line. Everything between them is a single markdown document.
- The FIRST level-1 heading (`# …`) becomes the report title. Give it one.
- Do not nest another `<research>` block, and do not wrap the block in `<artifact>` tags — the
  research block is already its own persistable artifact.

## Recognized sections (this is the whole contract)

The parser matches heading titles by case-insensitive SUBSTRING. Only these are surfaced in the
tabbed UI; write them verbatim.

| Heading you write | Where it renders | How it is parsed |
|---|---|---|
| `# <title>` (first H1) | Header banner title | First level-1 heading only. |
| `## Overview` | Header banner + Scope/Focus/Period cards | Body text is the banner blurb. The three metadata cards are populated ONLY from bold-label lines inside it (below). |
| `## Executive Summary` | Overview tab | Whole section body, as a paragraph. |
| `## Introduction` | Overview tab + "Key Research Questions" list | Body is the intro paragraph. Any `1.`, `2.`, `3.` numbered lines become the research-questions list. |
| `## Key Research Findings` (or any title containing `key research`, or `research and discoveries`) | Findings tab | Each `#### Research Finding N: **Title**` line becomes an expandable finding. If none are present, the whole section becomes one "General Research Content" finding. |
| `## Conclusion` | Analysis tab + "Key Takeaways" list | Body is the conclusion paragraph. Any numbered `1.`, `2.` lines become the key-takeaways list. |
| `## Methodology` | (parsed, drives methodology fields) | Populated ONLY from the three bold-label lines below. |

Metadata bold-label lines — write them EXACTLY, one per line, inside the named section:

- Inside `## Overview`:
  - `**Research Scope:** <text>`
  - `**Key Focus Areas:** <text>`
  - `**Analysis Period:** <text>`
- Inside `## Methodology`:
  - `**Search Strategy:** <text>`
  - `**Source Selection Criteria:** <text>`
  - `**Analysis Framework:** <text>`

Any heading NOT in the table above (e.g. `## Discussion`, `## References`, `## Background`) is
NOT lost — it is collected and shown under the Debug tab as an "unrecognized section". Prefer to
fold that content into one of the recognized sections so it appears in the main UI.

## Syntax rules that prevent silent mis-rendering

These are the real failure modes of the parser — follow them exactly:

1. TITLE IS AN H1. The report title must be a single-`#` heading and appear first. Wrong: no H1
   at all (the title falls back to a generic "Research Analysis"). Right: `# Research Analysis: <topic>`.

2. RECOGNIZED SECTIONS ARE H2 (`##`). The parser keys off the heading TITLE, not the level, but the
   UI is built around `##` sections. Wrong: `# Overview`. Right: `## Overview`.

3. FINDINGS USE THE EXACT PREFIX. A finding is only detected as `#### Research Finding N: **Title**`
   — four hashes, the literal phrase `Research Finding`, a number, a colon, then the title in
   `**bold**`. Wrong: `#### Finding 1: New NPUs` (no bold title → not detected). Right:
   `#### Research Finding 1: **New NPUs double throughput**`. If you cannot fit this shape, omit the
   `####` lines entirely and the section body becomes one general finding.

4. METADATA LABELS ARE BOLD AND EXACT. Scope/Focus/Period cards and the methodology fields are
   scraped by literal regex on `**Research Scope:**`, `**Key Focus Areas:**`, `**Analysis Period:**`,
   `**Search Strategy:**`, `**Source Selection Criteria:**`, `**Analysis Framework:**`. Wrong:
   `Research Scope: consumer hardware` (no bold → card stays empty). Right:
   `**Research Scope:** consumer hardware`. Each label on ITS OWN line.

5. QUESTIONS / TAKEAWAYS ARE NUMBERED LINES. Research questions (in Introduction) and key takeaways
   (in Conclusion) are extracted from `1.` `2.` `3.` numbered list lines in that section. Use `-`
   bullets and they will NOT populate those lists. Right: `1. First question`.

6. DON'T FENCE THE WHOLE THING. Do not put the `<research>` document inside a ```` ```markdown ````
   code fence — that turns the report into a literal code block instead of a rendered block.

## Sizing

A research block is meant to be substantial — several `##` sections and, ideally, 2-8 findings.
It is fine (and encouraged) to write long section bodies. If you only have one short paragraph
and no structure, write plain markdown instead; the block's chrome will overwhelm thin content.

## Editing etiquette

When asked to revise a research block, return the ONE complete `<research>` … `</research>` block,
updated in full — never a diff or a second partial block. Keep the `<research>` tag (do not switch
to a code fence), keep the first H1 title, and keep the recognized heading titles verbatim so the
sections stay in the main tabs rather than dropping to Debug. Preserve `#### Research Finding N:`
numbering when you edit findings; renumber only if you add or remove one.
$BODY$::text AS body;

-- First apply: insert the global (org-scoped, user/project/task NULL) row.
-- Composite unique is (skill_id, user_id, organization_id, project_id) — guard, not ON CONFLICT.
INSERT INTO skill.definition (
  skill_id, label, description, skill_type, body, icon_name,
  platform_targets, semver, category_id,
  is_active, is_system, visibility,
  organization_id, sort_order
)
SELECT
  'research-analysis',
  'Research Analysis',
  s.description,
  'render_block'::public.skl_skill_type,
  s.body,
  'BookOpen',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true, true, 'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  0
FROM _rb_research_skill s
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'research-analysis' AND created_by IS NULL
);

-- ============================================================================
-- 2. CONTENT BLOCK  →  public.content_blocks
--    New id `research-block` (COEXISTS with legacy `deep-research-report`).
-- ============================================================================

INSERT INTO public.content_blocks (
  block_id, label, description, template, icon_name,
  organization_id, category_id, metadata, version, is_active, sort_order
)
VALUES (
  'research-block',
  'Research Analysis',
  'Teaches the agent to emit a <research> render block — a tabbed research-report dashboard — using the exact section headings the parser recognizes.',
  $CB$Present a structured, multi-source research report as an interactive <research> block. Wrap a markdown document in <research> … </research> and use these EXACT heading titles so each section lands in the tabbed UI (any other heading only shows in the Debug tab):

<research>
# Research Analysis: [TOPIC] ([TIME_FRAME])

## Overview
[one-paragraph synopsis]
**Research Scope:** [scope]
**Key Focus Areas:** [areas]
**Analysis Period:** [period]

## Executive Summary
[key findings in a few sentences]

## Introduction
[framing]
1. [research question]
2. [research question]

## Key Research Findings
#### Research Finding 1: **[bold finding title]**
[details]

## Conclusion
[wrap-up]
1. [key takeaway]

## Methodology
**Search Strategy:** [...]
**Source Selection Criteria:** [...]
**Analysis Framework:** [...]
</research>

Rules: one <research> block; first heading is an H1 title; recognized sections are ## with the titles above; findings must be `#### Research Finding N: **Bold Title**`; metadata + methodology fields must be bold-labeled on their own line; research questions and key takeaways must be `1.` numbered lines; never wrap the block in a code fence.$CB$,
  'BookOpen',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '6913d9fc-b8c0-4107-af40-27d55c177694',
  '{}'::jsonb,
  1,
  true,
  0
)
ON CONFLICT (block_id) DO UPDATE SET
  label           = EXCLUDED.label,
  description     = EXCLUDED.description,
  template        = EXCLUDED.template,
  icon_name       = EXCLUDED.icon_name,
  organization_id = EXCLUDED.organization_id,
  category_id     = EXCLUDED.category_id,
  metadata        = EXCLUDED.metadata,
  version         = EXCLUDED.version,
  is_active       = EXCLUDED.is_active,
  sort_order      = EXCLUDED.sort_order,
  updated_at      = now();

COMMIT;
