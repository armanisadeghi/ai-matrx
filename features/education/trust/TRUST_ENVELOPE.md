# TrustEnvelope — the P0 grounded-AI contract

> **The contract every education AI project (P1–P4, P6, P9) builds against.** Mechanics: [`FEATURE.md`](./FEATURE.md).
> Typed definition: [`types.ts`](./types.ts). At **Convergence A, any education AI output
> without this envelope is a defect.**

## What it is

Every AI-generated study artifact — flashcard, quiz item, tutor answer, audio segment, note —
carries ONE small shape describing how grounded it is in the learner's **own** material:

```ts
type TrustConfidence = "grounded" | "inferred" | "not_in_material";

interface SourceCitation {
  sourceId: string;                    // chunk id / section id / doc id — the passage identity
  sourceKind: "document" | "chunk" | "section" | "file" | "url" | "scope" | "transcript" | "web";
  locator?: string;                    // "p. 12", "0:340-0:512", "12:04"
  excerpt?: string;                    // the verbatim passage it was grounded in
  title?: string;                      // display label of the source
  // Durable, OPENABLE references — let a citation open the REAL source, not just
  // an excerpt. The persisting surface backfills these (it knows the durable ids
  // the agent doesn't). Source-agnostic: RAG, uploads, chat attachments, web.
  fileId?: string;                     // durable file id → canonical file/PDF viewer
  documentId?: string;                 // processed-document id
  url?: string;                        // external web source
  page?: number;                       // 1-based page to land on, when known
}
```

### Opening the real source (not just an excerpt)

A citation must let the user **go to the actual source** — the whole file/PDF/document —
not merely read a snippet. `<SourceCitations/>` handles this: tapping a chip shows the
excerpt popover, and when the citation carries a durable `fileId`/`url` it shows **"Open full
source"**, which opens the real file in the canonical file-preview window (`openFilePreview`)
or the web page in a new tab. Consumers get this for free — no wiring. Resolver:
[`open-source.ts`](./open-source.ts) (`openCitationSource`, `citationIsOpenable`).

Backfill of those refs (`attachSourceRefs`) and the open rules live in [`FEATURE.md`](./FEATURE.md).

```ts

interface TrustEnvelope {
  citations: SourceCitation[];
  confidence: TrustConfidence;
  groundedIn?: string;                 // corpus/scope label (e.g. deck / source title)
}
```

`confidence` is the load-bearing signal:

| value | meaning | UI obligation |
|---|---|---|
| `grounded` | every claim traces to a cited passage | show citation chips |
| `inferred` | reasoned *from* the material, not directly stated | show "inferred" badge + any citations |
| `not_in_material` | **not** supported by the corpus | show the honest-refusal path + the general-knowledge escape hatch as an **explicit** user choice — never silently answer as if grounded |

## How a consumer uses it (three rules)

1. **Pass it through.** The agent emits `trust` inside the same content-IR payload the content
   already streams in (per item and/or per set). You carry it from the agent output to the render
   layer unchanged — you never re-derive it.
2. **Render with the shared primitives** (`features/education/trust/components/`):
   `<SourceCitations trust={item.trust} />`, `<ConfidenceBadge confidence={item.trust?.confidence} />`,
   and for a refusal, `<RefusalNotice … onAnswerAnyway={…} />`.
3. **Coerce untyped agent output** with `coerceTrustEnvelope(raw)` from `types.ts` (never throws;
   returns `null` when there's genuinely no envelope). Same for grading: `coerceGradeVerdict(raw)`.

That's the whole consumer surface: one field pass-through + one component + one coercer.

## Grade-on-meaning (the grading half of trust) — ONE verdict core

Grading judges **meaning, not exact strings** (Knowt is hated for exact-string grading). There is
**ONE canonical verdict core** every grading path resolves to — typed/short-answer AND spoken:

```ts
type GradeResult = "correct" | "partial" | "incorrect";  // the ONE result vocabulary

interface GradeVerdict {
  correct: boolean;
  partial: boolean;
  misconception: string | null;   // the NAMED wrong idea, if any
  explanation: string;            // why, in meaning terms
}
```

Both grading paths are **thin adapters that carry their extra fields around this shared core** —
never a second verdict shape:

| Path | Adapter | Extras it wraps around `GradeVerdict` |
|---|---|---|
| Typed / short-answer (assessment) | `GradedAnswer` (`assessment/data/grading.ts`) | `scoreValue`, `gradedBy` |
| Spoken (FastFire / voice) | `SpokenGrade` (`fast-fire/agents/grading-core.ts`) | `score`, `rubric`, `transcript`, `missing`, optional `pronunciation` |

Shared helpers live beside the core in [`types.ts`](./types.ts): `verdictResult(v)` (→ `GradeResult`),
`gradeResultScore(result)` (→ 0..1), `resultFromScore(score)`, `verdictFromResult(...)`. The
duplicated result unions (`SpokenResult`, the slice's `GradeResult`, assessment's `AttemptResult`,
`ReviewResult`) are all now aliases of the one `GradeResult`; the coercer is the single
`coerceSpokenGrade`. Persisted shapes: `study_attempt.score` jsonb is `{ rubric, missing, feedback }`; `result` / `score_value` and `assessment_result.detail` as before.

## Agent-side contract

Every **generation** agent emits `trust` per item; every **grounded** agent (source-generation,
tutor) is instructed to **refuse rather than guess** — return `confidence:"not_in_material"` with
empty `citations` instead of inventing an answer; agent definitions live in the database behind
their mandates. The two reference retrofits
are mandates `flashcards.generate_from_source` (real citations) and `flashcards.help_live` (honest refusal).

## Where it lives on the wire

- **Streaming:** rides the same content-IR envelope as the item, under the `trust` field (the IR
  residue channel carries it losslessly; `trust_envelope` and `citation` are registered content-IR
  kinds, compiled mirror in `features/content-ir/kinds/trust-envelope.ts`).
- **At rest (flashcards reference):** persisted on `fc_card.metadata.trust`; source lineage also
  survives as the existing `fc_card → file` association edge (`role: source`).

## Consumers & their obligation

| Project | Obligation |
|---|---|
| P1 assessment | quiz items carry `trust`; free-response grading uses `GradeVerdict` |
| P2 tutor | answers carry `trust`; honest refusal + escape hatch is the reference retrofit |
| P3 media | audio segments carry `trust` (which source each segment summarizes) |
| P4 notes | generated/converted notes carry `trust` |
| P6 exam hub | AI-graded FRQs use `GradeVerdict`; published items show grounding |
| P9 ingest | the one-upload kit fan-out stamps `groundedIn` + citations on every artifact |
