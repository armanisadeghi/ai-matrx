---
name: create-render-block-skill
description: Create the platform agent-skill (skl_* tables) + content blocks that teach AI Matrx agents to emit a render block — and, when the block type doesn't exist yet, build the whole render block end-to-end first. Use whenever the task is "create the skill for the <X> render block", "skill-ify flashcards/quiz/timeline/diagram/etc.", "add content blocks for <X>", "teach agents to use the <X> block", "give the <X> render block its skill + AI-prompt entries", or "add a new render block type from scratch". This is the dispatchable recipe for the 40-50 existing render blocks that still need skills, and for any new block. Mermaid is the paved worked example. NOT for building a one-off MCP tool result display (that's create-tool-renderer) or printing blocks (block-print-system).
---

# Create a render block's skill + content blocks

Given a render block, produce the two things that make agents actually USE it:

1. **A platform skill** — a `skl_definitions` row (`skill_type='render_block'`, `is_system=true`) whose **body** is the teaching doc injected into an agent's system prompt when the agent includes it. Optionally the render registry (`skl_render_definitions` + per-platform `skl_render_components`).
2. **Content blocks** — `content_blocks` rows: the lightweight prompt snippets a user injects into ONE agent's instructions from the right-click context menu ("a couple of clicks"). Grouped in a `shortcut_categories` (placement `content-block`) category.

Both ship in **ONE idempotent migration**, applied AND live-verified. That's the whole job for an existing block. For a NEW block type you first build the block end-to-end (Part 2), then do Part 1.

## Cardinal rules

- **Read the block's real contract — never invent syntax.** Open the block's renderer + parser (FE `components/mardown-display/blocks/<name>/`, server `packages/matrx-ai/.../parsers/`) and copy the EXACT fence/tag, sub-types, and the failure modes the parser tolerates. A teaching doc with wrong syntax trains agents to emit broken blocks.
- **The body IS the reference — `skl_resources` are NOT agent-reachable.** `skill_get` (aidream `packages/matrx-ai/.../tools/implementations/skill.py`) returns the body only. Put per-sub-type examples IN the body; paging handles length. Do not create resource rows expecting agents to read them.
- **Human labels, no internal jargon.** Users are non-technical. Content blocks say "Flowchart", "Mind Map", "Pie Chart" — never "mermaid X". The block's catalog already names sub-types as user-facing features; reuse those names.
- **A migration changes NOTHING until applied AND verified live.** Writing the `.sql` and reporting "done" is the single most damaging mistake. Apply via the aidream applier (records the ledger), then query the live rows with a throwaway admin-client script. Trust the DB, never the file.
- **Real verification only.** No mock confirmations. For the skill: confirm `skill_get` returns the body / the agent's preamble contains it. For content blocks: confirm the rows are live AND appear in the menu.

## Decide first: does the render block already EXIST?

- **EXISTING** (flashcards, quiz, timeline, decision_tree, comparison_table, presentation, … the 40-50): it already streams + renders. You ONLY create the skill + content blocks → **Part 1**.
- **NEW** (no detection, no renderer): build it end-to-end first → **Part 2**, then **Part 1**.

---

## Part 1 — Skill + content blocks (the common, dispatchable task)

### 1. Gather the block's truth (read, don't guess)
- The exact trigger: a ` ```language ` fence, a `<tag>`, or a JSON root key. Find it in `components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts` and/or aidream `block_detector.py`.
- The sub-types / variants (the block's catalog or model enum).
- The syntax rules that BREAK rendering (read the parser's tolerances + the renderer's error path).
- One correct minimal example per sub-type.

### 2. Write the skill body (`skl_definitions.body`, ~250-400 lines markdown)
Structure that works (mermaid's body is the template):
1. **What it is** — one fence/tag per block; renders live + becomes an editable/persisted artifact; never wrap in `<artifact>` if it's a fence.
2. **When to use which sub-type** — an intent→type table, presented as the user-facing features.
3. **Fence/tag + structure rules.**
4. **Syntax rules that prevent render failures** — the real breakage class, each with wrong→right.
5. **Sizing/limits.**
6. **Editing etiquette** — return ONE complete updated block, preserve untouched ids, keep the type.
7. **Per-sub-type quick reference** — one correct example each (this is what would have been `skl_resources`; it lives in the body).

Row fields: `skill_id` (kebab business key, UNIQUE), `skill_type='render_block'`, `is_system=true`, `is_public=true`, scope columns (`user_id`/`organization_id`/`project_id`/`task_id`) **NULL** = global, `category_id` → the `skl_categories` `render-blocks` row (create with `ON CONFLICT (category_key) DO NOTHING` if absent), `platform_targets='["web"]'::jsonb`, `version`. **Pre-check live**: existing `is_system=true` rows' `user_id` convention; `skl_definitions.skill_id` is UNIQUE per `(skill_id,user_id,org,project)` composite → use `INSERT … SELECT … WHERE NOT EXISTS` (NOT `ON CONFLICT (skill_id)` — that errors on the composite key).

### 3. (Render registry, optional) `skl_render_definitions` + `skl_render_components`
- `skl_render_definitions`: `block_id` (no unique constraint → `WHERE NOT EXISTS`), linked to the skill.
- `skl_render_components`: one `web` row `is_active=true` with the real `import_path`; `chrome-extension`/`desktop`/`mobile` rows `is_active=false` — the explicit notation that those clients await the server-side processing switch. UNIQUE `(render_definition_id, platform)` → `ON CONFLICT DO UPDATE`. **Pre-check** `SELECT DISTINCT platform FROM skl_render_components` for the vocabulary.

### 4. Write the content blocks (`content_blocks` rows)
- A category in `shortcut_categories` (`placement_type='content-block'`, global NULL scope). Name it for the family ("Diagrams", "Education", "Timeline"…). `WHERE NOT EXISTS` (no business-key unique).
- **One block per sub-type** + **a few combos** (each teaches "pick the right type for the job") + **one general** all-types block. Human labels. `block_id` is UNIQUE → `ON CONFLICT (block_id) DO UPDATE`.
- **Template style** (match the existing Timeline/Interactive-Diagram blocks): framing line → one concrete ` ```fence ` example → 3-6 tight rules. **~250-600 chars.** Dollar-quote each (`$CB$…$CB$`) so backticks/quotes need no escaping.
- `icon_name` is cosmetic (the menu uses a generic icon); pick a sensible Lucide name.

### 5. One migration, applied + ledger-recorded
- `migrations/<block>_content_blocks.sql` (or fold into the block's platform migration). `BEGIN; … COMMIT;`, idempotent on business keys.
- Apply from **aidream**: `uv run python db/apply_migrations.py --source matrx-frontend --dry-run` (confirm it'd apply ONLY yours), then without `--dry-run` (applies in a txn + records the ledger). Then `pnpm -s check:migrations` in frontend = clean.
- **No `pnpm db-types` needed** — these are data rows, not schema. (Only run it if you added columns.)

### 6. Verify LIVE (throwaway admin-client query)
```ts
// node --env-file=.env.local --import tsx <script>
import { createAdminClient } from "@/utils/supabase/adminClient";
// SELECT the skl_definitions row (body length, type, is_system, category linked)
// SELECT the content_blocks (all in the new category, is_active, template has the fence)
```
Confirm counts + that each template contains the real fence. Delete the script after.

### 7. Turn-on + hand off (don't auto-attach to a prod agent)
- The skill is **opt-in**: it reaches a prompt only when an agent has it in `agx_agent.skill_config.included` (aidream `skill_merge.apply_unified_skills`). Do NOT mass-attach without the user's call (modifying a shared agent's config is their decision — the auto-classifier will block it, correctly).
- Content blocks are **user-driven**: right-click an agent's instructions → context menu → the category → a block injects. That IS the feature; tell the user the path.

---

## Part 2 — Building a NEW render block end-to-end

Only when the block type doesn't exist. The full layer map (mermaid is the reference implementation — read its diff):

1. **Server (aidream, do FIRST — unblocks type sync):** enum in `processing/blocks/models/base.py`; a Pydantic model + a **forgiving** parser (never raises) in `models/` + `parsers/`; `block_detector.py` (`SPECIAL_CODE_LANGUAGES` + any alias) ; `stream_processor.py` (classification set + parser map); `packages/matrx-connect/.../render_blocks.py` registry (3 entries). Then `pnpm sync-types:fast` (local backend up) → the type lands in `types/python-generated/stream-events.ts`. Tests in `processing/blocks/tests/`; zero integrity-check errors on import.
2. **Client core** `components/<block>/`: a dynamic-import runtime if the renderer is heavy (keep the lib out of the initial bundle), a forgiving sanitizer if the format is fragile, the renderer with last-good behavior during streaming.
3. **Detection (FE):** `content-splitter-v2.ts` `SPECIAL_CODE_LANGUAGES`; `stream-block-accumulator.ts` for live promotion; `BlockComponentRegistry.tsx` + `BlockRenderer.tsx`; the chat wrapper `components/mardown-display/blocks/<block>/<Block>.tsx`; the DB round-trip in `…/utils/assemble-cx-content-blocks.ts` (reconstruct as the SAME fence/tag — the XML-wrapper default corrupts fence types).
4. **Artifact/canvas (if it should persist + edit):** `materialization/materializable-types.ts` + `reconcileArtifacts.ts` marker + `planMaterialization.ts` metadata; `canvas/core/CanvasBody.tsx`, `canvas-block-meta.ts`, `shared/PublicCanvasRenderer.tsx`; `canvasArtifactService` + `useCanvasItem` (latest-version resolution).
5. **Editing (optional):** a doc model + per-type adapters with a **round-trip fidelity gate** (downgrade to code-only rather than ever destroy content), a workbench, session-versioning saves.
6. **Surface + agent round trip (optional):** a `features/surfaces/manifests/<x>.manifest.ts` + registry entry; an "Edit with AI" hook cloned from `features/transcription-cleanup/hooks/useAiPostProcess.ts`.
7. **Then Part 1** (skill + content blocks) + docs + a `/demos` page + `KNOWN_DEFECTS` for any deferred surface.

See the block-registry recipe for the FE-only flavors: `components/mardown-display/chat-markdown/block-registry/ADDING_BLOCKS.md` (mermaid is the Flavor-F worked example).

---

## Gotchas that cost real time

- **Turbopack HMR corrupts after many rapid edits** ("module factory is not available" / renders stick on skeletons app-wide). A browser reload does NOT fix it — **restart the dev server**. First import of a heavy lib chunk also takes 15-40s in dev; skeletons during that window are normal.
- **`pnpm db-types` ≠ `pnpm sync-types`.** db-types regenerates Supabase types (`types/database.types.ts`); sync-types regenerates the Python/stream types (`types/python-generated/stream-events.ts`) from the running backend. A new block type needs sync-types.
- **The tree often has other teams' uncommitted work.** Stage ONLY your files explicitly; never `git add -A`.
- **Pushing `main` deploys + may carry others' commits.** Confirm before pushing if the situation shifted.

## Mermaid reference (copy from these)

- Platform migration: `migrations/mermaid_render_block_platform.sql` (surface + skill + render registry + content block + RPC). Content blocks: `migrations/mermaid_content_blocks.sql` (the 18-block "Diagrams" set — the per-type + combo pattern).
- Handoff (verified-vs-not, file map): `docs/handoffs/MERMAID_RENDER_BLOCK_HANDOFF.md`.
- Frontend commits: `feat(mermaid): first-class … render block`, `feat(mermaid): content blocks per diagram type + combos`. aidream: the mermaid pipeline on `main`.
