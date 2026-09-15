# lib/failure — a transport refusal is not a sentence, and neither is Postgres

Setting a mandate's bottom-rung holder failed on production (walk of
2026-09-08) with a toast reading, in full: **`Failed to fetch`**. An identical
retry then succeeded. Two laws broken at once — a screen said something no
person can act on, and an automatic condition announced itself with no remedy.

`Failed to fetch` is not the server's word. It is the browser's word for "the
request did not complete", and it carries a fact that matters more than the
string: **nobody knows whether the server acted.** That uncertainty belongs on
the screen, with the remedy attached.

The same law broke the other way on `/masterwork/new?approach=interview` (wall
W2, 2026-09-15): an Expert was shown, on the page and in a toast,
**`canceling statement due to statement timeout (57014)`**. That is Postgres
talking to a DBA. A door's refusal and the ENGINE's own words are not the same
thing — our RPCs raise sentences written for people; the engine raises SQLSTATE
prose written for operators, and a retry is its honest remedy.

- **`transport.ts`** — `describeFailure(error, { action, retrySafe, fallback })`
  → `{ sentence, remedy, transient, raw }`. A transport refusal is rewritten
  (the exact strings Chromium/Safari/Firefox/undici use, plus
  `AbortError`/`TimeoutError`); so is a **database refusal**, classified by
  SQLSTATE via `databaseRefusal(error)` → `timeout` (57014) | `busy` (53xxx,
  57xxx) | `conflict` (40xxx) | `dropped` (08xxx), with the engine's verbatim
  phrasings as a fallback when the code was lost upstream. A cancelled
  statement says "nothing was changed" (PostgREST runs each request in its own
  transaction, so the rollback is a fact); a dropped connection carries the same
  uncertainty a transport refusal does. A DECISION is not a refusal — `42501`
  permission denied and anything our own functions raised pass through word for
  word, non-transient, because a retry there would be a lie. `retrySafe` is the caller's promise that the write is
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
four goal/input saves and drafts) · `features/masterwork/browse/useApproachRegistry.ts`
(every Approach surface — the W2 wall) · `components/admin/CredentialExpiryNotifier.tsx`.

**Still to adopt:** ~100 call sites repo-wide still print
`error instanceof Error ? error.message : String(error)` at a person. Boy-scout
rule — convert the ones you touch; each is one line.

**Guards:** `__tests__/transport.test.ts` (the `Failed to fetch` toast) ·
`__tests__/database-refusal.test.ts` (the W2 engine prose), both proven
failing-then-passing.

**Verified:** 2026-09-15.
