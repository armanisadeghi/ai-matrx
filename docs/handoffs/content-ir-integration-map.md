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

## Remaining work

1. **THE NORTH STAR — user-facing custom kinds (Arman, 2026-07-17, verbatim):** "The true value of these kinds can only be realized when we have it FULLY AVAILABLE for users, not for me and the admins. When we can have OUR agent we create that will do this for a user, then we will have massive adoption: 1. Create the kind based on the user's data. 2. Create the custom component for the user. 3. Create the agent skills and render blocks for the user. 4. Then, the user can test it out and the real magic is when the user sees a COMPLETELY customized, beautiful component that they designed with an agent." Requires D4 (sandboxed `source='db'` kind components) + a creator agent + a user test surface.
2. **Deferred — workflow launch** (Arman): "I won't put any time into that system until I'm certain that the inputs and outputs for all fully and properly use the system and there is nothing left to do."

## Rulings (Arman, 2026-07-17)

- **Lane A is cancelled, not pending.** "We would never auto-list a tool like that for all agents… 95% of our calls are designed to be highly deterministic and with small models." Production agents are not touched until the system is fully complete ("I can't roll out a system that is only partially created"). Skill availability = opt-in affordances (the chips) only.
- The education-agent concentration is recency, not signal — they were simply the agents created while this feature was under development.
- The convert-style tool is liked and "we would use it in many places" — but manual, never auto.

## Done

- Lane K3 — the user-facing Shapes studio (`app/(core)/shapes/` + `features/content-ir/studio/`): /shapes list (RLS-scoped mine + platform), /shapes/[kind] Preview/Test/Schema (Test = KindInputForm → live render through the real applyIrKindRoute path; preview engine extracted from admin, one engine), /shapes/new create-with-agent handoff to `/chat/a/[agentId]` via `stashChatDraftTransfer`, sidebar nav + /shapes/admin map. **OPEN wire-up: paste K2's creator-agent id into `features/content-ir/studio/constants.ts#SHAPE_CREATOR_AGENT_ID`** (until then /shapes/new shows the loud not-configured card).
- Lane D — shape discovery chips ("Shapes" row in Quickset: Flashcards/Quiz/Timeline/Comparison/Diagram, gated on the live skill list, toggling `addedSkills` → `skill_config.included`) + "Convert to flashcards / quiz…" on assistant messages with a table/list (`messageActionRegistry` → canonical `ConvertContentDialog`; artifact lineage-links to the conversation; SHAPE_SYSTEM.md Convert Pattern lists chat as a shipped surface). Browser-verified end-to-end (chip → in-chat flashcard block; convert → real fc_set). `flashcard-set` skill re-activated in `skill.definition`.
- Lane B — "Bind to a kind" picker + matches/drift indicator in the builder's Output Schema tab — see `features/agents/components/settings-management/output-schema/` (kindBinding.ts golden-tested byte-equal to flashcard_set's live `emitted_block_schema`).
- Lane C — education content rendering is kind-aware (`onboard/SummaryDetail.tsx` → `MarkdownStream`; all other surfaces already kind-correct) — see `features/education/FEATURE.md`.

