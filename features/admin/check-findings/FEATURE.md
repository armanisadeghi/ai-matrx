# FEATURE.md — `admin/check-findings`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-26`

---

## Purpose

The admin board for the checks store: every static check's last run, and each check's findings,
so every finding is seen and acted on. A false alarm is marked OK once, with a reason, so it
never raises again. Product truth and the store's design live in
`common-docs/projects/checks-run-in-the-app/` (PLAN.md v3, P2-STORAGE-DESIGN.md §3 + §7,
P2-COMMANDS.md); this file is the page's mechanics.

---

## Entry points

**Route** — `app/(admin)/administration/reporting/check-findings/page.tsx` (server leaf; reads
`scripts/findings/registry.mjs` to tell the console which matrx-frontend checks have an accept
adapter). Registered in `features/admin/constants/admin-categories.ts` (Reporting) and
`admin-navigation.ts` (Platform Reporting). Surface: `matrx-admin/reporting`,
`reporting_section: "check_findings"`.

- `/administration/reporting/check-findings` — the board: one row per `ops.proof_check` with
  `kind='static'`: verdict, open count (claimed shown), oldest open age, last run (overdue when
  older than 2 × `live_every_seconds`), duration, scan complete, repo, level, accepted count,
  why broken.
- `?check=<proof_check id>&state=open|accepted|fixed|broken|retired` — one check: its last run
  (time, duration, status, scope, scan completeness, commit linked on GitHub, counts, headline,
  apply note, why broken, re-run command) and its findings grouped by work unit (file:line linked
  on GitHub `main`, rule, title + key, first seen, last change; accepted: basis, reason, who/when,
  review date; fixed: when).

**Files**
- `service.ts` — the only reads (browser client; `readAllRows`, so nothing is silently capped).
  `CheckFindingsSource` is the seam a dev fixture can replace.
- `model.ts` — pure: per-check summary, reserved keys, state filters, the accept command.
- `CheckFindingsConsole.tsx` — the page (two `MatrxDataTable`s, the Mark OK dialog/drawer).
- `model.test.ts` — summary counts, overdue, command shape, shell round-trip.

---

## Data and access

- Reads `ops.proof_check`, `ops.check_run` (latest per check via an embedded
  `check_run(...)` ordered + limited on the referenced table), `ops.check_item`.
- All three are `confidential` (platform-admin only); the admin lane header on `/administration`
  is what lets a platform admin read them. A non-admin reads 0 rows. Clients have SELECT only;
  this feature writes nothing.
- `check_item.deleted_at` means FIXED — reads filter on `state`, never on `deleted_at`.
- Reserved keys `__check__`, `__summary__`, `__malformed__` are records about the check itself:
  they count as "broken", never as open items, and their row action says "fix the check".

## Mark OK (plan C1)

- Every item the store can hold has a REPO HOME: `ops.proof_check` refuses a static check without
  a `repo` (constraint `proof_check_static_identity`), and only static checks get items. So an
  accept is always a commit to the check's own allowlist, never a database-only write.
- **The button.** The dialog takes a required reason and "Mark OK" calls aidream
  `POST /admin/checks/accept` (super admin only; `acceptApi.ts` → typed client). The server
  (`aidream/services/platform_checks/accept.py`) uses THE CLI's adapter — aidream's
  `scripts/findings.py` `Adapter.edit`, or this repo's `scripts/findings/accept-rules.json` rule
  applied by its Python twin only after it reproduces `scripts/findings/accept-corpus.json`
  byte for byte — confirms the key against main's newest `repo-only-checks` artifact, and commits
  one fast-forward commit to main (author = the admin, co-author = the platform).
- **The in-between state** is `ops.check_item.metadata.pending_accept`, written only by the
  server-only `ops.check_item_accept_begin/_finish` (`migrations/ops_check_item_accept_marker_2026_09_26g.sql`).
  `model.ts` `pendingAcceptView`: *Marked OK — landing* (commit link) until the next ingested run
  marks the item accepted; *Mark OK failed* with the server's error + remedy (claimable again);
  *interrupted* for a committing marker older than 5 min; *accept landed, still reported* when a
  run that started after the commit still lists it. A second click is a no-op (`already_landed`).
- The one-line `findings accept` command stays in the dialog as the secondary path ("Prefer a
  terminal?").
- matrx-frontend checks with no adapter get "No accept — why?" with the rules file's own
  `no_accept` words; the server refuses those (and aidream's) in the registry's words too.
- `ops.check_item_db_accept` (the DB accept for an item with no repo home) is server-only and
  no item can reach it today, so the page offers no control for it.

## Known gaps

- Accepted-by-allowlist items show "in the <repo> allowlist": the reason, who and when live in
  that file, not in the database.
- "First seen" is the item row's `created_at` (ingest time), not the first run's commit time.
- Production holds ONE check today (`visibility-vocabulary`, two owner hand-run ingests on
  2026-09-26); no schedule is approved, so nothing else arrives until one is.
- At a ~800px-wide window the findings table's Actions column (Mark OK) is not reachable by
  scrolling; it shows at ~1500px. Not fixed here.

---

## Change Log

- `2026-09-26` — Created: board, per-check findings by work unit, state filters, Mark OK via the
  allowlist command. Empty state verified live on localhost; populated state verified with an
  uncommitted fixture route (never shipped).
- `2026-09-26` — Mark OK is a real button: server commit via aidream `POST /admin/checks/accept`,
  "Marked OK — landing" marker, loud failure with remedy, copy-command kept as secondary. Verified
  on localhost as admin@admin.com against a real production ingest: commit `6d263b0bff` landed on
  main, the next ingest marked the item accepted (basis allowlist).
