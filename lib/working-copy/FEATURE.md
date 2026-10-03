# lib/working-copy — one in-memory working copy per record, editors are views

**THE LAW (owner, 2026-10-02):** every screen survives hide/show/remount with no lost work and no
repeated side effects. A record's working state lives in a store keyed by the record; every editor that
shows it is a VIEW of that state; subscriptions and server open/close happen once per record.

## The pieces

| File | What it is |
|---|---|
| `recordSessions.ts` | `createRecordSessionRegistry` — ONE session per record id per tab, ref-counted by its views. The last view leaving runs `lastViewGone` (flush); the session is dropped only once that settles and `canDrop` holds, so a view that comes back meanwhile (a remount, a board tile waking, StrictMode) re-attaches to the SAME live session, never one rebuilt from a stale server copy. `close` runs once. |
| `coalescedCommit.ts` | `createCoalescedCommit` — the ONE save path for a record: debounced, never two writes at once (an edit during a write commits right after it), `flush()` resolves when everything asked for has been written, a failed write stays pending. `flush(reason, force)` writes even with nothing pending (an explicit "save a snapshot now"). |
| `workingCopyStore.ts` | `createWorkingCopyStore<T>` — a plain-value working copy (a note's body) on the two above: `edit` (every view updates now, one commit later), `adopt` (the record's source moved — taken unless typing is pending), `reset` (the record already holds it — drop pending), `flush`, `attach` (a view; the last one commits and releases the copy so the record's own store is the truth again), `subscribe`. |

## Consumers

- **Notes** — `features/notes/utils/noteLiveContent.ts` (`noteWorkingCopy`, committing through
  `updateNoteContent`) + `features/notes/hooks/useNoteWorkingCopy.ts`, used by `NoteContentEditor` and
  `MobileNoteEditor`. Two views of one note show one text and commit once; undo is the note's Redux history.
- **Documents (Univer)** — `features/data-tables/document-model/documentModel.ts`: a `DocumentModel` per
  document on `createRecordSessionRegistry` + `createCoalescedCommit`; the body stays Univer's and is
  replayed between views by mutation; status in Redux `documentSessions`.

A new record editor (a file's inline text, a task description, a workbook) gets the same guarantees by
holding its working state here — never in component state, never with its own timer.

## Tests

`__tests__/working-copy.test.ts` (one session per record, last-view flush, no overlapping writes, failed
write stays pending, adopt never clobbers typing, reset drops pending). Consumer seams:
`features/notes/__tests__/one-note-many-views.test.tsx`,
`features/data-tables/__tests__/one-document-many-views.test.ts`.

## Change Log

- 2026-10-02 — Created (remount-safety lane): the registry, the coalesced commit and the value store;
  adopted by notes and documents.
