# Trust Layer (P0) — grounded-AI primitives for the Education Hub

> **Status:** Wave 1 shipped 2026-07-07. Owner: P0. Contract:
> [`TRUST_ENVELOPE.md`](./TRUST_ENVELOPE.md). This is the cross-cutting layer every
> education AI feature consumes — at Convergence A, any AI output without the envelope
> is a defect.

## What this is

Trust as a *product surface*, not an implicit RAG detail. Three guarantees, shipped as
shared primitives:

1. **Citations** — every AI output is grounded in the learner's own material and shows the
   exact passages (tap to read them).
2. **Honest confidence + refusal** — outputs are labeled `grounded | inferred |
   not_in_material`; grounded answering refuses ("that isn't in your material") instead of
   fabricating, with a general-knowledge escape hatch as an explicit choice.
3. **Grade-on-meaning** — grading judges the idea, not the exact string; paraphrases pass and
   misconceptions are named.

## Parts

| Part | Path | Role |
|---|---|---|
| Contract (types + coercers) | [`types.ts`](./types.ts) | `TrustEnvelope`, `SourceCitation`, `TrustConfidence`, `GradeVerdict`, `VerifyResult` + non-throwing coercers. THE source of truth. |
| Contract doc | [`TRUST_ENVELOPE.md`](./TRUST_ENVELOPE.md) | Consumer-facing contract (P1–P4, P6, P9). |
| `<ConfidenceBadge/>` | [`components/ConfidenceBadge.tsx`](./components/ConfidenceBadge.tsx) | The honest-confidence chip. |
| `<SourceCitations/>` | [`components/SourceCitations.tsx`](./components/SourceCitations.tsx) | Tappable citation chips → exact passage popover. |
| `<RefusalNotice/>` | [`components/RefusalNotice.tsx`](./components/RefusalNotice.tsx) | Honest-refusal callout + explicit general-knowledge opt-in. |
| `<CardTrustFooter/>` | [`components/CardTrustFooter.tsx`](./components/CardTrustFooter.tsx) | One-line drop-in: badge + citations + Verify action. |
| `useVerifyAgainstSource` | [`useVerifyAgainstSource.ts`](./useVerifyAgainstSource.ts) | Re-checks a card against its cited passage; flags drift. |

## Agents (authored + live-verified via agent_author, 2026-07-07)

| Agent | id | What changed |
|---|---|---|
| `generateFromSource` (v6) | `f728ac6b-…` | Emits per-card `trust` (real citations w/ verbatim excerpts, `grounded` confidence); drops cards it can't ground. |
| `helpLive` (v6) | `9035ed6e-…` | Emits `trust`; refuses honestly on out-of-corpus questions (`not_in_material` + escape-hatch phrasing). |
| `verifyAgainstSource` | `90b49ead-…` | front+back+source_excerpt → `{status: verified\|drifted\|unverifiable, explanation, suggested_fix}`. |
| `gradeTypedAnswer` | `b39183d1-…` | question+expected+learner → `GradeVerdict` (paraphrase-tolerant, names misconceptions). P1's typed-answer grading path. |

IDs are wired in [`features/flashcards/data/agents.ts`](../../flashcards/data/agents.ts) (`FC_AGENTS`).

## Data flow (flashcards reference retrofit)

`generateFromSource` emits `trust` per card → both coercion paths carry it
(`useGenerateCards.coerceCard` + `generated-set-from-envelope` — the latter previously
**dropped** source/trust) → persisted on `fc_card.metadata.trust` (`fcService.addCards`) →
`StudyDeck` renders `<CardTrustFooter/>` on the revealed card. On the content-IR wire, the
`flashcard`/`enhanced_flashcard` kinds declare `trust.confidence` + `trust.groundedIn`
first-class; `trust.citations[]` rides the zero-loss residue channel (the same mechanism the
bridge already uses for every undeclared card field — proven in the envelope test).

## Verification (real, no mocks)

- **Contract (deterministic):** `features/education/trust/__tests__/types.test.ts` +
  `features/flashcards/data/__tests__/generated-set-from-envelope.test.ts` — 22 tests, the
  second proving trust survives a real content-IR parse via residue.
- **Live agent evals (2026-07-07, gemini-3.5-flash):**
  - *Citations:* `generateFromSource` on a 2-chunk source → 3 cards, each `confidence:grounded`
    with the exact `chunk_id` and a verbatim `excerpt`.
  - *Refusal:* `helpLive` asked a cricket question mid cell-biology drill → `not_in_material`,
    empty citations, "That isn't in your study material. Want me to answer from general
    knowledge?"; in-corpus question → grounded answer with citation (no over-refusal).
  - *Verify:* `verifyAgainstSource` — a card claiming chlorophyll absorbs green → `drifted`
    with a corrected `suggested_fix`; a faithful paraphrase → `verified`.
  - *Grade-on-meaning:* `gradeTypedAnswer` — "the mitochondria make energy" vs "the
    mitochondrion" → correct; "water and CO2" vs "carbon dioxide and water" → correct (Knowt's
    exact-string failure mode absent); location-only answer → partial; "absorbs green" → wrong
    with misconception "Confuses absorbed light with reflected light".

## Brand surface

Two content-only pages under the Features axis
([`features/education/data/features.ts`](../data/features.ts)):
`/education/features/how-we-stay-honest` (the marketing page — the citation chips ARE the
marketing) and `/education/features/data-security` (the T5 posture statement).

## Open / follow-ups

- Standalone activatable `trust_envelope` / `citation` content-IR kinds with dedicated render
  components (currently: field declared on card kinds + residue-carried citations + the
  `<SourceCitations/>` component render it — functionally complete, not a separate kind).
- Quiz/audio/notes consumers wire the envelope during their own waves (P1–P4) per the contract.
- `education.study_source_chunk` (0 rows, unused) remains the natural future home for
  server-side verifiable chunk lineage if citation resolution needs to open the source in place.

## Change log
- **2026-07-07** — P0 shipped: contract + coercers, 4 UI primitives, verify + grade-on-meaning
  hooks/agents, generateFromSource/helpLive reference retrofits, flashcards end-to-end, brand
  pages, 22 passing tests + live agent evals.
