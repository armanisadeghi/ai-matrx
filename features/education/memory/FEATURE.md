# Education Memory Tools (FEATURE.md)

**Status:** live · **Tier:** 2 · Product: common-docs/systems/education/VISION.md (the vision wins on drift)

## Purpose

From a deck, note or topic, generate memory aids: mnemonics, analogies with the mapping spelled
out, an optional memory palace, and an opt-in per-card "Give me a memory aid" hint in StudyDeck.

## Where it lives

- Routes (`app/(core)/education/memory/`): `/` library · `/new` · `/new/manual` · `/[id]` viewer
  (also reached via `/education/media/[id]` → `MediaRouter` → `MemoryDetail`) · `/[id]/edit`
  (structured editor, EDIT-gated by `requireAccess`).
- Rows are `education.study_media` with `media_kind='memory_aid'`; the aid lives in `ir_envelope`
  (no memory-specific table or column). Service: `studyMediaService` (`../media/service.ts`).
- Mandates (`mandates.ts`, `EDU_MEMORY_MANDATES`; the DB picks the agent): `education.memory_generate`
  (tool + converter target), `education.memory_hint` (per-card, cheap/fast).
- Generation: `useGenerateMemoryAid.ts` over `useFloatingAgentRun`; hint lane `lanes/memoryHint.ts`;
  converter target `../convert/generators/memoryAid.ts`; `MemoryAidButton` mounts in
  `features/flashcards/components/study/StudyDeck.tsx` (prop `enableMemoryAids`, default on).
- Entitlement `education.memory_generate`: limits and enforcement live in `billing.capability*`
  (header of `features/entitlements/registry.ts`). The New page shows `EntitlementMeter` and guards
  the click with `useEntitlementGuard` — never a mid-generation ambush.

## Invariants

- `memory_aid` and `memory_hint` are registered kinds: the shape contract and the ONE set of types
  and coercers live in `features/content-ir/kinds/memory-aid.ts` (a new aid family extends that
  schema + `pnpm shape:emit` + `MemoryAidBlock`, never a column). Render through the canonical
  `MemoryAidBlock` / `MemoryHintBlock`; never hand-render either shape.
- The agent returns structure, not trust: the `TrustEnvelope` is built from the known source
  (`buildSourceTrust` / `resolveDeckAudioSource`; deck → `grounded`, topic → `inferred`). Never
  persist `trust: null` for a grounded source.
- `memory_palace.applicable=false` (empty theme/loci) when the material doesn't warrant one; never
  force a palace.
- The per-card hint is persisted as an `fc_detail` layer (kind `mnemonic`,
  `metadata.source='memory_hint'`) from inside `runHeadlessAgentJson`'s `onResult`, so advancing a
  card never loses a paid run. It is opt-in, non-blocking, and streams inline (not in a window).
- Saves of the whole set are version-guarded (`updateVersioned`); inline add/edit/delete of one
  child uses the same save, and a set may end empty so a child delete never deletes its parent.
  Whole-set removal is "Move set to Trash" (soft delete).
- Agent write targets are approval-gated; `change_memory_item` edits one child by 1-based position,
  validated before approval and again on apply.
- Generation source-feature tags reuse `education-ingest` and `education-flashcards-coach`.
- Source-title eyebrows use `distinctSourceTitle` (`../components/EducationCollectionSearch.tsx`).

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/STATE.md — read it before touching this feature in ANY repo.
