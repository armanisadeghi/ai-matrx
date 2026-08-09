# FEATURE.md — `lib/local-drafts`

**Status:** `active` — production
**Tier:** primitive (platform)
**Last updated:** `2026-08-09`

---

## Purpose

**The last-resort copy of unsaved in-memory work, in this browser.** Not a
persistence path — every feature still owns its real save. This exists for the
moment the app is about to LOSE in-memory edits and has no way to persist them:

- a tab is being hard-stopped (auth identity drift → forced reload),
- the page is unloading,
- a feature's saves have been failing long enough that the buffer is the only
  copy of the user's text.

**Snapshot first, block second.** Built for [FOUND_DEFECTS.md](../../FOUND_DEFECTS.md)
D132 (2026-08-08): a domain-wide auth cookie rotated under an open `/notes`
tab, every autosave was RLS-filtered to 0 rows for ~14 hours, and the
"Account Changed" overlay then forced a reload that threw the buffer away.

---

## Entry points

- `types.ts` — `LocalDraftInput` / `LocalDraft` / `DraftSource`
- `localDrafts.ts` — the whole API:
  - `registerDraftSource(id, collect)` → unregister. A feature registers ONE
    collector that returns everything it currently holds unsaved.
  - `captureDrafts(reason)` → the drafts written. Call it **before** anything
    that discards in-memory state.
  - `listDrafts(namespace, ownerId)` / `getDraft(namespace, entityId, ownerId)`
  - `discardDraft(namespace, entityId)` — restored, dismissed, or saved.
  - `subscribeDrafts(listener)` / `getDraftsVersion()` — a capture can land
    while a recovery UI is already on screen; a strip that only reads on mount
    would hide the rescue until a remount.
- `localDrafts.test.ts` — the round-trip + ownership + TTL guards.

**Consumers**

| Feature | Source | Capture triggers | Recovery UI |
|---|---|---|---|
| Notes | `features/notes/utils/notesDrafts.ts` (every `_dirty` record + any live editor buffer ahead of Redux), registered for the STORE's lifetime in `lib/redux/store.ts` | identity drift, sign-out, unload, 3 consecutive save failures | `NoteDraftRecoveryBanner` (open note) + `NotesDraftRecoveryList` (notes with no server row) |
| `components/layout/AuthSessionWatcher.tsx` | — | calls `captureDrafts` before the blocking overlay renders | — |

---

## Invariants

- **A draft is offered back ONLY to the `ownerId` that wrote it** — the account
  that TYPED it (the booted session identity Redux holds, which still names the
  typist after a cookie rotation), never the record's owner. The identity-drift
  case means the account holding the cookie after a reload is often not the one
  that typed, and on a shared note the editor is not the creator: stamping
  `created_by` would both hide a sharee's rescue from them and offer their
  words to somebody else.
- **A collector must outlive the UI.** Register for the app/store lifetime, not
  from a mounted component — unsaved state survives closing the last tab, and a
  capture at that moment must still find it.
- **Capture what the user SEES.** A feature that debounces keystrokes into its
  store must hand over the pre-debounce buffer; rescuing the store copy minus
  the last sentence is its own small data loss.
- **Never auto-apply a draft.** Silently overwriting server content with a
  browser snapshot is a second way to lose work. The UI offers Restore /
  Discard / Copy; the user decides.
- **Storage is best-effort, never a throw.** Disabled storage, private mode and
  quota errors degrade to "no draft" — a save path must never break because a
  backup could not be written.
- **This is not a database.** Drafts expire after 7 days, a single draft is
  truncated past 400k chars (with a visible marker), and the whole store is
  capped at 1.5M chars, oldest dropped first.
- **Every capture screams.** A capture means real user text existed only in a
  browser buffer; the paths that trigger one also fire `captureError` with
  source `unsaved-work` (never downgrade that tier — the whole point is that
  D132 was ignorable for 14 hours).

---

## Adding a consumer

1. Write a collector that maps your feature's unsaved entities to
   `LocalDraftInput[]` — one file, no storage logic (see
   `features/notes/utils/notesDrafts.ts`). Read the live buffer, not just the
   debounced store copy.
2. Register it once for the store's lifetime (`lib/redux/store.ts`), not from a
   component. `registerDraftSource` is idempotent per id.
3. Render a recovery affordance where the entity opens, and — if the entity can
   exist with no server row — a surface-level list so an unrecoverable record
   still has a door.

---

## Change log

- `2026-08-09` — Post-review hardening: collectors capture the pre-debounce
  editor buffer, drafts are stamped with the typing account, the notes source
  registers for the store's lifetime, and the store notifies subscribers.
- `2026-08-09` — Created. Generic snapshot store + notes consumer + capture
  before the `AuthSessionWatcher` blocking overlay (D132 remainder a).
