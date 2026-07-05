# Brief — build a `__kind` render-block SKILL + content blocks (per kind)

You are ONE agent building the platform skill + content blocks for **one** content-ir kind. Other agents are doing the other kinds in parallel off this same brief. Produce a migration FILE; do NOT apply it (the orchestrator applies all centrally to avoid races).

## The goal (why this matters)
A content-ir "kind" is a canonical structured-content type (e.g. `flashcard_set`) an agent emits as JSON carrying `"__kind": "<kind>"`. A **skill** teaches an agent how to emit it; a generated sample then feeds the dual gate (`content_ir.kind_definition.is_active`), and a **content block** lets a user right-click it into an agent's system prompt. You are producing both for your kind.

## Read these first (the real contracts — never invent syntax)
1. `.claude/skills/create-render-block-skill/SKILL.md` — the recipe. Follow it, WITH the corrections below.
2. **Your kind's canonical schema** — query it live (this is what you teach):
   ```sql
   SELECT kind, label, data, sample_data, emitted_block_schema
   FROM content_ir.kind_definition WHERE kind = '<YOUR_KIND>';
   ```
   The `data` array is the field list (ordered); `emitted_block_schema` is the provider JSON Schema (with `__kind` injected). Teach EXACTLY this shape.
3. **Your kind's render component** — read its renderer/parser under `components/mardown-display/blocks/**` (find it via the `legacyBlockType` in `features/content-ir/kinds/<your-kind>.ts`) so your examples render, and so you copy the real failure modes.
4. **The live SQL patterns** — read the existing `mermaid-diagrams` skill row and a few existing content blocks as the structural template:
   ```sql
   SELECT skill_id, label, description, skill_type, is_system, is_public, platform_targets, version, category_id, left(body, 1200) FROM skill.definition WHERE skill_id = 'mermaid-diagrams';
   SELECT * FROM public.content_blocks ORDER BY created_at DESC LIMIT 5;
   ```

## CRITICAL corrections to the recipe (tables were reorg'd)
The recipe's `skl_*` names are STALE. Use the live schema:
- `skl_definitions` → **`skill.definition`** (columns incl. `skill_id`, `label`, `description`, `body`, `skill_type`, `icon_name`, `platform_targets` jsonb, `version`, `category_id`, `is_system`, `is_public`, `is_active`, `user_id`/`organization_id`/`project_id`/`task_id` NULL = global, `visibility`).
- `skl_render_definitions`/`skl_render_components` → **`skill.render_definition`** / **`skill.render_component`** (OPTIONAL — skip unless trivial).
- `skl_categories` / `shortcut_categories` → **`platform.categories`** (dimension-based — discover the content-block category's dimension + shape from an existing `public.content_blocks` row's `category_id`).
- Content blocks stay **`public.content_blocks`**.
- `skill_type` value for these is `'render_block'`. `is_system=true`, `is_public=true`, all scope columns NULL (global).

## The `__kind` VARIATION (different from mermaid's fence)
Mermaid teaches a ` ```mermaid ` fence. Your kind is emitted as **bare JSON carrying `__kind`** (the system recognizes it live, fenced or unfenced). So the skill body teaches:
- Emit a JSON object `{ "__kind": "<YOUR_KIND>", ... }` matching the schema (you may show it inside a ` ```json ` fence for clarity — both render).
- The exact fields (from `data`), which are required, nested child shapes (children also carry their own `__kind`).
- One correct minimal example built from `sample_data` (or authored to match the schema if `sample_data` is null).

## Skill body structure (~200-350 lines markdown; mermaid's body is the style template)
1. What it is (one JSON `__kind` per block; renders live + becomes an editable/persisted artifact).
2. When to use it / its variants (intent → shape, as user-facing features).
3. The `__kind` + field structure (from the schema).
4. Syntax rules that PREVENT render failures (from the real parser/renderer).
5. Sizing/limits.
6. Editing etiquette (return ONE complete updated block; keep `__kind`; preserve ids).
7. One correct minimal example.

## Content blocks (`public.content_blocks`)
- Reuse/ create ONE shared category via `platform.categories` for these (discover the dimension + a stable `category_key` like `render-block-content`; idempotent `WHERE NOT EXISTS`). Do NOT invent a new dimension — match how existing content-block categories are shaped.
- 1 primary block for your kind + optionally 1-2 variant/combo blocks. **Human labels** (your kind's `label`, e.g. "Flashcards", "Quiz"), never internal slugs. Template style: framing line → one concrete ` ```json ` `__kind` example → 3-6 tight rules, ~250-600 chars, dollar-quoted (`$CB$…$CB$`).
- `block_id` is UNIQUE → `ON CONFLICT (block_id) DO UPDATE`. `icon_name` = a sensible Lucide name.

## SQL rules (idempotent, live-verified names)
- `skill.definition` has a COMPOSITE unique — insert with `INSERT INTO skill.definition (…) SELECT … WHERE NOT EXISTS (SELECT 1 FROM skill.definition WHERE skill_id = '<id>' AND user_id IS NULL)`. NOT `ON CONFLICT (skill_id)`.
- Schema-qualify EVERY table (`skill.definition`, `public.content_blocks`, `platform.categories`).
- Wrap in `BEGIN; … COMMIT;`. Idempotent on business keys so re-apply is safe.
- Verify column names against the live tables before writing (do NOT guess — query `information_schema.columns`).

## Your output
Write `migrations/kind_<YOUR_KIND>_skill.sql` (one file). Do NOT apply it. Return: the file path, the `skill_id` you chose, the content-block `block_id`(s), and one line on anything you were unsure about (e.g. category dimension). Keep the skill body high-quality and specific to your kind — this is what trains every agent that uses it.
