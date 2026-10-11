# FEATURE.md — `education/notes` (Smart Notes)

**Status:** `live` · **Tier 2** · Education Hub tool at `/education/notes`.

Read [`../convert/FEATURE.md`](../convert/FEATURE.md) (converter contract) and
[`features/notes/FEATURE.md`](../../notes/FEATURE.md) (the note engine) first. This feature is the
education skin over them: a note surface where every note is one click from becoming any other
study artifact, plus live lecture capture into the editor.

## Where it lives

- Routes: `/education/notes` (`EduNotesHome`), `/new` (`EduNoteNew`, `NotesAPI.create` then
  redirect), `/[id]` and `/[id]/edit` (`EduNoteWorkspace` = `EduNoteActionBar` + single-note
  `NotesView`).
- `notesGenerator.ts` — the converter `notes` target (mandate `education.notes_generate`, in
  `mandates.ts`): agent → real platform note in folder `STUDY_NOTES_FOLDER`
  (`study-notes-folder.ts`) → `recordSourceLineage` to the origin. The registry of all converter
  targets is `convert/generators/index.ts`.
- `education-notes.ts` and `educationNoteAgentWrites.ts` — list reads and agent write targets.

## Rules

- **Thin skin, zero forks.** Notes ARE platform notes (`workbench.notes`): storage, editor,
  autosave, sharing and RAG belong to `features/notes`. No education note table exists or should.
- **Convert** is the shared `ConvertContentDialog` (`origin={kind:'note',...}`) driving
  `useContentConverter().convert`; never a bespoke generation path. Metered targets show
  `remaining` BEFORE the action (`useEntitlementGuard`). Target availability is read live from the
  registry (`isTargetAvailable`). Dialog and lineage rules: `../convert/FEATURE.md`.
- **Lineage** edges are `role='source'`, artifact (source) → note (target), written by the generator
  through `recordSourceLineage`; the reverse read (`lineage.ts`, `GeneratedFromChips`) filters
  `direction==='incoming' && role==='source'`. No note-local lineage code.
- **Live capture** (`LiveCaptureButton`) drives the ONE global recorder via `useVoiceCapture` with
  `instanceId: noteId` and `onChunk` — never its own recorder (start-always-wins arbitration, Audio
  panel registry, and the heavy recording graph stays out of this chunk). Each chunk appends to the
  freshest live Redux content (`updateNoteContent`) so concurrent manual edits are never clobbered;
  recording-state reads are gated on the note's `instanceId`.
- The action bar is Back · Live capture (owners/editors) · Convert · canonical `ShareButton` ·
  "generated from this" chips.

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/STATE.md — read it before touching this feature in ANY repo.
