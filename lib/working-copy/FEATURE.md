# lib/working-copy — THE one working-copy primitive (Redux-backed)

**THE LAW (owner, 2026-10-02):** every screen survives hide/show/remount with no lost work and no
repeated side effects. A record's working state lives in Redux, keyed by record; every editor that shows
it is a VIEW of that state; subscriptions and server open/close happen once per record. There is exactly
ONE implementation of this — here. A record editor never keeps its working text in component state or a
feature slice, and never runs its own save timer.

## The pieces

| File | What it is |
|---|---|
| `workingCopySlice.ts` | Redux `workingCopies.byKey["<entity>:<id>"]`: `value` (text records), `base`, `baseVersion`, `dirty`, `status` (idle/dirty/saving/saved/error), `saveError`, `savedAt`, `views`. Selectors `selectWorkingCopy`, `selectWorkingCopyValue`, `selectWorkingCopyStatus`; `getWorkingCopy` for non-React reads. Registered in `lib/redux/rootReducer.ts`. |
| `workingCopyKind.ts` | `defineWorkingCopyKind({ entity, save, delay, autosave?, createEngine?, … })` — per record: ref-counted views (`attach(id, store)`), `edit` / `touch` / `load` / `reset` / `discard` / `flush(id, reason, force)`, the ONE save path (debounced unless `autosave: false`, never two writes at once, a save asked for mid-save runs once after it, a failed save stays pending, the last view leaving flushes), and a module registry for non-serializable engines (`engine(id)`), keyed the same way. A synchronous `save` commits synchronously (a note's commit lands before an unmount returns). |
| `recordSessions.ts` | The keyed, ref-counted session registry under the kind: the last view leaving runs the flush; a view returning before it settles re-attaches to the SAME session; dropped only when nothing is pending. |
| `coalescedCommit.ts` | The scheduler under the kind (`schedule` / `mark` / `flush` / serialized runs). |

## Kinds (one per record type)

| Kind | Where | Save | Engine |
|---|---|---|---|
| `note` | `features/notes/utils/noteLiveContent.ts` (+ `hooks/useNoteWorkingCopy.ts`) | `updateNoteContent` into the note record (sync); `autoSaveMiddleware` persists | — |
| `file` | `features/files/redux/working-copy.ts` (+ `hooks/useFileWorkingCopy.ts`) | `saveFileNewVersion` — a new version, so `autosave: false` (Save, or the last view leaving) | — (Monaco keeps its own model) |
| `udt_document` | `features/data-tables/document-model/documentModels.ts` | a new `udt_document_snapshots` row | `DocumentModel` (Univer body, mutation relay between views, snapshot channel, collab room) |

A new record editor (a task description, a workbook) adds a kind here — never a second copy of this.

## Tests

`__tests__/working-copy.test.ts` (one session per record, last-view flush, serialized writes, failed
write stays pending, Redux-backed kind: shared copy, last-view commit + release, moved source never
clobbers typing, reset drops pending, `autosave: false`). Consumer seams:
`features/notes/__tests__/one-note-many-views.test.tsx`,
`features/data-tables/__tests__/one-document-many-views.test.tsx`,
`features/files/components/core/FileEditor/__tests__/CloudFileInlineEditor.working-copy.test.tsx`.

## Change Log

- 2026-10-03 — Converged to ONE Redux-backed primitive (`workingCopySlice` + `defineWorkingCopyKind`);
  the module-level value store is deleted; notes, files (from `cloudFiles.workingCopies`) and documents
  (from `documentSessions`) all run on it.
- 2026-10-02 — Created (remount-safety lane): registry, coalesced commit, value store.
