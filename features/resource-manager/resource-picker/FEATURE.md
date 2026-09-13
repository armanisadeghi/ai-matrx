# Resource Picker

The "+" attach family for AI surfaces: pick a thing, attach it to the run. `ResourcePickerMenu` hosts one sub-picker per resource kind; each pick funnels through **one** callback — `onResourceSelected(resource: Resource): boolean | void | Promise<…>` (`ResourcePickerMenu.tsx`) — into `useAttachResource(conversationId)` (`../../agents/components/inputs/resources/attach-resource.ts`).

**This is NOT the reference picker, and the two must not be merged — see THE CONSOLIDATION DECISION below before proposing it (it has been proposed and declined).**

## What it attaches, and how (the load-bearing contract)

`Resource` is the tagged union at `features/agents/resources/types.ts` (`{ type, data }`). `attach-resource.ts` routes each kind by its OWN semantics — this is the whole point of the family:

- **Stored file** → a durable `platform.associations` `file → conversation` edge that persists across turns and reloads (the backend reads the edge at call time). NOT the ephemeral resources slice.
- **Pre-conversation file** → a `processed_document` instance resource.
- **Media / notes / tasks / webpages / …** → the per-turn `instanceResources` slice as a typed `ResourceBlockType`.
- **Conversation refs and Google files** → bypass the resource path entirely and write **context entries** (`referenced_conversations`, `__google_files`).

A pick therefore carries a full typed payload (`Note`, `DatabaseTask`, `FileSelection`, `TableReference`, …), not a bare id — the block builders read those payloads.

## Consumers (why the blast radius is large)

Twelve code consumers, not just chat: `cx-conversation/ConversationInput`, `smart-input/{PlusAttachMenu,RunControlsMenu,RunControlsTabPanel}`, `settings-management/AgentSettingMediaPicker`, `builder/AgentResourcesManager`, `window-panels/windows/ResourcePickerWindow`, `ai-work/compose/AiWorkComposer`, `chat-assistant/CompactAssistantInput`, `resources/{SmartAgentResourcePickerButton,SmartAgentResourceChips,attach-resource}`.

## THE CONSOLIDATION DECISION (2026-09-12) — do not merge onto the reference picker

Proposed: replace this family with the canonical registry picker stack (`RecordReferencePicker` / `ReferenceTypeAdder`, `useUniversalEntitySearch`, `entityRegistry.listableTokens`) for "one search path, one type registry." **Declined after a full per-picker audit.** The two families are different domains:

- **Reference picker** mints an identity *link* — a `matrx` reference fence (a chip in text, a scope-cell value, a directive item). It returns `{ id, label }`.
- **Resource picker** attaches *payload/context* to an AI run, with kind-specific attach side effects (durable edges, media bytes, context entries) and full typed payloads.

`AttachReferenceButton` (the canonical "generic +") emits `{ type, item }` and **has zero consumers today**; it is not the composer's contract, and bridging it needs an id→full-payload adapter per type.

Of ~16 sub-pickers:
- **~11 have no canonical equivalent at all** — the URL family (webpage, youtube, image_url, file_url: URL ingress + validation/scrape/preview), Google (external provider + connection flow), Audio/Voice Pad (live capture → synthesized text), Context Values (scope drill → `referenceFence`), Tools/Skills (run-state toggles, not pickers). Their tokens are absent from the entity registry by design; `useUniversalEntitySearch` structurally cannot serve them.
- **2 carry irreplaceable structure** — Conversations (own/standard/alive scope + mention-string-as-context-entry, plus `EntityDoorControls`) and Tables (full_table/row/column/**cell** references via a multi-level drill).
- **Files are ALREADY shared** — `AttachReferenceButton`/`ReferenceTypeAdder` mount this family's `FilePickerWindow`. That is the correct reuse, already done.
- **The record-type pickers (Notes, Tasks/Projects, Workbooks, Documents)** are `reference_pickable` in `platform.entity_types`, so the canonical search *could* list them — but each has UI the flat canonical picker lacks (Notes: folder tree + counts + preview from the `useNotes` Redux slice; Tasks: project→task hierarchy + completed toggle; multi-select on Files) and needs full payloads, not `{id,label}`. Swapping would *lose* function unless the canonical picker were first extended toward these — bloating a deliberately-minimal link-picker with a foreign concept, which the reuse-first doctrine's counterweight forbids ("never silently shoehorn a new concept into a primitive it doesn't fit").

**The real (narrow) duplication** is the per-picker search/list *data path* (Redux slices, `get_user_tables`, `listAccessibleDocuments`, own Supabase queries). Unifying only that onto `useUniversalEntitySearch` is possible for the record types but is a **behavior change** (folder grouping and scoping differ from a title-only ilike RPC), not a free win — so it is deferred, not done, and would be its own scoped task with live UX verification, never a blind swap.

## Change Log

- 2026-09-12 — FEATURE.md created to record the attach contract and the consolidation decision (family stays; not merged onto the reference picker). No code change.
