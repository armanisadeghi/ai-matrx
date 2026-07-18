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

1. **Deploy aidream to prod** (owner ask, still open — `bash scripts/release.sh`): everything server-side (envelope producer, typed agent projections, tool stamping, the kind_creator agent + toolset, enforcement machinery OFF) is on `main` but inert in prod until deployed. After deploy: read tool_io drift logs → tools-first enforcement flip per the ratified order.
2. **North-star riders** (the loop is LIVE and first-try-polished; these deepen it): FE incident reporter (render errors → `content_ir.kind_component_incident` so the agent's resolve loop sees real crashes), richer dedicated input components beyond `generic_structured`, tool_ui subsumption (kind components absorb tool renderers — the ratified unification endgame), agent bulk-bind of the 578 variable-carrying agents once the bridge soaks, D4 extras (React Native/Vite platform bindings).
3. **Deferred — workflow launch** (Arman): "I won't put any time into that system until I'm certain that the inputs and outputs for all fully and properly use the system and there is nothing left to do." E1 (unified pipeline) also remains its own campaign.

## Rulings (Arman, 2026-07-17)

- **Lane A is cancelled, not pending.** "We would never auto-list a tool like that for all agents… 95% of our calls are designed to be highly deterministic and with small models." Production agents are not touched until the system is fully complete ("I can't roll out a system that is only partially created"). Skill availability = opt-in affordances (the chips) only.
- The education-agent concentration is recency, not signal — they were simply the agents created while this feature was under development.
- The convert-style tool is liked and "we would use it in many places" — but manual, never auto.

## Done

- **THE NORTH STAR LOOP — LIVE and verified end-to-end (2026-07-18).** A real-user browser run proved all four steps: /shapes/new → conversation with `kind_creator` (`4f4ffd49-db15-4a2e-b9fe-341ffafc1323`, prompt v2) → kind + custom `source='db'` component + skill + content block created → Test tab renders the user's own data through their own component. Demo left in place: `/shapes/wine_tasting` (+ `/test`), conversation `/chat/4ec4285e-c9ba-4b92-9727-73d6dcffd170`. First-try polish landed post-verification (aidream `a1c4cd360`): props-contract taught + write-time lint (flat-props refused), input row seeded at kind_create, fielded Test form for flat samples, honest props_transform docs, agent guidance points at /shapes. P2s closed (`d82711208`): composer pre-init keystroke drop fixed never-drop + loud; row-click "misfire" proven an automation artifact, aria-labels hardened.
- Lane K1 — `source='db'` kind components render live (react allowlist flavor + html iframe flavor), expanded allowlist, refresh-on-view staleness contract, deterministic row selection — see SHAPE_SYSTEM.md § DB kind components.
- Lane K4 — schema_proposal "Create a Shape" apply target (converter warnings surfaced with explicit acknowledgment, rollback compensation, 12-kind cap) — see `features/agents/components/schema-proposal/`.
- Lane K5 — review-findings sweep (parser-truth schemas for chart/diff/stats/map, ledger-consistent header fix, kindBinding gates, Quickset cosmetic).
- Lane K3 — the user-facing Shapes studio (`app/(core)/shapes/` + `features/content-ir/studio/`): /shapes list (RLS-scoped mine + platform), /shapes/[kind] Preview/Test/Schema (Test = KindInputForm → live render through the real applyIrKindRoute path; preview engine extracted from admin, one engine), /shapes/new create-with-agent handoff to `/chat/a/[agentId]` via `stashChatDraftTransfer`, sidebar nav + /shapes/admin map. K2's creator-agent id is now pasted into `SHAPE_CREATOR_AGENT_ID` (2026-07-18) — a browser pass of /shapes/new → chat handoff is still owed.
- Lane K2 — server-side creator toolsets + agent (aidream, 2026-07-18): `kind_*` (create from sample-data with inferred schema + validated canonical example / get / update_schema with stranded-example reporting / add_example / create_skill / create_content_block) + `kindcomp_*` (get_context / create_component / get_code / update_code / patch_code / update_settings / resolve_incident) — 13 `tool.definition` rows, drift-validator green, live E2E lifecycle proof (`matrx_ai/tools/tests/run_kind_tools_e2e.py`). DDL kc_001 (applied + ledgered): kind_component `semver`/`notes`, `_version_capture` history + `content_ir.kind_component_version` view, `content_ir.kind_component_incident` with canonical component RLS. **Creator agent `kind_creator`: `4f4ffd49-db15-4a2e-b9fe-341ffafc1323`** (v1 `fdb0ef64-ab2a-4ed6-b6d6-cbecc4a07649`), `agent_type='builtin'`, all 13 tools bound, four-step-loop prompt. Authz hardened post-review (aidream `db2969fe2`): reads viewer-gated / writes editor-gated through the live `iam.has_access_for`; incident data_snapshot payloads editor-only. Riders in common-docs content-ir FEATURE gap 10 (FE incident reporter, D4 sandboxed `source='db'` rendering, tool_ui subsumption).
- Lane D — shape discovery chips ("Shapes" row in Quickset: Flashcards/Quiz/Timeline/Comparison/Diagram, gated on the live skill list, toggling `addedSkills` → `skill_config.included`) + "Convert to flashcards / quiz…" on assistant messages with a table/list (`messageActionRegistry` → canonical `ConvertContentDialog`; artifact lineage-links to the conversation; SHAPE_SYSTEM.md Convert Pattern lists chat as a shipped surface). Browser-verified end-to-end (chip → in-chat flashcard block; convert → real fc_set). `flashcard-set` skill re-activated in `skill.definition`.
- Lane B — "Bind to a kind" picker + matches/drift indicator in the builder's Output Schema tab — see `features/agents/components/settings-management/output-schema/` (kindBinding.ts golden-tested byte-equal to flashcard_set's live `emitted_block_schema`).
- Lane C — education content rendering is kind-aware (`onboard/SummaryDetail.tsx` → `MarkdownStream`; all other surfaces already kind-correct) — see `features/education/FEATURE.md`.

