# P0 — TRUST: The Grounded-AI Trust Layer *(cross-cutting mandate + shared primitives)*

> **Status date:** 2026-07-07 · **Wave 1, priority tier 1 — FOUNDATIONAL CONTRACT (highest strategic
> leverage in the whole plan).** Publish the TrustEnvelope contract on **day 1**; every AI project
> builds against it. Read [`MASTER_PLAN.md`](./README.md) and
> [`../COMPETITIVE_INSIGHTS_AND_REPRIORITIZATION.md`](../COMPETITIVE_INSIGHTS_AND_REPRIORITIZATION.md)
> §3 TRUST themes (T1–T5) — this project exists because **8 of 9 competitor research passes** found
> "grounded-in-my-material, cited, never confidently wrong" to be the market's #1 unmet want.

## Objective

Make trust a *product surface*, not an implicit RAG detail. Every AI-generated card, answer, quiz
item, and audio segment carries **visible source citations**, an honest **confidence signal**, and
the ability to **refuse** ("that's not in your material") — and grading judges **meaning, not exact
strings**. Ship this as one shared primitive set (envelope contract + renderers + agent-spec
addendum + grading core) consumed by every education AI feature, plus the visible brand layer
("how we ground answers") that turns it into marketing. StudyFetch is hated for "confidently
wrong" STEM; NotebookLM proved grounding cuts hallucination 40%→13%; Knowt is hated for
exact-string grading. We have RAG, scopes, and a grading core already — this project *surfaces*
them.

## Current state (verify on day 0 — starting points, not finished work)

- **RAG + source lineage exist:** `features/rag` is live; flashcards RAG-from-source
  (`CreateFromSource`) already tracks source lineage. `education.study_source_chunk` exists
  (0 rows — validate whether it's the intended citation-chunk store or dead).
- **Grading core exists and already grades meaning-ish:** `gradeSpokenAnswer` / grading-core
  (`features/flashcards/.../grading`), agents `gradeSpoken` (`e0449378-…`) and `fc_make_quiz_items`.
  What's missing is a *stated, tested* grade-on-meaning guarantee + typed feedback shape.
- **Content-IR is the delivery vehicle:** generated content streams as `__kind` envelopes —
  citations/confidence belong IN the kind schemas, not bolted on. Check
  `content_ir.kind_definition` for any existing citation/source shapes before inventing one.
- **Agent specs are centralized:** `features/education/docs/AGENT_SPECS.md` + `LIVE_AGENTS.md` —
  the trust addendum amends every generation/grading agent's spec.

## Scope

**IN**
- **The TrustEnvelope contract (day-1 publication):** a typed shape every education AI output
  carries — `{citations: [{sourceId, sourceKind, locator, excerpt}], confidence:
  'grounded'|'inferred'|'not_in_material', groundedIn: scope}` — expressed in the content-IR kind
  schemas (via the `shape-system` skill) so it streams natively.
- **Shared UI primitives** (`features/education/trust/` or platform-level — decide with evidence):
  `SourceCitations` (tap a citation → see the exact source passage), `ConfidenceBadge`, the
  refusal presentation ("not in your material — want me to answer from general knowledge?" as an
  explicit user choice), and a **"Verify against source"** action (re-check a card/answer against
  its cited chunk, flag drift).
- **Agent-spec addendum:** amend the generation/grading agent specs (via agent_author) so every
  agent returns the envelope and is instructed to refuse rather than guess; re-verify the two
  highest-traffic agents (flashcards `generateCards`, tutor `helpLive`) as the **reference
  retrofits**.
- **Grade-on-meaning:** harden grading-core with a typed verdict shape
  (`{correct, partial, misconception, explanation}`), semantic-equivalence tests (synonyms,
  paraphrase, order-insensitivity), and adopt it as the ONE grading path for P1's typed/short
  answers (contract with P1).
- **The brand surface:** a "How our AI stays honest" page under the education marketing axes +
  in-product affordances (the citation chips ARE the marketing). Coordinate copy with P8's
  integrity positioning.
- **Data-security posture note** (T5): a short, factual security/privacy statement page (Chegg
  breach wedge) — content only; no new infra.

**OUT**
- The consuming features themselves (P1–P5 wire the envelope; you provide it + retrofit the two
  references). RAG internals. The billing-integrity half of trust (P8). Model/provider work
  (aidream-side prompt hardening is in scope only as agent-spec text).

## Deliverables / Definition of done

1. TrustEnvelope contract published day 1 (typed, in content-IR kinds, documented in
   `AGENT_SPECS.md`).
2. Flashcards generation shows real citations: generate a deck from an uploaded source → each
   card carries tappable citations resolving to the actual passage.
3. The tutor (or its current embryo, `helpLive`) refuses honestly when asked something outside
   the studied material, with the general-knowledge escape hatch as an explicit user choice.
4. "Verify against source" works on a generated card.
5. Grade-on-meaning proven by test cases (paraphrased correct answers accepted; Knowt's
   exact-string failure mode demonstrably absent) and adopted by P1's grading path.
6. The trust brand page ships; every consuming project's brief obligation ("carry the envelope")
   is documented so Convergence A can audit compliance.

## Surfaces touched

- New `features/education/trust/**` (envelope types, renderers, verify action)
- Content-IR kind schemas (citation/confidence fields — `shape-system` skill, coexist-not-clobber)
- `features/education/docs/AGENT_SPECS.md` + agent updates via agent_author
- `features/flashcards` generation + tutor config (reference retrofits — coordinate with the
  flashcards agent and P2)
- Grading core (`features/flashcards/.../grading` → generalize location if needed)
- One marketing page under the education axes

## Dependencies & contracts

- RAG ✅, content-IR ✅, grading core ✅, agent pipeline ✅. No blockers.
- **Publishes (day 1):** TrustEnvelope + grade-on-meaning verdict shape → P1, P2, P3, P4, P9.
- **Consumed by every AI project** — this is the P0 gate: at Convergence A, any education AI
  output without the envelope is a defect.

## Build guidance

- Envelope-in-kind-schema, not a parallel channel: invoke `shape-system` before touching any kind;
  citations stream inside the same content-IR payload the cards already use.
- Refusals are agent behavior + UI presentation — never a client-side filter pretending to be
  grounding.
- Keep the envelope cheap for consumers: one component (`<SourceCitations/>`), one field pass-through.
- `type-safety` throughout; `context-docs` when amending AGENT_SPECS/FEATURE docs;
  `finalize-and-ship`.

## Verification

Real generation from a real uploaded source (no mocks): citations resolve to true passages;
deliberately ask out-of-corpus questions and observe refusals; run the paraphrase grading suite;
break a citation (edit the source) and watch "Verify against source" flag it. Hand Arman a
demo script: one upload → cited cards → honest refusal → verified answer.
