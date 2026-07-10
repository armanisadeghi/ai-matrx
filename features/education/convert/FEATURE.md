# Content Converter — the cross-tool conversion contract

> **Status:** Contract published 2026-07-07 (P9 Universal Ingest, co-owned with P4 Smart Notes).
> Three live generators (deck · summary · mind_map); four progressive placeholders.
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
const deck = await convert({ source, targetKind: "deck", options: { count: 15 } });

// the kit fan-out — parallel, never throws; each target succeeds/fails on its own
const outcomes = await convertMany(source, ["deck", "summary", "mind_map"], { focus });
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

## Live generators

| Kind | Agent / service | Persists to | Capability (P8) |
|---|---|---|---|
| `deck` | Kit Flashcard agent (`0de9ff99…`) → `fcService.createSetWithCards` | `fc_set` + `fc_card` | `education.generate_cards` |
| `summary` | Study Summary agent (`92b607a4…`) → `studyMediaService` | `study_media` (`media_kind='summary'`) | `education.ingest_document` |
| `mind_map` | Study Mind Map agent → `studyMediaService` | `study_media` (`media_kind='mind_map'`) | `education.mindmap_generate` |
| `notes` | Study Notes agent (`f23562ce…`) → `NotesAPI.create` | `workbench.notes` (a real platform note) | `education.notes_generate` |
| `audio` | `buildAudioRequest` → `studioRunsService` + `studyMediaService` (streamed podcast pipeline) | `study_media` (`media_kind='audio'`) + `pc_studio_runs` | `education.audio_generate` |

Each generator: run the agent (`runAgentExtraction` — the shared launch+extract primitive),
coerce, persist, add a `source` association edge to `ref.fileId`, return the result. Per-card
TrustEnvelopes roll up via `mergeTrustEnvelopes`.

**Envelopes without agent citations (`mind_map` / `audio`):** these agents return structure
(`diagram_spec { nodes, edges }`) or audio, not a `trust`/citations field — so the generator
derives a **grounded TrustEnvelope from the KNOWN source** via `sourceTrust.ts#buildSourceTrust`
(cites the ingest anchor). `MindMapDetail` / `AudioStudyDetail` render `<SourceCitations/>` from
it. (Previously `mindMap.ts` hardcoded `trust: null` — fixed 2026-07-10.)

## Registering a new generator (P1 / P3 / P4)

Replace the placeholder in `generators/index.ts` (or self-register from your feature):

```ts
import { registerGenerator } from "@/features/education/convert/registry";
registerGenerator({
  targetKind: "quiz",
  label: "Quiz",
  available: true,
  capability: "education.quiz_generate",
  run: async (request, ctx) => { /* agent → persist → source edge → ConvertResult */ },
});
```

The kit picker lights the target up automatically — no P9 change needed. Keep the
`ConvertResult` contract exact (esp. `href` + `resourceType`) so lineage + navigation work.

## Files

- `types.ts` — the contract types (`ConvertSource`, `ConvertResult`, `ConvertGenerator`, …)
- `registry.ts` — `registerGenerator` / `runConvert` (aka `convertContent`) / `isTargetAvailable`
- `useContentConverter.ts` — the React entry (`convert` + `convertMany`)
- `runAgentExtraction.ts` — shared "launch JSON-extraction agent → get object" primitive
- `trustMerge.ts` — roll per-item envelopes up to one artifact envelope
- `sourceTrust.ts` — `buildSourceTrust`: a grounded envelope from the source for agents that
  emit no citations (`mind_map`, `audio`)
- `agents.ts` — converter-owned agent ids (the summary agent)
- `generators/` — `deck.ts`, `summary.ts`, `mindMap.ts`, `index.ts` (registration).
  `audio` self-registers from `features/education/media/audio/audioGenerator.ts`

## Invariants

- ONE dispatch. No second converter, no per-feature parallel path.
- Generators are plain async functions (not hooks) so the dispatch runs from anywhere.
- Every generated artifact links a `source` edge to `ref.fileId` — lineage is never optional.
- Everything the agents emit carries the P0 TrustEnvelope; `trust` flows through unchanged —
  except `mind_map`/`audio`, whose agents emit no citations, so the generator derives a grounded
  envelope from the source (`sourceTrust.ts`). No generator persists `trust: null`.
- Ingest owns raw-input → text; generators own text → artifact. Never mix the two.

## Change log

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
