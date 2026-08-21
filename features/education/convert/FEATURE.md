# Content Converter — the cross-tool conversion contract

> **Status:** Contract published 2026-07-07 (P9 Universal Ingest, co-owned with P4 Smart Notes).
> **All seven generators are LIVE** (deck · summary · mind_map · notes · quiz · practice_test ·
> audio) — no placeholders remain.
> **This is the ONE dispatch layer for turning content into study artifacts.** Do not build a
> second one — register a generator here (or from your feature) instead.

## What it is

`convertContent({ source, targetKind })` — a single dispatch that turns a **normalized text
source** into a **study artifact** of a requested kind, persists it, links a `source` lineage
edge to the origin, and returns enough to open it. It is the spine of two flows:

- **P9 kit fan-out** — one upload → deck + summary + mind map (+ quiz/audio/notes as they land),
  all in parallel, all lineage-linked to the same source (`convertMany`).
- **P4 one-click** — "turn this note / passage into a deck / quiz / map / summary" (`convert`).

Consumers: P9, P4, flashcards, P1, P3.

## The contract (import this)

```ts
import { useContentConverter } from "@/features/education/convert/useContentConverter";
// or, outside React:
import { runConvert } from "@/features/education/convert/registry";

const { convert, convertMany } = useContentConverter();

// one target
const deck = await convert({
  source,
  targetKind: "deck",
  options: { depth: "thorough" }, // count optional — omit and it sizes to the source
});

// the kit fan-out — parallel, never throws; each target succeeds/fails on its own
const outcomes = await convertMany(source, ["deck", "summary", "mind_map"], {
  focus,
});
```

**`ConvertSource`** — `{ text, title?, ref? }`. `text` is already-extracted content (ingest owns
PDF-extraction / scrape / transcription / paste → text; generators never touch raw files).
`ref: SourceRef` is the lineage anchor — canonically a `cld_files` id (`ref.fileId`), since the
ingest pipeline normalizes EVERY input to a durable file.

**`ConvertResult`** — `{ targetKind, artifactId, resourceType, href, title, trust?, detail? }`.
`href` opens the artifact; `resourceType` is the access/association token (`fc_set`,
`study_media`); `trust` is the TrustEnvelope (P0) the generator emitted.

**`TargetKind`** — `deck | summary | mind_map | audio | quiz | practice_test | notes`.
`isTargetAvailable(kind)` / `listGenerators()` drive the kit picker (available vs coming-soon).

## THE COVERAGE LAW

**An artifact is sized by the MATERIAL, never by a constant.** Every generator used to send the
whole source in one agent call with a hardcoded count; a 77-slide PDF came back as 10 flashcards,
5 key points, 16 mind-map nodes and 10 quiz questions, all drawn from the front of the document
(2026-08-21).

Two rules, both load-bearing:

1. **Generate PER SECTION.** `coverage.ts#planCoverage` splits the source at its own boundaries
   (slides, headings, pages) and gives each section its own share of the total. This is what buys
   coverage — section 7 gets its own call, so slide 62 cannot be skipped because the model already
   had enough by slide 12.
2. **Scale the count to the source**, bounded by knobs, multiplied by the student's `depth`
   (`quick | standard | thorough`). An explicit `options.count` wins but is still spread across the
   WHOLE document.

**Every list-shaped generator goes through `segmentedGenerate`** (deck · quiz · practice_test ·
memory_aid · summary key points · notes key terms). Never hand-roll a second fan-out: the dedupe
rule, the gap reporting, the single-pass fast path and the background rule below have to stay
identical across targets. Prose targets (`notes`, `summary`) write one section per coverage section
and stitch them in document order; `mind_map` namespaces each sub-map's node ids before grafting it
under one root (two sub-maps both call a node `n1`).

🚨 **A multi-section run is BACKGROUND** (`runAgentExtraction`'s `live: false`). N sections mean N
conversations, and a kept instance is a render block the canvas materializer turns into its OWN
artifact — one deck would land as eight. It reports through `ctx.onProgress` instead, which is what
lets the kit board say "section 3 of 8 · Measurements · 24 so far". A single-pass run keeps the old
live-stream behaviour and its `conversationId` for the single-writer dedupe path.

**A missed section is never swallowed.** A failed section drops to `null` rather than sinking the
artifact; `describeGaps` puts the honest line in `ConvertResult.detail`.

**Every ceiling is a knob** (`platform.feature_knob`, feature `education.study_kit`, read via
`lib/knobs/featureKnobs.ts`) — segment size, max segments, concurrency, min/max items, and
items-per-section per kind. Never a constant:
`common-docs/policies/limits-are-knobs-agents-set-them.md`.

## Making MORE from the same material

A generated artifact is not a dead end at whatever size the generator chose.
**`reopenSource(fileId)`** recovers a kit's original text from nothing but its lineage anchor —
`docproc.processed_documents` first, then the stored bytes, then a PDF re-extract by file id — with
no re-upload and no new anchor, so the whole kit stays one family. `AddMoreCardsButton`
(flashcards set detail) is the worked example: reopen → `segmentedGenerate` at thorough depth →
drop what the deck already has → `fcService.addCards` onto the SAME set.

## Live generators

| Kind            | Agent / service                                                                             | Persists to                                                | Capability (P8)                    |
| --------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| `deck`          | Kit Flashcard agent (`0de9ff99…`) → `fcService.createSetWithCards`                          | `fc_set` + `fc_card`                                       | `education.generate_cards`         |
| `summary`       | Study Summary agent (`92b607a4…`) → `studyMediaService`                                     | `study_media` (`media_kind='summary'`)                     | `education.ingest_document`        |
| `mind_map`      | Study Mind Map agent → `studyMediaService`                                                  | `study_media` (`media_kind='mind_map'`)                    | `education.mindmap_generate`       |
| `notes`         | Study Notes agent (`f23562ce…`) → `NotesAPI.create`                                         | `workbench.notes` (a real platform note)                   | `education.notes_generate`         |
| `quiz`          | Assessment from-source agent → `assessmentService.createWithItems`                          | `education.assessment` (`assessment_kind='quiz'`)          | `education.quiz_generate`          |
| `practice_test` | same from-source agent (longer/timed defaults) → `assessmentService.createWithItems`        | `education.assessment` (`assessment_kind='practice_test'`) | `education.practice_test_generate` |
| `audio`         | `buildAudioRequest` → `studioRunsService` + `studyMediaService` (streamed podcast pipeline) | `study_media` (`media_kind='audio'`) + `pc_studio_runs`    | `education.audio_generate`         |

Each generator: run the agent (`runAgentExtraction` — the shared launch+extract primitive),
coerce, persist, then call `recordSourceLineage(result, source, orgId)` — the ONE canonical writer
of the artifact→origin `source` edge (no generator hand-rolls it) — and return the result. Per-card
TrustEnvelopes roll up via `mergeTrustEnvelopes`. The `quiz`/`practice_test` generators ALSO keep
the flat `assessment.source_kind`/`source_id` columns (fast filter + learning-gain matching); the
association edge is the polymorphic lineage every kit/convert surface reads.

When `ConvertSource.text` contains IC-3 `GROUNDING_PASSAGE` markers, the deck generator preserves
that serialization verbatim. It must never replace durable RAG chunk ids with local `c1` markers;
otherwise a generated citation cannot open the retrieved passage.

**Envelopes without agent citations (`mind_map` / `audio`):** these agents return structure
(`diagram_spec { nodes, edges }`) or audio, not a `trust`/citations field — so the generator
derives a **grounded TrustEnvelope from the KNOWN source** via `sourceTrust.ts#buildSourceTrust`
(cites the ingest anchor). `MindMapDetail` / `AudioStudyDetail` render `<SourceCitations/>` from
it. (Previously `mindMap.ts` hardcoded `trust: null` — fixed 2026-07-10.)

## Registering a new generator

All seven current targets are live. To add a NEW `TargetKind`, register it in
`generators/index.ts` (or self-register from your feature):

```ts
import { registerGenerator } from "@/features/education/convert/registry";
registerGenerator({
  targetKind: "quiz",
  label: "Quiz",
  available: true,
  capability: "education.quiz_generate",
  run: async (request, ctx) => {
    /* agent → persist → source edge → ConvertResult */
  },
});
```

The kit picker lights the target up automatically — no P9 change needed. Keep the
`ConvertResult` contract exact (esp. `href` + `resourceType`) so lineage + navigation work.

## Files

- `types.ts` — the contract types (`ConvertSource`, `ConvertResult`, `ConvertGenerator`, …)
- `registry.ts` — `registerGenerator` / `runConvert` (aka `convertContent`) / `isTargetAvailable`
- `useContentConverter.ts` — the React entry (`convert` + `convertMany`)
- `coverage.ts` — **THE coverage engine**: `planCoverage` (segment + scale), `runOverSegments`
  (bounded fan-out), `markForGrounding` (the ONE chunk-marker writer), `describeGaps`
- `segmentedGenerate.ts` — **the ONE fan-out** every list-shaped generator uses (plan → per-section
  run → merge → de-duplicate → report gaps)
- `reopenSource.ts` — recover a kit's original text from its lineage anchor (powers "add more")
- `MadeFromSource.tsx` — the BACKWARD lineage strip: the material an artifact was made from, plus
  its kit siblings. Twin of `GeneratedFromChips`; do not grow a third lineage renderer
- `runAgentExtraction.ts` — shared "launch JSON-extraction agent → get object" primitive
  (`live: false` runs a segment in the background — see THE COVERAGE LAW)
- `recordSourceLineage.ts` — **the ONE canonical writer** of the artifact→origin `source` edge
  (resolves the anchor: the durable ingest `file` OR the origin entity via `ref.entityType`/
  `entityId`). Every generator calls it; none hand-rolls the edge.
- `lineage.ts` — the reverse read: `listGeneratedFrom(entityType, entityId)` (incoming `source`
  edges → the "generated from this" rows)
- `GeneratedFromChips.tsx` — the reverse-lineage chip strip, reused on every convert-source surface
- `ConvertContentDialog.tsx` — **the ONE convert-source dialog** (note / deck / assessment / passage
  → any target); metered via the canonical entitlement guard. Sources hand it serialized text + an
  origin token.
- `trustMerge.ts` — roll per-item envelopes up to one artifact envelope
- `sourceTrust.ts` — `buildSourceTrust`: a grounded envelope from the source for agents that
  emit no citations (`mind_map`, `audio`)
- `mandates.ts` — converter-owned mandate keys (`CONVERT_MANDATES`: `education.summarize`; the
  deck target rides the canonical `flashcards.generate_from_source` mandate — the former duplicate
  deck agent collapsed into it, program decision D-WP2-3)
- `generators/` — `deck.ts`, `summary.ts`, `mindMap.ts`, `index.ts` (registration). `notes`,
  `quiz`/`practice_test`, and `audio` self-register from their owning features
  (`education/notes`, `education/assessment`, `education/media/audio`).

## Invariants

- ONE dispatch. No second converter, no per-feature parallel path.
- ONE convert-source dialog (`ConvertContentDialog`) and ONE lineage writer
  (`recordSourceLineage`) / reverse reader (`lineage.ts` + `GeneratedFromChips`). Do not fork
  a per-feature dialog or edge-writer — a source hands the dialog its serialized text + origin token.
- Generators are plain async functions (not hooks) so the dispatch runs from anywhere.
- Every generated artifact links a `source` edge to its origin — the durable `ref.fileId`, or the
  origin entity (`ref.entityType`/`entityId`) for an entity-sourced convert (note→deck, deck→quiz,
  assessment→deck). Lineage is never optional and is written in ONE place (`recordSourceLineage`);
  all seven generators route through it.
- Everything the agents emit carries the P0 TrustEnvelope; `trust` flows through unchanged —
  except `mind_map`/`audio`, whose agents emit no citations, so the generator derives a grounded
  envelope from the source (`sourceTrust.ts`). No generator persists `trust: null`.
- Ingest owns raw-input → text; generators own text → artifact. Never mix the two.
- **No generator sends the whole source in one call with a fixed count.** See THE COVERAGE LAW.
- Lineage is visible BOTH ways: `MadeFromSource` (what this came from + its kit siblings) and
  `GeneratedFromChips` (what was made from this). An artifact that cannot name its source reads as
  something the system invented.

## Change log

- **2026-08-21** — **THE COVERAGE LAW.** Artifacts are sized by the material, not by a constant:
  new `coverage.ts` + `segmentedGenerate.ts`, and every generator rewired onto them (deck, summary,
  mind_map, memory_aid, notes, quiz, practice_test). Verified live on the reported 77-slide source:
  10 → 58 cards, 5 → 44 key points, 16 → 99 nodes, and notes that cover the whole deck. Ceilings
  moved to `platform.feature_knob` (`education.study_kit`) behind the repo's first runtime knob
  reader, `lib/knobs/featureKnobs.ts`. Added `MadeFromSource` (backward lineage, mounted on every
  artifact surface) and `reopenSource` + "Add more cards" (58 → 118 verified live).
- **2026-08-18** — all AI steps resolve through mandates (IC-1); UUID registry deleted
  (`agents.ts` → `mandates.ts`; `runAgentExtraction` takes `mandateKey`, never an agent id;
  the duplicate deck agent collapsed into `flashcards.generate_from_source`).
- **2026-08-11** — **Every conversion streams (THE FLOATING LAW).** `ConvertContentDialog` opens the floating `LiveRunWindow` before each target's launch and binds it with the `onRequestId` the converter contract already carried, so the generator's output is written in front of the user instead of behind the row's "Working" spinner. No generator changed.
- **2026-07-10** — **Lineage + source-affordance convergence (Convergence-B certification).** Closed
  four gaps: (1) extracted `recordSourceLineage.ts` — the ONE writer of the artifact→origin `source`
  edge — and migrated all five inline call sites (deck/summary/mind_map/notes/audio) onto it, THEN
  added it to `quiz`/`practice_test` (which previously only set the flat `source_kind`/`source_id`
  columns — so a converted quiz/test now lands a real association edge; `assessment` added to
  `ASSOCIATION_TARGET_TYPES`). (2) Generalized the note-only `ConvertNoteDialog` into the shared
  `ConvertContentDialog` + `lineage.ts` + `GeneratedFromChips` (deleting `notes/ConvertNoteDialog`,
  `notes/GeneratedArtifactsChips`, `notes/service`) and put a Convert affordance on the flashcard-set
  detail (`SetDetailView`, `serializeDeck`) and the assessment detail (`AssessmentDetail`,
  `serializeAssessment`) — decks and quizzes are now convert SOURCES, not just targets. Entity-sourced
  conversions link back via `recordSourceLineage` reading `ref.entityType`/`entityId`. (3) This doc
  rewritten to current truth. Entitlement guarding unchanged (`useEntitlementGuard` per target row).
- **2026-07-10** — `audio` target went LIVE (P3 Audio Study). `audioStudyGenerator`
  (`features/education/media/audio/audioGenerator.ts`) drives the canonical audio-create path
  (`buildAudioRequest` → `studioRunsService` + `studyMediaService`, streamed) and self-registers.
  Fixed `mindMap.ts` `trust: null` → grounded envelope; extracted the shared `sourceTrust.ts`
  (`buildSourceTrust`) used by both `mind_map` and `audio`. All seven targets now have a live
  generator. NOTE: live audio + mind-map GENERATION is currently blocked by an aidream backend
  outage (podcast script agent + platform-wide agent-run `resolve_call_profile`); the FE path is
  complete and filed.
- **2026-07-10** — `notes` target went LIVE (P4 Smart Notes). `notesGenerator`
  (`features/education/notes/notesGenerator.ts`, Study Notes agent `f23562ce…`) turns source
  text into a real platform note (grounded, TrustEnvelope) and self-registers here.
  Remaining placeholders: audio (P3), quiz/practice_test (P1).
- **2026-07-07** — Contract published (P9). Live: deck, summary (new Study Summary agent +
  `study_media` `summary` kind), mind_map. Placeholders: audio (P3), quiz/practice_test (P1),
  notes (P4). Shared `runAgentExtraction` extracted from the flashcards/mindmap hooks' duplicated
  launch+poll logic.
