---
name: project_render_block_skill_campaign
description: content-ir kind registry productionized + render-block skill campaign (28 skills, every agent-authored block captured)
metadata:
  type: project
---

The 2026-07-05 push that productionized [[project_content_ir_system]] and captured every render block as a platform skill.

**Kind registry (content_ir):** migrated off `public.flexible_data` onto canonical `content_ir.kind_definition` / `kind_edge` (+ `kind_definition_version` VIEW over `history.row_versions`), provisioned via `platform.create_entity_table` (variant `system`). Design spec: `features/content-ir/docs/KIND_REGISTRY_STORAGE.md`. Pure primitives: `kind-storage-transform.ts` (KindSchema⇄data[]+edges), `kind-dual-gate.ts` (Arman's law: sample must pass ajv-over-emitted_json_schema + bridge-produces-real-serverData), `schema-source-kind-tables.ts` (read adapter, per-kind resilient). Driver `scripts/migrate-content-ir-kinds.ts` (dry-run/apply/verify). 26 kinds migrated `visibility=public` (private+global_readable-org grants 0 authed reads — must be public). `kindRegistry` now reads content_ir; compiled `system-kinds.ts` = bootstrap floor; `flexible_data` untouched (rollback). `is_active` = dual-gate verdict; 2 active (flashcard_set, quiz_set), rest held pending samples.

**Skill campaign — 28 render-block skills in `skill.definition` (skill_type='render_block').** Shared categories: skill dim `49c845cb-9314-485c-88ed-a7ace4f286ca`, content-block (shortcut dim) `6913d9fc-b8c0-4107-af40-27d55c177694`. Org = Matrx System `39c38960-…` (org NOT NULL = "global"). Recipe: `.claude/skills/create-render-block-skill` BUT tables reorg'd (`skl_*`→`skill.*`, categories→`platform.categories`). Briefs: `docs/KIND_SKILL_BRIEF.md` (__kind JSON) + `docs/RENDER_BLOCK_SKILL_BRIEF_FENCE.md` (fence/tag). Wave 1 = 9 __kind kinds; Wave 2 = 10 fence/tag (migrations `kind_*_skill.sql` / `rb_*_skill.sql`). **Coexist, never clobber** legacy blocks (new `<x>-kind`/`<x>-block` ids). Every wave used parallel builder fleet → adversarial reviewers (caught real bugs: presentation missing org_id, react phantom hooks, resources v2 clobber) → normalize+apply.

**GOTCHA:** a mid-run apply agent silently partial-applied (2/10) and returned a confused report — ALWAYS verify the live DB counts yourself, never trust the agent's "done". **Activation loop = the USER's step:** prompt the chat agent for a `<kind>` sample → `content_ir.sample_data` → dual gate → `is_active` (agent-generated, not hand-authored — real validation).

**OPEN:** `presentation_slide.emitted_block_schema` stale (omits `extra`/`preset` the renderer uses — widen via emitter, not a jsonb hand-edit); 3 no-component roots (q_and_a_set, study_pack_set, schema_showcase) need Part 2 render components (design work, do with user); ResearchBlock parser↔renderer gap (Analysis/Recommendations tabs unpopulated); transcript intentionally skipped (data-display, not agent-authored).
