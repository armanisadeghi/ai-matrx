# `pnpm check:dead-ends --self-test`

Proof that the detector can still FAIL. A guard that cannot fail is worse than
no guard, because a green run then launders the class as covered.

**`cases.ts` is THE table.** Every arm lives there — the file, how many findings
it must produce, which entity they must name, which entity they must NEVER name —
and it is read by both `--self-test` and
`scripts/dead-ends/__tests__/toast-names-record.test.ts`, so the CLI proof and the
jest suite cannot disagree about what the rule is supposed to see.

| File | What it is |
|---|---|
| `agenda-panel-pre-fix.tsx.fixture` | `features/google-workspace/calendar/AgendaPanel.tsx` **verbatim at commit `66f75b7a`** (`git show 66f75b7a:features/google-workspace/calendar/AgendaPanel.tsx`) — the surface that created a note, named it in a toast, and left it reachable from nothing (V-20 N10, 2026-09-18). `toast-names-record` must report it. |
| `v21-calendar-event-toast.tsx.fixture` | Hostile verifier **V-21**'s first probe arm (2026-09-18): a surface that creates a calendar event and names it in a toast with no door. It produced **no finding at all** because `calendar_event` was missing from the entity registry this checker reads its vocabulary from. Must report exactly one HIGH finding on `calendar_event`. |
| `v21-google-document-toast.tsx.fixture` | V-21's second arm: imports a Google file and names it in a toast with no door. It DID report — against `udt_document`, the platform's own custom-data document, because the bare word `document` was mapped to that token. Must report one finding on `google_document`, **never** `udt_document`. |
| `v21-toast-carries-the-door.tsx.fixture` | V-21's control: the same two creations, each toast carrying exactly the `action` door the remedy asks for. Must report NOTHING — a rule that flags its own remedy teaches agents to delete correct doors. |

The GREEN half is the live
`features/google-workspace/calendar/AgendaPanel.tsx` (fixed in `be673b90`: the
toast carries an `action` door and the row keeps one). It is read from the tree,
not copied here, so a regression on the real file fails the self-test by name
instead of passing against a frozen copy.

The `.fixture` extension is deliberate: `shouldScanFile()` only scans `.tsx`, and
`pnpm check:parse` / `pnpm type-check` only read tracked `.ts`/`.tsx`, so these
bytes are never compiled, scanned, or counted as a finding in the real report.
