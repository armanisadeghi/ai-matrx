# P4 — Smart Notes (Capture → Convert → Study Loop)

> **Status date:** 2026-07-07 · **Wave 1, priority tier 3** · One agent, human in the loop.
> Read [`README.md`](./README.md) and the vision doc §7 (Note-Taking) — the pillar is
> "bidirectional sync: notes → flashcards → quiz → spaced review → planner; nothing is siloed."

## Objective

Give students a rich note surface inside the education hub — including live lecture transcription
straight into the editor — and make every note one click away from becoming any other study
artifact (flashcard deck, quiz, summary, mind map, audio). P4 closes the "nothing is siloed" loop
and **owns the cross-tool converter contract** that Convergence B is built from.

## Current state (verified — build on this)

- **Routes are stubs:** `app/(core)/education/notes/{page,new,[id],[id]/edit}` — all
  `EduToolComingSoon`.
- **The platform notes system is real and recently canonicalized:** `features/notes`
  (`FEATURE.md`), storage canonicalized onto the workbench schema, sharing registry realigned
  2026-07-07 (`ded0c6ecd` — note sharing was broken, now fixed; notes are the proven sharing
  reference). **Education notes are a THIN layer over `features/notes` — you must not fork note
  storage, the editor, or note sharing.**
- **Rich document tooling exists:** the RichDocument toolkit (working-document surface memory),
  `rich-document-actions` skill. Live transcription exists: `features/transcripts`
  (`FEATURE.md` — core-storage contract) + transcript-studio + scribe.
- **Generators to call:** flashcards `generateCards`/`generateFromSource` (live, UUID-wired),
  P1's quiz generation, P3's map/audio generation — all reachable through the converter contract
  this project defines.

## Scope

**IN**
- `/education/notes/**`: list (a real list "savior" page — recent, filters, New), create/edit
  (rich editor reusing the `features/notes` + RichDocument stack), view.
- **Live lecture capture:** record → real-time transcription streaming into the note editor
  (reuse `features/transcripts` capture + the audioSessionRegistry; the student can annotate
  live). Walk in, press record, walk out with a transcript-note.
- **The converter contract (day-1 publication):** define
  `convertContent({source: {kind: 'note'|'selection'|'transcript', id/text}, targetKind: 'deck'|'quiz'|'summary'|'mind_map'|'audio'})`
  as a typed interface in `features/education/`; implement dispatch to each owner's generator
  (flashcards now; P1/P3 as they land). One-click convert UI on notes: whole note or highlighted
  passage → target artifact, with a link back (association edge note↔artifact — lineage is
  visible both directions).
- Summary generation (the one converter target no other project owns — author a summarizer agent).
- Education-context tagging so converted artifacts land associated with the note and appear in
  the hub.
- P7 `useAccess` call sites on edit routes; P8 `useEntitlement` on conversion/transcription
  actions.

**OUT**
- The generators themselves (flashcards/P1/P3 own them — you call the contract). The notes
  engine/editor internals (`features/notes` owns them; upstream small generalizations, don't
  fork). Transcription pipeline internals (`features/transcripts`). General note features that
  belong platform-wide (build them IN `features/notes`, consumed here).

## Deliverables / Definition of done

1. Create/edit a rich note at `/education/notes`; it is a real platform note (workbench-backed),
   shareable via the canonical sharing system.
2. A live lecture records and transcribes into the open editor in real time.
3. One click converts a note → flashcard deck, → quiz (once P1 lands; call-site + stub until
   then), → summary, → mind map (once P3 lands, same). Each converted artifact links back to the
   note via an association edge, and the note shows "generated from this" chips.
4. The converter contract is published as a typed module with docs on day 1, and flashcards'
   generator runs behind it (proving the interface before P1/P3 arrive).
5. Tool flipped `live` in `tools.ts`; admin map updated; feature docs written.

## Surfaces touched

- `app/(core)/education/notes/**` (replace stubs)
- New thin `features/education/notes/**` (education skin + converter UI)
- New `features/education/convert/**` (the converter contract + dispatch — the load-bearing
  deliverable)
- `features/notes`, `features/transcripts` (consume; upstream tweaks in place)
- `platform.associations` (note↔artifact lineage edges — use the canonical association system,
  `useAssociations`/RPCs only)

## Dependencies & contracts

- `features/notes` ✅ (sharing just fixed — you inherit the reference implementation),
  `features/transcripts` ✅, flashcards generators ✅.
- **Publishes:** the converter contract (day 1) → P1, P3, flashcards, Convergence B.
- **Consumes:** P1 quiz generator + P3 media generators as they land (integrate behind the
  already-shipped contract — no waiting); P7/P8 signatures.

## Build guidance

- Invoke `canonical-associations` before writing any note↔artifact edge; direction:
  content=source → container=target per the association memory.
- Invoke `build-sub-feature` framing: this is capability added into live systems (notes,
  transcripts), not a greenfield feature — reuse canonical code, annihilate nothing silently.
- Live transcription: reuse the audioSessionRegistry (audio session unification memory) — never a
  second capture path.
- `type-safety`, `overlay-system` where panels are involved, `finalize-and-ship`.

## Verification

Real end-to-end: type a note → convert → open the resulting deck and study it; record real audio
→ watch the transcript land in the editor; verify association edges in SQL; share the note to a
second user. Give Arman exact routes + steps.
