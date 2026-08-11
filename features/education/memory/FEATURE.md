# Education Hub — Memory Tools (FEATURE.md)

**Status:** live · **Tier:** 2 (Education Hub tool) · **Vision:** [`VISION-education-hub.md` §11](../../../app/(core)/education/VISION-education-hub.md) · **Last updated:** 2026-07-13

> 🔴 The Education Hub source of truth is the VISION doc. This file documents only HOW the Memory Tools are built. Drift → the vision wins; report it.

## Purpose

VISION §11 "Memory Tools — Mnemonics, Analogies & Associations." From a deck / notes / topic, generate the aids that make hard material stick:

- **Mnemonics** — acronyms, acrostics, rhymes, sentence mnemonics, keyword/sound-alike images, chunking — for difficult lists, sequences, and terminology.
- **Analogies & memory bridges** — a relatable everyday analogy for each abstract concept, with the mapping spelled out.
- **Memory-palace scaffolding** — a method-of-loci journey for large ordered sets (only when the material warrants one).
- **Proactive suggestions** — an opt-in per-card "Give me a memory aid" affordance that surfaces alongside flashcards while studying.

## Why it reuses, not forks

Memory Tools is a **thin tool over the existing study-media substrate** — it introduces almost no new infrastructure:

- **Content model:** `education.study_media` with `media_kind='memory_aid'` (widened the CHECK; migration `migrations/edu_study_media_memory_aid_kind.sql`, ledger-recorded). The structured aids ride the existing `ir_envelope` jsonb column (exactly like a mind map's `diagram_spec`); generation config rides `config`; trust rides `trust`; visibility + versioning + org + RLS + sharing registration are already on the table. **No new table, no new columns.**
- **Service:** reuses `studyMediaService` (`features/education/media/service.ts`) verbatim — `create` / `getById` / `listByKind('memory_aid')` / `softDelete`. `EduMediaKind` was extended with `'memory_aid'`.
- **Generation:** authored via `agent_author` (DB-only agents, no Python) and run through the canonical agent-execution pipeline. The tool page uses `useGenerateMemoryAid` → the shared `runAgentExtraction` primitive (NOT a re-implemented launch/poll). Source resolution reuses `resolveDeckAudioSource` / `resolveTopicAudioSource` (generic despite the `audio` name — the mind-map tool reuses them too).
- **Trust:** every generated set carries a P0 `TrustEnvelope` — a deck source → `grounded` + a citation; a free-text topic → `inferred`, labelled honestly (built by `buildSourceTrust` / `resolveDeckAudioSource`). Rendered by the shared `ConfidenceBadge` + `SourceCitations`.
- **Entitlements:** metered `education.memory_generate` (registry entry + `billing.capability` + `billing.capability_limit` rows: 15/month, 5/rolling_5h, free). The New page shows the limit BEFORE the action (`EntitlementMeter`) and guards the spend (`useEntitlementGuard` → `CapabilityPaywallDialog` on a cap hit — never a mid-generation ambush). `enforced:false` until the FYI-with-veto pass.
- **Converter:** registers the `memory_aid` target on the ONE converter dispatch (`features/education/convert`), so note→memory-aid and the `/education/start` upload-kit fan-out produce memory aids; lineage via the shared `recordSourceLineage`.
- **Sharing / access:** `useAccess('study_media', id)` for owner controls; `requireAccess(... 'edit')` server gate on `[id]/edit`; `ShareButton resourceType="study_media"`. The shared viewer `/education/media/[id]` dispatches `memory_aid` → `MemoryDetail`.

## Entry points

- **Routes** (`app/(core)/education/memory/`): `/` (list-first home) · `/new` (generate) · `/[id]` (view — the shareable URL) · `/[id]/edit` (owner controls, EDIT-gated).
- **Shared viewer:** `/education/media/[id]` → `MediaRouter` → `MemoryDetail` (kind dispatch).
- **Feature dir** (`features/education/memory/`):
  - `agents.ts` — the two live agent ids.
  - `types.ts` — `MemoryAidPayload` / `MemoryHintPayload` + non-throwing coercers.
  - `useGenerateMemoryAid.ts` — the generation hook (over `runAgentExtraction`).
  - `lanes/memoryHint.ts` — the proactive per-card hint thunk (mirrors the tutor `microCoach` lane).
  - `components/` — `MemoryAidView` (renderer), `MemoryHome`, `MemoryNew`, `MemoryDetail`, `MemoryAidButton` (the StudyDeck affordance).
- **Converter generator:** `features/education/convert/generators/memoryAid.ts`.
- **Proactive surface:** `MemoryAidButton` mounted in `features/flashcards/components/study/StudyDeck.tsx` (opt-in prop `enableMemoryAids`, default on; nothing fires until tapped).

## Agents (authored + live-verified 2026-07-13, gemini-3.5-flash)

- **Study Memory Aid Generator** `826aaa26-baaf-4e87-b5a3-2e4bba37f053` — `source_content, title, focus` → `memory_aid` envelope `{ __kind, title, strategy_note, mnemonics[], analogies[], memory_palace }`. Grounded strictly in the supplied material. Powers the tool + the converter target.
- **Flashcard Memory Hint** `4c5dd04a-4b22-43cd-bd8b-781a4d6dedb5` — `front, back, topic` → one `memory_hint` `{ __kind, technique, aid, explanation }`. Cheap/fast; powers the proactive StudyDeck affordance.

## Invariants & gotchas

- **The aid content lives in `ir_envelope`, never a new column.** A new aid family = extend `MemoryAidPayload` + its coercer + `MemoryAidView`, not a schema change.
- **The agent returns structure, not a trust envelope** (like `diagram_spec`) — the `TrustEnvelope` is built from the KNOWN source (`buildSourceTrust` / `resolveDeckAudioSource`). Never persist `trust: null` for a grounded source.
- **`memory_palace.applicable`** — the agent sets this false (empty theme/loci) when the material doesn't warrant a palace. The renderer + coercer both respect it; don't force a palace onto small/unordered material.
- **Source-feature tags are reused, not added** (the `features/agents` source-feature union was off-limits during this build): generation uses `education-ingest` (converter one-shot generation) and the per-card hint uses `education-flashcards-coach` (a study-surface background lane). A dedicated `education-memory` tag is a tiny future follow-up (telemetry granularity only).
- **Proactive affordance is opt-in + non-blocking** — a collapsed ghost button; nothing runs until tapped; it never awaits before advancing a card; skipped for matching cards.

## Change log

- **2026-08-11** — **Both memory-aid runs stream (THE FLOATING LAW).** `useGenerateMemoryAid` moved off `runAgentExtraction` onto `useFloatingAgentRun` (same coercion, one fewer hop) and the per-card `MemoryAidButton` floats the `memory_hint` lane through `useFloatingRunWindow`; the lane gained an optional `onConversationCreated` and keeps its background posture when none is passed.
- **2026-07-13** — **Built + shipped LIVE** (VISION §11 — the last vision section with zero code). `tools.ts` `memory` entry live; `/education/memory` home/new/[id]/[id]/edit; `study_media` `memory_aid` kind (migration + ledger); two authored agents; `education.memory_generate` capability + limits; `memory_aid` converter target; proactive `MemoryAidButton` in StudyDeck; admin map + this doc.
