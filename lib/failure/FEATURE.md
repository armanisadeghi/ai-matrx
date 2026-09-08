# lib/failure — a transport refusal is not a sentence

Setting a mandate's bottom-rung holder failed on production (walk of
2026-09-08) with a toast reading, in full: **`Failed to fetch`**. An identical
retry then succeeded. Two laws broken at once — a screen said something no
person can act on, and an automatic condition announced itself with no remedy.

`Failed to fetch` is not the server's word. It is the browser's word for "the
request did not complete", and it carries a fact that matters more than the
string: **nobody knows whether the server acted.** That uncertainty belongs on
the screen, with the remedy attached.

- **`transport.ts`** — `describeFailure(error, { action, retrySafe, fallback })`
  → `{ sentence, remedy, transient, raw }`. Only a transport refusal is
  rewritten (the exact strings Chromium/Safari/Firefox/undici use, plus
  `AbortError`/`TimeoutError`); a door's own refusal passes through word for
  word, non-transient. `retrySafe` is the caller's promise that the write is
  idempotent — it changes the remedy from "reload to confirm which way it
  landed" to "doing it twice changes nothing", so say it only when it is true.
  Offline is its own sentence, because then nothing was changed and we know it.
- **`toastFailure.ts`** — the toast that failure is allowed to make: the
  sentence, the remedy as its description, and a **Try again** button when the
  failure is transient and the caller supplied a retry. Returns the sentence so
  a screen can put the same words in its own inline slot rather than inventing
  a second opinion.

**Consumers:** `features/bindings/OneBindingWorkspace.tsx` (the save the walker
broke, and its remove) · `features/mandates/workspace/TriadSections.tsx` (the
four goal/input saves and drafts).

**Still to adopt:** ~100 call sites repo-wide still print
`error instanceof Error ? error.message : String(error)` at a person. Boy-scout
rule — convert the ones you touch; each is one line.

**Verified:** 2026-09-08.
