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
| `useKeptTextSelection.ts` | A text view puts the caret back where the person left it: on unmount the selection is kept under the record key (`workingCopies.selections`, which outlives the entry), on mount it is restored (never over a field the person is typing in elsewhere). Notes' plain / split textarea uses it. |

## Guarantees every kind inherits (2026-10-03)

- **A failed save is retried here**, view or no view: backoff 1s → 30s (parks after 10 passes at the
  cap), no write while `navigator.onLine` is false, at once on `online` / the tab becoming visible.
  `isPermanentSaveFailure` (403/404/409/412/422, `42501`, permission / RLS / conflict words) stops it:
  the entry shows `failure.permanent` and waits for `kind.retry(id)` or `kind.discard(id)`. The session
  is held (`canDrop`) until the edit is saved or the person resolved it. Kinds report via
  `onSaveFailed(id, message, reason, { permanent, attempts })` — toast once per streak.
- **No silent lost update.** `base` / `baseVersion` stay what the edit started from. A stored state
  that moves under unsaved work becomes `entry.conflict` (status `conflict`) — from `load`, from the
  kind's `source(id, store)` read right before every save, or from an engine's `handle.conflict(...)`.
  Our own write's echo (`entry.writing`) and a source equal to the base or to the person's text are not
  conflicts. Nothing is written until `kind.resolveConflict(id, "mine" | "theirs" | "merge", merged)`;
  `mergeText` is a line three-way merge that refuses overlapping edits. A reload draft carries
  `draftBaseVersion` / `draftBase`; another version loaded = conflict.
- **On screen:** `WorkingCopyAlert` (one row: Merge · Keep mine · Take theirs, or Retry · Discard).
  With no view: `announce.ts` (`announceWorkingCopyConflict`, a toast that stays until chosen).
- **A save can report a conflict**: a kind's `save` throws `WorkingCopySaveConflict({ theirs, version })`
  when its compare-and-swap was refused — the entry opens the conflict (nothing written, no retry).
  `conflictChosen` / `discarded` let a text kind's record adopt the person's choice.
- **`touch` on a text kind** marks the record's other fields unsaved (`touchedSeq`); **`request(id, store)`**
  saves a record no view holds (a rename, an agent's write, Save) through the same path, held until it lands.
- **Notes** mark the record's body edited at the first keystroke (`onDirtyChanged` → `noteContentEditPending`)
  and their save IS the database write (see Kinds).

## Kinds (one per record type)

| Kind | Where | Save | Engine |
|---|---|---|---|
| `note` | `features/notes/utils/noteLiveContent.ts` (+ `hooks/useNoteWorkingCopy.ts`, `redux/noteSaveRequests.ts`) | the database save: `updateNoteContent` (undo step) → auto-label → `writeNoteRecord` (version CAS) | — |
| `file` | `features/files/redux/working-copy.ts` (+ `hooks/useFileWorkingCopy.ts`) | `saveFileNewVersion` — a new version, so `autosave: false` (Save, or the last view leaving) | — (Monaco keeps its own model) |
| `udt_document` | `features/documents/document-model/documentModels.ts` | a new `udt_document_snapshots` row | `DocumentModel` (Univer body, mutation relay between views, snapshot channel, collab room, and the last view's Univer instance KEPT — parked off the page and re-attached to the next view's container, so undo / redo survive hide/show and remount; disposed on `close`) |

A new record editor (a task description, a workbook) adds a kind here — never a second copy of this.

## Tests

`__tests__/working-copy.test.ts` (one session per record, last-view flush, serialized writes, failed
write stays pending, Redux-backed kind: shared copy, last-view commit + release, moved source never
clobbers typing, reset drops pending, `autosave: false`). Consumer seams:
`features/notes/__tests__/one-note-many-views.test.tsx`,
`features/documents/__tests__/one-document-many-views.test.tsx`,
`features/files/components/core/FileEditor/__tests__/CloudFileInlineEditor.working-copy.test.tsx`.
`__tests__/working-copy-guarantees.test.ts` (retry after the last view, offline/online, permanent
failure, load / `source` / draft / engine conflicts, merge, echo), plus
`features/notes/__tests__/working-copy-no-lost-update.test.ts` and
`features/documents/__tests__/document-conflict.test.ts`.

## Change Log

- 2026-10-03 — Notes' one save door: `WorkingCopySaveConflict`, `request`, text-kind `touch`, `conflictChosen` /
  `discarded`, quiet session release; the note kind's save is its database write. Tests:
  `features/notes/__tests__/note-save-one-door.test.ts`.
- 2026-10-03 — Engines keep the editor, views keep the caret: a document's last view parks its Univer
  instance on the `DocumentModel` (`parkEditor` / `takeParkedEditor`) and the next view re-attaches it,
  so Univer's per-instance undo history survives (remount harness `udt_document:undo`); text views keep
  their selection per record (`useKeptTextSelection`, harness `note:split-view caret` now passing).

- 2026-10-03 — Retry with backoff for every kind; permanent failures wait for the person; conflict
  state (`conflict`, `resolveConflict`, `mergeText`, `WorkingCopyAlert`, `announce.ts`); notes hold
  their base from the first keystroke; documents route "changed elsewhere" into the conflict; file
  drafts compare their version on adopt.

- 2026-10-03 — Converged to ONE Redux-backed primitive (`workingCopySlice` + `defineWorkingCopyKind`);
  the module-level value store is deleted; notes, files (from `cloudFiles.workingCopies`) and documents
  (from `documentSessions`) all run on it.
- 2026-10-02 — Created (remount-safety lane): registry, coalesced commit, value store.
