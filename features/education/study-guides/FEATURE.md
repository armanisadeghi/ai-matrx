# Education study guides

Additive study reader at `/education/study-guides` and `/education/study-guides/[id]`. Existing Notes remain the source of truth; the Education note action bar opens the same note in this reader.

## Ownership and composition

- `components/StudyGuideReader.tsx` composes the existing shell, `RichDocument`, Notes outline parser, registered resizable panels, tutor, feedback, and flashcard window openers.
- `service.ts` reads the personal guide library and canonical note records. Direct links keep the usual record-access gate. Failed reads stay distinct from absent records.
- Highlights and side notes are personal Notes with `metadata.studyAnnotation` containing the quote, annotation kind, and text anchor. A canonical note-to-note `source` association links each annotation to its guide. The source content is never rewritten to paint highlights.
- An annotation uses the guide's organization explicitly. A failed association preserves the saved note and returns its identity for retry without creating a duplicate.
- Key terms come from flashcard sets associated with the note and their canonical card membership edges. Clicking a term opens the existing flashcard item window.
- Complete collection reads use `readAllRows` with exact counts. Association collection RPCs are paginated at the shared host port in `features/scopes/host/readAssociationPages.ts`.

## Checks

Focused tests cover missing organization, partial-save retry, annotation ownership, paginated association results beyond 1,000 rows, later-page failure, and strict note-read errors. Local browser acceptance remains pending: independent panel scrolling/resizing/collapse, heading navigation, selection actions, annotation reload, and the flashcard window. On 2026-09-20 the managed preview timed out, its restart hit the 300-second no-progress watchdog, and the next start was refused because a different checkout held the machine-wide preview slot. Source review and automated tests do not replace this acceptance pass.

## Changelog

- 2026-09-20: Added the Education study reader alongside Notes, using existing content and association primitives.
