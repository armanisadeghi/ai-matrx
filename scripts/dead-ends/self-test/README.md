# `pnpm check:dead-ends --self-test`

Proof that the detector can still FAIL. A guard that cannot fail is worse than
no guard, because a green run then launders the class as covered.

| File | What it is |
|---|---|
| `agenda-panel-pre-fix.tsx.fixture` | `features/google-workspace/calendar/AgendaPanel.tsx` **verbatim at commit `66f75b7a`** (`git show 66f75b7a:features/google-workspace/calendar/AgendaPanel.tsx`) — the surface that created a note, named it in a toast, and left it reachable from nothing (V-20 N10, 2026-09-18). `toast-names-record` must report it. |

The GREEN half is the live
`features/google-workspace/calendar/AgendaPanel.tsx` (fixed in `be673b90`: the
toast carries an `action` door and the row keeps one). It is read from the tree,
not copied here, so a regression on the real file fails the self-test by name
instead of passing against a frozen copy.

The `.fixture` extension is deliberate: `shouldScanFile()` only scans `.tsx`, and
`pnpm check:parse` / `pnpm type-check` only read tracked `.ts`/`.tsx`, so these
bytes are never compiled, scanned, or counted as a finding in the real report.
