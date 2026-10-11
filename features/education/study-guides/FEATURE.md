# Education study guides

Additive reader at `/education/study-guides` and `/education/study-guides/[id]`. Notes stay the source of truth (a guide is a platform note, see `../notes/FEATURE.md`); the Education note action bar opens the same note here.

## Where it lives and rules

- `components/StudyGuideReader.tsx` composes the shell, `RichDocument`, the Notes outline parser (`outline.ts`), registered resizable panels, tutor, feedback and flashcard window openers. The outline renders only for a loaded guide.
- `service.ts` — the library is `listEducationNotes({ owner: "mine" })` (only notes marked for Education; an ordinary draft or chat save is a note, not a guide). Any readable note still opens by direct URL through the usual record-access gate. Failed reads stay distinct from absent records. Create / update / archive use the canonical Notes paths (`NotesAPI`) with `EDUCATION_NOTE_CREATE_FIELDS`; updates are version- and organization-guarded.
- Highlights, private notes, comments, suggestions and passage links are the ONE annotation sidecar (`features/rich-document/annotations/`): the reader wraps `RichDocument` in `<AnnotatedContent>`; the Notes tab is `<AnnotationPanel>`; the guide is source `note:<id>` at its `version`. Private rows are filed under the reader's OWN organization; the first private highlight asks which workspace. The source content is never rewritten to paint. Suggestion Accept needs a splice-save the Notes source lacks, so a guide offers Reject only. Tutor and "Report an issue" ride the toolbar as study-only passage actions.
- Key terms come from flashcard sets associated with the note and their card membership edges; a term opens the flashcard item window. Pickers in this reader use `MatrxDynamicPanelHost`, never a modal `Sheet` (it makes search fields untypeable).
- Complete collection reads use `readAllRows` with exact counts; association collection RPCs paginate in `features/scopes/host/readAssociationPages.ts`.
- Agent surfaces: the library is `matrx-user/education-study-guides` (create/update/delete over the loaded list; create persists separately from navigation so a batch cannot unmount mid-write; updates carry the approved version as required `expected_version`); the reader is `matrx-user/education-study-guide`, validated by `studyGuideAgentWrites.ts`. Contract: `features/surfaces/guides/education-study-guide.md`.
- Note and comment write refusals list every problem at once (`collectProblems`).
