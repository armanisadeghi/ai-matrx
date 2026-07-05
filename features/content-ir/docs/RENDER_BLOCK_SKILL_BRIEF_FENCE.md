# Brief — build a FENCE/TAG render-block SKILL + content block (per block)

You build the platform skill + content block for ONE render block that is triggered by a **code fence** (` ```<lang> `) or an **XML tag** (`<tag>…</tag>`) — NOT a `__kind` JSON kind. Other agents do the other blocks in parallel off this same brief. Write a migration FILE; do NOT apply it (the orchestrator applies all centrally).

## Goal
A skill teaches an agent to emit your block; a content block lets a user right-click it into an agent's system prompt. Produce both, correct against the REAL parser/renderer.

## Read these first (the real contract — never invent syntax)
1. **The trigger + structure.** Find your block's exact fence language or XML tag in `components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts` (`SPECIAL_CODE_LANGUAGES` for fences, `XML_TAG_BLOCKS` / `ATTRIBUTE_XML_BLOCKS` for tags). Then read its renderer + parser under `components/mardown-display/blocks/**` (and any server parser referenced). Copy the EXACT fence/tag, the sub-structure, and the failure modes the parser tolerates or breaks on.
2. **The live SQL pattern.** Read the `mermaid-diagrams` row in `skill.definition` (a fence-block skill) as the body/row template:
   ```sql
   SELECT skill_id, label, description, skill_type, is_system, is_public, platform_targets, version, category_id, left(body,1500) FROM skill.definition WHERE skill_id='mermaid-diagrams';
   ```
3. **Check for a legacy block to coexist with** (do NOT clobber): `SELECT block_id, label, category_id FROM public.content_blocks WHERE block_id ILIKE '%<your-block>%';`

## The live schema — BAKED IN (verified in wave 1; still confirm columns, but these are correct)
- **Skills** → `skill.definition`. Insert with `INSERT INTO skill.definition (…) SELECT … WHERE NOT EXISTS (SELECT 1 FROM skill.definition WHERE skill_id='<id>' AND user_id IS NULL)` (composite unique `(skill_id,user_id,organization_id,project_id)` — NOT `ON CONFLICT`). Then a mirroring `UPDATE … WHERE skill_id='<id>' AND user_id IS NULL AND organization_id='39c38960-…'` to refresh the body on re-apply.
  - `skill_type='render_block'`, `is_system=true`, `is_public=true`, `is_active=true`, `visibility='public'`, `platform_targets='["web"]'::jsonb`, `version='1.0.0'`, `icon_name`=a Lucide name, `organization_id='39c38960-d30c-4840-b0c1-c9960de95582'` (NOT NULL — this is "global"; user/project/task NULL), `category_id='49c845cb-9314-485c-88ed-a7ace4f286ca'` (the existing "Render Blocks" SKILL category — do NOT create a new one).
- **Content blocks** → `public.content_blocks`. Columns: `block_id` (UNIQUE → `ON CONFLICT (block_id) DO UPDATE`), `label` (human — e.g. "Timeline", "Recipe"), `description`, `template` (the snippet — NOT `content`/`body`), `icon_name` (NOT NULL), `organization_id='39c38960-…'` (NOT NULL), `category_id='6913d9fc-b8c0-4107-af40-27d55c177694'` (the existing shared "Render Blocks" content-block category — do NOT create a new one), `metadata` default `'{}'`, `version`, `is_active=true`, `sort_order`.
  - **COEXIST:** if a legacy `block_id` for your block already exists, use a NEW id (`<block>-kind` or `<block>-block`) so you don't overwrite it.
- Enum casts: `public.skl_skill_type`, `platform.visibility` (bare string literals coerce fine).

## Skill body (~200-350 lines markdown; mermaid's body is the style template)
1. What it is (the ONE fence/tag; renders live + persists as an editable artifact where applicable).
2. When to use it / its sub-types (intent → shape, as user-facing features).
3. The exact fence/tag + inner structure (headings, fields, list format — whatever the parser reads).
4. **Syntax rules that PREVENT render failures** — the REAL breakage class from the parser, each wrong→right.
5. Sizing/limits.
6. Editing etiquette (return ONE complete updated block; keep the fence/tag type; preserve ids).
7. One correct minimal example (+ one per sub-type if it has them).

## Content block
- 1 primary block + optionally 1-2 sub-type/combo blocks. `template` style: framing line → one concrete ` ```fence ` or `<tag>` example → 3-6 tight rules, ~250-600 chars, dollar-quoted (`$CB$…$CB$`). Human label.

## SQL rules
- Idempotent, schema-qualified (`skill.definition`, `public.content_blocks`), wrapped in `BEGIN;…COMMIT;`. Verify columns against `information_schema.columns` before writing (don't guess). Do NOT create new `platform.categories` rows — reuse `49c845cb` (skill) and `6913d9fc` (content block).

## Output
Write `migrations/rb_<block>_skill.sql` (one file). Do NOT apply. Return: file path, chosen `skill_id`, content-block `block_id`(s), the exact trigger (fence/tag), any legacy block you coexisted around, and one line on anything uncertain. If the block's renderer is MISSING or broken (dead block), STOP and report that instead of writing a skill for a block that can't render.
