---
status: active
updated: 2026-07-08
repos: [matrx-frontend, aidream]
vision: [features/content-ir/docs/SHAPE_SYSTEM.md, features/content-ir/docs/content-ir-kind-full-system.md]
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

- **Read first:** `features/content-ir/docs/SHAPE_SYSTEM.md` (rulings R1–R10, posture, roadmap, laws). Feature invariants: `features/content-ir/FEATURE.md`.
- **Agent skills:** `.claude/skills/shape-system/` (add/activate a kind — the paved road). aidream: `.claude/skills/workflow-io-kinds/` + `docs/workflow/KINDS_ROLLOUT.md`.
- **DB (project `txzxabzwovsujtloxrus`):** `content_ir.kind_definition` / `kind_edge` / `kind_component` / `kind_surface` / `kind_example`. Skills in `skill.definition` (NO `is_public`/`user_id`; version string is `semver`, `version` is int, owner is `created_by`). Blocks in `public.content_blocks`.
- **Tools:** `pnpm check:shapes[:strict|:refresh]` (generated tracker — never hand-edit `SHAPES_STATUS.md`), `pnpm shape:sample`, `pnpm shape:activate [slugs] --apply`, `pnpm shape:revalidate --apply`.
- **Key seams:** `registry/component-registry.ts` (resolver) · `react/kind-route.ts` (R6 gate + generic fallback) · `surfaces/xml-finalize.ts` (the ONE strategy map, XML + fence) · `registry/system-kinds.ts` / `system-surfaces.ts` / `system-components.ts` (compiled floor) · `registry/kind-dual-gate.ts`.
- **Admin:** `/administration/kind-registry` (status board) and `/administration/kind-registry/<kind>` (Preview / Gate / Schema / Assets / Inputs). Login `/login` → `admin@admin.com` / `Password1234#`.
- **Python:** `matrx_graph/kinds.py` (catalog) · `matrx_ai/kinds.py#response_format_for_kind` · `matrx_ai/processing/blocks/envelope.py` (emission) · `fingerprint.py` + shared vectors in `tests/fixtures/fingerprint_vectors.json`.

**Traps that already bit (do not relearn):**
- `platform._touch_row` bumps `kind_definition.version` on **every** update — including an `is_active` flip. That strands version-bound `kind_example` rows. Heal with `pnpm shape:revalidate --apply`.
- **Never re-derive "region complete" from block content.** The accumulator rewrites simple-XML content (strips tags). Use the state machine's `xmlClosedCleanly` / `fenceClosedCleanly` facts. This silently killed the XML keystone once.
- Every kind schema is `additionalProperties:false` and none declares `__kind` — Python emission must route unknown keys through the residue channel.
- The dual gate's **render leg reads a compiled TS facet** (`SYSTEM_KIND_DEFINITIONS`), not a DB `kind_component` row. A DB row alone cannot activate a kind.

## Remaining work

1. **Converter emits a CLOSED empty object for open `inline_object`** — blocks `schema_proposal` (structurally fails its own gate; only `{}` validates) and weakens `item_presentation`. In `convert/kind-to-json-schema.ts`, an `inline_object` with `fields: {}` should emit `additionalProperties: true`. Then regenerate the affected kinds' `emitted_json_schema` (also `flashcard_set.additionalDetails`, `flashcard`, `quiz_set` — latent, currently masked because examples omit the field), re-run `pnpm shape:activate --apply`, and `pnpm shape:revalidate --apply`. **Trap:** changing the converter makes every stored `emitted_*` schema stale until regenerated.

2. **Activate the three generic roots.** `q_and_a_set`, `study_pack_set`, `schema_showcase` render today (generic fallback wired at `react/kind-route.ts` → `BlockRenderer`) and have validated examples + `generic_structured` component rows, but stay inactive because the render leg needs a compiled facet. Add three `KindDefinition`s with `legacyBlockType: "generic_structured"` to `registry/system-kinds.ts`, then `pnpm shape:activate q_and_a_set study_pack_set schema_showcase --apply`. **Trap:** `system-components.ts` is derived by construction from `SYSTEM_KIND_DEFINITIONS` — don't hand-edit it.
   - Also latent: `study_pack_set.emitted_json_schema` has a dangling `flashcard_set_beta` `$def` typed as bare `{"type":"object"}`, so its `included_sets` leg accepts anything. Its structural gate is weaker than it looks.

3. **Python parser ↔ kind schema drift — 8 block types cannot emit `__ir`.** Each is a real mismatch, not a wiring gap: `flashcards` (kind requires `title`, parser has none), `quiz` (parser emits `quizTitle`/`multipleChoice`; kind wants `title`/`questions`), `mermaid` (`source` vs required `code`), `progress_tracker` (`categories` vs required `phases`), `resources` (`items` vs required `resources`), `math_problem` (parser wraps the root), `presentation_slide.extra.content` (typed `string`, parser emits a list), `structured_info` (no parser at all). Decide per type: widen the kind, or fix the Python parser. Files: `aidream/packages/matrx-ai/matrx_ai/processing/blocks/` (parsers + `envelope.py` mapping table).

4. **Kind-catalog warm-up in the Python emitter.** `get_kind` is async, `process_token` is sync; a cold snapshot means no stamp (logged loudly). One line — `await prime_kind_catalog()` in `BlockStreamingEmitter.send_chunk` — closes the gap.

5. **`IrDiscriminator.json` hard-types `key: "__kind"`.** Python stamps JSON blocks detected by legacy wrapper keys (`quiz_title`, `diagram`…), which that type misdescribes. Widen to `key: string` in `features/content-ir/core/ir-types.ts`.

6. **Stage 5a — one detection list.** 14 `detector-token-unregistered` yellows remain (see `pnpm check:shapes`). Generate `system-surfaces.ts` + a Python twin from `kind_surface` so the frozen literal sets in `stream-block-accumulator.ts` / `content-splitter-v2.ts` / `block_detector.py` can be deleted (Phase 7). Control tags (`thinking`/`reasoning`/`plan`/…) and editor pills are **code-owned, not Shapes** (R2).

7. **Remaining tracker gaps** (`pnpm check:shapes`, 51 yellows, all real): 30 `no-example` on child kinds (closeable via `pnpm shape:sample`), 10 `stale-example`, and `no-skill`/`no-content-block` on the two genuine roots `schema_showcase` + `study_pack_set`.

8. **Stage 7 (later, per Arman's ordering):** tool `output_kind` (tools render fine today — canonicalize LAST) · **React Native component map** (first external platform) · user/org render preferences + variations · `canvas_items.state` for stateful Shapes (R7).

## Done

- Keystone: any surface (XML tag, fence, `__kind` JSON) converges to one canonical envelope — `surfaces/xml-finalize.ts`, proven by `__tests__/all-surfaces-convergence.test.ts`.
- Component resolver + R6 gate + generic fallback — `registry/component-registry.ts`, `react/kind-route.ts`.
- 71 kinds · 19 active · 23 component rows · 14 surfaces — 21 kind families engineered from component reality.
- skl dormant registry annihilated — `graveyard.render_component`; palette `skill.render_definition` survives.
- Workflow node I/O speaks kinds — `aidream/packages/matrx-graph/matrx_graph/kinds.py`, `types/node_spec.py`.
- Python emits canonical `__ir` for 9 block types — `aidream/packages/matrx-ai/matrx_ai/processing/blocks/envelope.py`.
- Generated tracker + honest `n/a` classification — `registry/shape-doctor.ts`, `pnpm check:shapes`.
- kind ⇄ `VariableDefinition` / ContextSlot converter + Inputs tab — `convert/kind-variable-bridge.ts`, `admin/KindInputsTab.tsx`.
- Agent-facing paved road — `.claude/skills/shape-system/`, `.claude/skills/workflow-io-kinds/` (aidream).

## Decisions needed

**1. Should a content block and the skill it teaches be linked, and does that link convey access?**

*Situation.* Each kind has a teaching skill (`skill.definition`) and two context-menu snippets (`public.content_blocks`). Nothing records which blocks teach which skill. Writing that link requires first registering the `(content_block → skill)` pair in `platform.association_types`, which encodes direction and conveyance — the system auto-orients edges from that rule. The 20 edges are pure metadata; nothing functional depends on them. Migration is staged and skip-marked at `migrations/content_ir_skill_block_associations.sql`.

*Decide.* Either (a) register the pair yourself in `/administration/relationships` with the direction/conveyance you want, then apply Section 2 of that file; or (b) accept the staged neutral registration (`container_side='none'`, `conveys_max='viewer'`, direction `content_block → skill` per the existing "little points to big" doctrine — no access cascade), remove the `-- migrate: skip:` line, apply, and ledger it.

**2. When a Python parser and its kind schema disagree, which one moves?**

*Situation.* Eight block types (listed in Remaining work #3) have a parser whose output shape does not match the kind's schema — e.g. the mermaid parser emits `source`, the kind requires `code`; the quiz parser emits `quizTitle`/`multipleChoice`, the kind requires `title`/`questions`. Both sides are live and working. Whichever side moves, the other's producers must follow. Renaming a kind field breaks agents already taught the current schema by its skill; changing a parser risks the existing render path.

*Decide.* Default per type, or a blanket rule: (a) the **kind** is canonical — fix the Python parsers to emit kind-shaped values; (b) the **parser** is canonical — widen each kind schema (add aliases like `set_title` already does for `flashcard_set`); or (c) case-by-case, and you'll rule on each.
