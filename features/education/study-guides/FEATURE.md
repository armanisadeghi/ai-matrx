# Education study guides

Additive study reader at `/education/study-guides` and `/education/study-guides/[id]`. Existing Notes remain the source of truth; the Education note action bar opens the same note in this reader.

## Ownership and composition

- `components/StudyGuideReader.tsx` composes the existing shell, `RichDocument`, Notes outline parser, registered resizable panels, tutor, feedback, and flashcard window openers.
- `service.ts` reads the personal guide library — my notes in the Education study folder (`STUDY_NOTES_FOLDER`, `features/education/notes/study-notes-folder.ts`, where the notes generator writes) — and canonical note records. An ordinary draft is a note, not a guide; any note still opens here by direct link. Direct links keep the usual record-access gate. Failed reads stay distinct from absent records.
- Highlights, private notes, comments, suggestions and passage links come from the ONE annotation sidecar (`features/rich-document/annotations/`, RC-B11): the reader wraps `RichDocument` in `<AnnotatedContent>` and the Notes tab is `<AnnotationPanel>`. The guide is the source `note:<id>` at its `version`. Private highlights/notes are `content.document` annotation rows + an `annotates` edge filed under the reader's OWN organization (chair ruling 2026-09-25), comments are parent-governed `platform.comments`. The tutor and "Report an issue" ride the sidecar toolbar as study-only passage actions. The source content is never rewritten to paint.
- Passage writes (highlights, passage comments, suggestions, passage links) are refused before any request while `ANCHOR_WRITES_ENABLED` is false (RC-A5); whole-guide comments, private notes and links work now.
- The transitional Notes adapter (`custom_fields.studyAnnotation` notes + note→note `source` edges) is removed from code; its existing rows still exist and belong to the storage migration census.
- Key terms come from flashcard sets associated with the note and their canonical card membership edges. Clicking a term opens the existing flashcard item window.
- Complete collection reads use `readAllRows` with exact counts. Association collection RPCs are paginated at the shared host port in `features/scopes/host/readAssociationPages.ts`.

## Checks

Focused tests cover missing organization, partial-save retry, annotation ownership, paginated association results beyond 1,000 rows, later-page failure, and strict note-read errors. Local browser acceptance remains pending: independent panel scrolling/resizing/collapse, heading navigation, selection actions, annotation reload, and the flashcard window. On 2026-09-20 the managed preview timed out, its restart hit the 300-second no-progress watchdog, and the next start was refused because a different checkout held the machine-wide preview slot. Source review and automated tests do not replace this acceptance pass.

## Changelog

- 2026-09-25: Adopted the canonical annotation sidecar (RC-B11); removed the transitional Notes annotation adapter and its tests.

- 2026-09-20: Added the Education study reader alongside Notes, using existing content and association primitives.
- 2026-09-25: The guide library lists only study-folder notes (it listed every draft and chat save); guard in `service.test.ts` (RC-B1 verify D1).
