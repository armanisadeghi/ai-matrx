---
status: active
updated: 2026-07-10
repos: [matrx-frontend, aidream]
vision: [features/content-ir/docs/SHAPE_SYSTEM.md, features/content-ir/docs/content-ir-kind-full-system.md, aidream/docs/workflow/CONTENT_IR_STUDIO_SPEC.md]
---

# Shape System

## Vision — Arman's words

> "Our main focus is Matrx-Frontend and AI Dream… We have a single unifying system that allows LLM outputs to tool inputs and tool outputs, workflow inputs and outputs, node inputs and node outputs, and several of the other things I mentioned to work together."

> "The entire rendering system belongs to a system in content-splitter-v2 where xml, json, and some markdown were converted and rendered. Now, we're coming in to 'borrow' that system but borrow means share nicely and help them transition to us and help them transition to a **dual mode where xml works and our system works because they serve two purposes**."

> "Neither is better or worse… they're different. However, the goal is for us to be able to easily translate the xml into the `__kind` and then render it. The moment we can do that, now, **any agent, tool, node, or whatever that produces either format will properly render**."

> "The next challenge is to then build that validation into python and js. The final challenge is to custom render it in react next.js, vite, html/js, react native, etc. Then… provide variations and have them render by user preferences and org preferences (later)"

> "We need to create a system that **AGENTS WILL WANT to add to**… adoption feels easy, especially for agents… anything that Is still not plugged into it 'feels off'."

> On importance: "the things that adhere to it right now are those that were so meaningless that we could just slap this new system on… The things that don't follow it are the mission-critical things." → **Adoption = bridging real systems IN, not polishing testbeds.**

> "One game changer would be if we have a simple kind↔agent spec converter for the variables and context slots. That would allow a lot to happen."

> Standing rule (association system): hierarchy/direction/conveyance is **Arman's call** via `/administration/relationships`; leave neutral and ask.

## Resources

- **Read first:** `features/content-ir/docs/SHAPE_SYSTEM.md` (rulings R1–R10, posture, roadmap, laws). Feature invariants: `features/content-ir/FEATURE.md`. Workflow-side spec: `aidream/docs/workflow/CONTENT_IR_STUDIO_SPEC.md` (Content-IR P1–P3, status BUILT except one deferred P3 bullet) + `aidream/docs/workflow/NODE_RESULT_CONTRACT.md` + `NODE_RESULT_MIGRATION.md` (126/126 nodes migrated, legacy bare-payload branch deleted).
- **Cross-repo twin doc:** `/Users/armanisadeghi/code/common-docs/content-ir-twin/FEATURE.md` — read before touching `core/`, `session/`, `registry/{kind-registry.types,kind-storage-transform,kind-dual-gate}.ts`, or `convert/{openai-schema-converter,kind-to-json-schema}.ts` in EITHER repo. These are verbatim-copied into `aidream/apps/shared/content-ir-core/` (hash-pinned by `TWIN_MANIFEST.json`); matrx-frontend is the sole authoring point. After editing any twinned file, run `python scripts/sync_content_ir_core.py` from the aidream repo root, or `python3 scripts/check_content_ir_twin.py` (wired into aidream's release guard) will fail. `convert/kind-variable-bridge.ts` is explicitly NOT twinned.
- **Agent skills:** `.claude/skills/shape-system/` (add/activate a kind — the paved road; does not yet mention the twin package). aidream: `.claude/skills/workflow-io-kinds/` + `docs/workflow/KINDS_ROLLOUT.md`.
- **DB (project `txzxabzwovsujtloxrus`):** `content_ir.kind_definition` / `kind_edge` / `kind_component` / `kind_surface` / `kind_example`. Skills in `skill.definition` (NO `is_public`/`user_id`; version string is `semver`, `version` is int, owner is `created_by`). Blocks in `public.content_blocks`. `kind_component.platform` CHECK constraint allows only `web|vite|react-native|chrome-extension|desktop|html-js` — workflow-studio rows use `'vite'`, not `'studio'`.
- **Tools:** `pnpm check:shapes[:strict|:refresh]` (generated tracker — never hand-edit `SHAPES_STATUS.md`; hits the live DB directly via `.env.local` service-role key, works without the Supabase MCP), `pnpm shape:sample`, `pnpm shape:activate [slugs] --apply`, `pnpm shape:revalidate --apply`. aidream: `python3 scripts/check_content_ir_twin.py` (twin drift guard), `vitest run` in `apps/shared/content-ir-core/` and `apps/workflow-studio/`.
- **Key seams:** `registry/component-registry.ts` (resolver) · `react/kind-route.ts` (R6 gate; `GENERIC_STRUCTURED_COMPONENT_KEY` no-component fallback landed 2026-07-08) · `surfaces/xml-finalize.ts` (the ONE strategy map, XML + fence) · `registry/system-kinds.ts` / `system-surfaces.ts` / `system-components.ts` (compiled floor, hand-written) · `registry/kind-dual-gate.ts`.
- **aidream kind-catalog surface:** `aidream/services/ai_execution/ai_task_blocks.py` (`BlockStreamingEmitter` — chat-stream `__ir` emission, NOT in matrx-ai) · `aidream/services/runtime/kind_catalog.py` + `aidream/api/routers/workflow.py:746-791` (`GET /workflow/kinds[/{slug}]`, public-visibility only, etag-cached) · `packages/matrx-graph/matrx_graph/kinds.py` (`check_against_kind` → `KindCheck{checked,errors}`, wraps `validate_against_kind`) · `packages/matrx-ai/matrx_ai/processing/blocks/envelope.py` (`BLOCK_KIND_MAP`, chat-block emission).
- **workflow-studio content-ir surface:** `apps/workflow-studio/src/lib/content-ir/{kinds,classify,kind-resolver,component-registry}.ts` (kind catalog + the ONE classify funnel, routed through the twin kernel) · `apps/workflow-studio/src/features/canvas/inspector/kind-picker.tsx` (`DataShapeSection`, writes `data.input_kind`/`data.output_kind`) · `apps/workflow-studio/src/components/kind-blocks/{archetype-blocks,generic-structured-block}.tsx`.
- **Admin:** `/administration/kind-registry` (status board) and `/administration/kind-registry/<kind>` (Preview / Gate / Schema / Assets / Inputs). Login `/login` → `admin@admin.com` / `Password1234#`.

**Traps that already bit (do not relearn):**
- `platform._touch_row` bumps `kind_definition.version` on **every** update — including an `is_active` flip. That strands version-bound `kind_example` rows. Heal with `pnpm shape:revalidate --apply`.
- **Never re-derive "region complete" from block content.** The accumulator rewrites simple-XML content (strips tags). Use the state machine's `xmlClosedCleanly` / `fenceClosedCleanly` facts. This silently killed the XML keystone once.
- Every kind schema is `additionalProperties:false` and none declares `__kind` — Python emission must route unknown keys through the residue channel.
- The dual gate's **render leg reads a compiled TS facet** (`SYSTEM_KIND_DEFINITIONS`), not a DB `kind_component` row. A DB row alone cannot activate a kind.
- **A raw-SQL→ORM conversion silently dropped two live DB columns once** (`workflow.node_outcome.output_kind_ok/_errors` disappeared from the upsert path for ~2 hours until caught — aidream commit `d91bba130`). Any future raw-SQL→ORM conversion touching a wide column list needs an explicit before/after column-parity check.
- `aidream/db/MIGRATIONS_STATUS.md` is a point-in-time snapshot from `db/detect_applied.py`, not live — it was stale by hours relative to same-day migrations during this work. Regenerate before trusting it.
- Two DIFFERENT validation surfaces both use the kind registry and are easy to conflate: (1) `matrx_ai.processing.blocks.envelope.py` validates chat-stream render blocks before stamping `__ir` (gates Remaining-work #3 below); (2) `matrx_graph.kinds.check_against_kind` validates workflow-graph `NodeResult` payloads against a node's declared `output_kind`, surfaced on `node_completed`/`workflow.node_outcome` (shipped 2026-07-09, unrelated call site, does not touch #3).

## Remaining work

0. **The generated tracker is drifted — refresh first.** `pnpm check:shapes` currently reports **1 red (`snapshot-drift`)**: the committed `SHAPES_STATUS.md`/`shapes-status.json` says 71 kinds, live DB has 76 (5 new inactive archetype kinds — `bulk_result`, `items`, `operation_result`, `page`, `value` — seeded by aidream's `wf_013_archetype_kinds.sql`/`wf_014_archetype_kind_components.sql`, `authoring_owner:'python'`, structurally `n/a` on all render facets). Run `pnpm check:shapes:refresh` and commit before other Shape work, so the doctor's baseline is trustworthy.

1. **Converter emits a CLOSED empty object for open `inline_object`** — still unfixed. `convert/kind-to-json-schema.ts`'s `inline_object` case unconditionally sets `additionalProperties:false` in strict mode regardless of whether `fields` is empty, so `schema_proposal.schema` (`{type:"inline_object", fields:{}, required:true}`) can only ever validate `{}`. Live-reproduced just now: `pnpm check:shapes` shows `schema_proposal` failing its recomputed gate on `/schema must NOT have additional properties`. Fix in `convert/kind-to-json-schema.ts`, regenerate the affected `emitted_json_schema`s (also latent on `flashcard_set.additionalDetails`, `flashcard`, `quiz_set`, `decision_tree`, `comparison_set`, `presentation_deck`, `item_presentation` — all currently masked because their examples omit the field), then `pnpm shape:activate --apply` + `pnpm shape:revalidate --apply`. **Trap:** this file is twinned into aidream — run the sync script after.

2. **Activate the three generic roots** — `q_and_a_set`, `study_pack_set`, `schema_showcase` still inactive; `system-kinds.ts` has no entry for them. The render-side blocker is gone: `GenericStructuredBlock` (the official R6 no-component fallback, `GENERIC_STRUCTURED_COMPONENT_KEY` in `react/kind-route.ts`) landed 2026-07-08. Remaining step is purely: add three `KindDefinition`s with `legacyBlockType: "generic_structured"` to `system-kinds.ts`, then `pnpm shape:activate q_and_a_set study_pack_set schema_showcase --apply`.
   - Also latent: `study_pack_set.emitted_json_schema` has a dangling `flashcard_set_beta` `$def` typed as bare `{"type":"object"}`, so its `included_sets` leg accepts anything.

3. **Chat-block Python parser ↔ kind schema drift — 8 block types cannot emit `__ir`.** Unchanged from before, re-verified field-for-field against current parser source: `flashcards` (parser has no `title`), `quiz` (parser emits `quiz_title`/`multiple_choice`; kind wants `title`/`questions`), `mermaid` (`source` vs required `code`), `progress_tracker` (`categories` vs required `phases`), `resources` (`categories`/`items` vs required `resources`), `math_problem` (parser wraps the root under a `math_problem` key), `presentation_slide.extra.content` (kind types it `string`, parser can emit a list), `structured_info` (registered as plain text — no parser populates `block.data` at all). `packages/matrx-ai/matrx_ai/processing/blocks/envelope.py`'s `BLOCK_KIND_MAP` still excludes all 8 with the same documented reasons. This gates ONLY the chat-stream `__ir` emission path (`envelope.py`) — it is separate from the newer workflow-node `output_kind_ok` verification (item below), which does not touch these parsers. Also unresolved: workflow-graph-stream `__ir` stamping ("P3 envelope hand-off") is explicitly deferred in `CONTENT_IR_STUDIO_SPEC.md` — no producer exists yet on the matrx-graph side, and `readEnvelope`/`sanitizeInboundEnvelopeMetadata` aren't in the twin package.

4. **Kind-catalog warm-up in the Python emitter.** `get_kind` is async; `BlockStreamingEmitter.send_chunk` (`aidream/services/ai_execution/ai_task_blocks.py`) calls the sync `process_token` with no `await prime_kind_catalog()` — confirmed still absent (`prime_kind_catalog` has zero call sites outside its own definition/docstring). Cold-catalog blocks get no `__ir` stamp on first emission.

5. **`IrDiscriminator.json` hard-types `key: "__kind"`.** Still unwidened in `features/content-ir/core/ir-types.ts` and byte-identical in the twin — Python stamps JSON blocks detected by legacy wrapper keys (`quiz_title`, `diagram`…) that this type misdescribes. **Trap:** twinned file, sync after editing.

6. **The kind↔variable converter under-reports losses.** `kindFieldsToVariableDefinitions` (`convert/kind-variable-bridge.ts`, NOT twinned) still returns a bare `VariableDefinition[]` with no loss channel — array/object fields silently flatten to `string` with zero recorded loss. `admin/KindInputsTab.tsx` works around this today by rendering two separate honesty channels (the converter's `losses[]` plus its own before/after type-drift table) rather than one unified report. Until the forward converter carries its own loss report, `losses[]` alone is not proof of a lossless round trip.

7. **Stage 5a — one detection list.** `system-surfaces.ts` is still a hand-written array, not generated from `kind_surface`; no Python twin generator exists. 13 `detector-token-unregistered` yellows remain (`pnpm check:shapes`): `artifact, audiocite, comparison_table, decision_tree, decision, diagram, editor_code_snippet, editor_error, item_presentation, math_problem, presentation, quiz, schema_proposal`. Control tags and editor pills stay code-owned, not Shapes (R2).

8. **Remaining tracker gaps** (`pnpm check:shapes`, post-refresh): 32 `no-example` on child kinds (closeable via `pnpm shape:sample`), 1 `stale-example` (`map_result`), `no-skill`/`no-content-block` on the two genuine roots `schema_showcase` + `study_pack_set`.

9. **Stage 7 (later, per Arman's ordering):** tool `output_kind` (tools render fine today — canonicalize LAST) · **React Native component map** (first external platform) · user/org render preferences + variations · `canvas_items.state` for stateful Shapes (R7).

## Done

- Keystone: any surface (XML tag, fence, `__kind` JSON) converges to one canonical envelope — `surfaces/xml-finalize.ts`, proven by `__tests__/all-surfaces-convergence.test.ts`.
- Component resolver + R6 gate + generic-structured no-component fallback — `registry/component-registry.ts`, `react/kind-route.ts`.
- 76 kinds · 19 active · 21 kind families engineered from component reality.
- skl dormant registry annihilated — `graveyard.render_component`; palette `skill.render_definition` survives.
- Workflow node I/O speaks kinds; input/output-kind verification (`checked`/`errors`, never conflating skip with pass) surfaced on `node_completed` + `workflow.node_outcome` — `matrx_graph/kinds.py`, `types/events.py`, `executor/scheduler.py`, migration `wf_008`.
- 126/126 workflow nodes migrated off the legacy bare-payload return shape; ratchet held at zero — `docs/workflow/NODE_RESULT_MIGRATION.md`.
- Python emits canonical `__ir` for the block types whose parser output matches its kind schema — `matrx_ai/processing/blocks/envelope.py`.
- `GET /workflow/kinds[/{slug}]` — public read endpoint over `content_ir.kind_definition`+edges+components+surfaces+examples — `aidream/api/routers/workflow.py`, `services/runtime/kind_catalog.py`.
- `@matrx-ui/content-ir-core` — verbatim, hash-pinned twin of the pure kernel in aidream (`apps/shared/content-ir-core/`); workflow-studio's Content-IR P1–P3 shipped on top of it (kind pickers/authoring, classify funnel, kind resolver, markdown renderer, shape-verified badge, archetype block renderers) — `aidream/docs/workflow/CONTENT_IR_STUDIO_SPEC.md`.
- Generated tracker + honest `n/a` classification for data-only/nested-child kinds — `registry/shape-doctor.ts`, `pnpm check:shapes`.
- kind ⇄ `VariableDefinition` / ContextSlot converter (reverse direction) + Inputs tab — `convert/kind-variable-bridge.ts`, `admin/KindInputsTab.tsx`.
- Agent-facing paved road — `.claude/skills/shape-system/`, `.claude/skills/workflow-io-kinds/` (aidream).

## Decisions needed

**1. Should a content block and the skill it teaches be linked, and does that link convey access?**

*Situation.* Each kind has a teaching skill (`skill.definition`) and two context-menu snippets (`public.content_blocks`). Nothing records which blocks teach which skill. Writing that link requires first registering the `(content_block → skill)` pair in `platform.association_types`, which encodes direction and conveyance — the system auto-orients edges from that rule. The 20 edges are pure metadata; nothing functional depends on them. Migration is staged and skip-marked at `migrations/content_ir_skill_block_associations.sql` — unchanged since it was written, not applied.

*Decide.* Either (a) register the pair yourself in `/administration/relationships` with the direction/conveyance you want, then apply Section 2 of that file; or (b) accept the staged neutral registration (`container_side='none'`, `conveys_max='viewer'`, direction `content_block → skill` per the existing "little points to big" doctrine — no access cascade), remove the `-- migrate: skip:` line, apply, and ledger it.

**2. When a chat-block Python parser and its kind schema disagree, which one moves?**

*Situation.* Eight block types (Remaining work #3) have a parser whose output shape does not match the kind's schema. Both sides are live and working. No ruling has been made anywhere (checked commit history, docs, code comments). One data point exists from an adjacent-but-different system: when the newer workflow-node `output_kind_ok` verification caught two workflow-node kinds (`http_response`, `workflow_run_result`) with stale schemas, the kind schemas were regenerated from the live pydantic models (aidream commit `628ecfb43`) — the kind moved to match the code. That precedent is from the workflow-node validation surface, not the chat-block parser surface this decision covers, so it isn't directly binding.

*Decide.* Default per type, or a blanket rule: (a) the **kind** is canonical — fix the Python parsers to emit kind-shaped values; (b) the **parser** is canonical — widen each kind schema (add aliases like `set_title` already does for `flashcard_set`); or (c) case-by-case, and you'll rule on each.
