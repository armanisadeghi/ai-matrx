---
status: active
updated: 2026-07-17
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/common-docs/content-ir-system/FEATURE.md, /Users/armanisadeghi/code/common-docs/content-ir-system/OWNER_BRIEF.md]
---

# Content IR — integration pull-through (make agents actually emit shapes)

## Vision — Arman's words

- "We haven't been able to do anything with this system because it's just sitting and not doing anything because it's not being integrated so your first task is to **fully integrate it**."
- On tables (ratified pattern, applies platform-wide): "tables need to stay exactly as they are… markdown core content… but there is a button to convert. Not only do we want to keep this but this is a **CRITICAL pattern to document, appreciate and adopt**. Some items simply don't start and instantly be the `__kind` but you **click to convert**!"
- On enforcement: tools first ("shouldn't tools be the easiest because it's something that should just work and it's easy to test"); actions/workflows were never officially rolled out (~1 real action user).

## The measured problem (live DB, 14-day window, 2026-07-15)

Only **94 of 2,712 assistant messages (3.5%)** across **72 of 1,469 conversations (~5%)** carried any `__kind` block. Every meaningful emitter is an education agent with a hand-bound `output_schema` (Flashcard Generator (K), Study Mind Map Generator, …). The **45 render_block skills produce ~zero emission** — only 10 of 645 active agents have any `skill_config`, mostly `(sample)` demos. Counting caveat: use `strpos(content,'__kind')`, never `LIKE '%__kind%'` (`_` is a LIKE wildcard; it over-counts).

## Resources

- Skill injection: `aidream/packages/matrx-ai/matrx_ai/skills/resolver.py:89-105` (included → full body) vs `:61-65` (everyone else gets a one-line overview); merge at `aidream/aidream/services/tooling/skill_merge.py:333-420`. Preamble frozen per request (`skill_merge.py:13,18`) — attaching skills is additive/cache-safe.
- The working emission channel: `aidream/aidream/services/ai_execution/ai_task.py:46,76-95,243-273` — `output_schema` → `agent_output_contract` → `response_format_for_kind`. Live and proven.
- Builder output-schema UI (kind-aware since Lane B): `features/agents/components/settings-management/output-schema/OutputSchemaTab.tsx`; kind catalog reader: `features/content-ir/registry/kind-catalog.ts`.
- Kind-aware renderer: `EnhancedChatMarkdown` → `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx`. Education instead uses `BasicMarkdownContent` (no kind detection).
- Per-run skill picker plumbing: `features/agents/components/inputs/smart-input/RunSkillPicker.tsx`, mounted in `QuicksetPanel`/`RunControlsTabPanel`.
- Message actions: `features/agents/.../message-options/messageActionRegistry.ts`. Generative-only creation exemplar: `features/flashcards/components/create/CreateFromTopic.tsx`.
- Test: dev-login per CLAUDE.md; `/chat` "make me 5 flashcards…" exercises the render path.
- Chat linkage for metrics: `chat.conversation.initial_agent_id` (message-level `agent_id` is null); live agents table is `agent.definition`.

## Remaining work (ranked; lanes A–D are independent, no file overlap)

1. **Lane A — attach render_block skills so agents can actually emit.** Curate the high-value skills (flashcard_set, quiz_set, timeline, comparison_set, mermaid) onto default/general chat agents via `agent.definition.skill_config.included`, and/or auto-`list` render_block skills in `resolver.py` so every agent sees them by name and can `skill_get`. Backend + DB rows only. Trap: verify prompt-cache stability stays intact (additive only).
2. **Lane D — discovery chips + click-to-convert.** (a) Shape chips in `QuicksetPanel` ("Flashcards", "Quiz", …) that add the skill to the run's `included` via RunSkillPicker plumbing. (b) A "Convert to flashcards/quiz" message/block action feeding the selected table/list to the existing structured-output agents — the ratified convert pattern's first chat affordance. Smart-input + messageActionRegistry only.
3. **Deferred — workflow demand** (31 defs, 69 runs/30d, envelopes consumed only by Studio): plumbing done; gap is usage, not integration.

## Done

- Lane B — "Bind to a kind" picker + matches/drift indicator in the builder's Output Schema tab — see `features/agents/components/settings-management/output-schema/` (kindBinding.ts golden-tested byte-equal to flashcard_set's live `emitted_block_schema`).
- Lane C — education content rendering is kind-aware (`onboard/SummaryDetail.tsx` → `MarkdownStream`; all other surfaces already kind-correct) — see `features/education/FEATURE.md`.

## Decisions needed

- **Lane A curation.** Situation: attaching skills changes which agents advertise shape emission; "which default agents" is product curation. Decide: bless a curated default set (the general chat agents) vs auto-`list` for all agents vs both. Best-practice lean recorded in lane brief: auto-`list` platform-wide (discovery without prompt bloat) + `included` for a small curated set.
