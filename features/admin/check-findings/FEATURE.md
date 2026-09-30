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
- Reserved keys `__check__` and `__malformed__` are records about the check itself: they count
  as "broken", never as open items, and their row action says "fix the check". `__summary__` is
  NOT broken: the check judged and FAILED without an item list (design F9), so the page counts it
  as "failing without an item list", shows its headline as the finding, and its row action says
  "fix what it names" (2026-09-30: all 71 "broken" on the first production ingest were
  `__summary__`). A check that could not judge reaches `__check__` because both runners title it
  "check <id> could not establish truth: …" (an UNMEASURED headline or an uncaught exception) and
  the ingest records that run `errored`.

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
  run that started after the commit still lists it. Mark OK stays drawn on that state and WORKS:
  the server re-reads main — a reverted accept is committed again; an accept main's newest run
  already carries yet still reports is recorded *Mark OK failed* with "the entry does not match
  what the check reads" and the fix (`landed → failed`,
  `migrations/ops_check_item_accept_landed_can_fail_2026_09_26h.sql`). `already_landed` is said
  only while main still carries the accept and its newest run predates it, and it is an info
  toast, never a success (`model.ts acceptOutcomeTone`). A retry after an uncertain outcome is
  safe: the server reads main at HEAD first and never writes a second entry.
- **Failure titles never guess.** `refused` = nothing written; `failed` = "Mark OK failed" with the
  server's message + remedy, which say whether anything reached main (checked, or "not known");
  `error` (`accept_error`) = the server stopped before committing anything; `unreachable` = no
  answer at all.
- **Where the button lives.** Mark OK (or "No accept — why?", or "fix the check") is drawn INSIDE
  the State cell, and State is the second column right after Finding, so the decision is on screen
  at every width from 375px (the phone card carries the State cell) without scrolling sideways. It
  used to be the trailing Actions column, which sat past the right edge below ~1500px; the group
  label (work unit) also lived in the first column with a 60vw cap and blew the old leading State
  column out to ~480px. Finding now leads (the label lands in the wide column, capped at 20rem).
- The one-line `findings accept` command stays in the dialog as the secondary path ("Prefer a
  terminal?").
- A check with no adapter — matrx-frontend (its rules file's `no_accept` words) or aidream (the
  server's findings REGISTRY via `GET /admin/checks/accept-adapters`, `acceptApi.ts
  fetchAidreamAcceptAdapters`; a check the registry does not list has none) — gets "No accept —
  why?" instead of a Mark OK that could only refuse (`model.ts acceptInfoFor` / `hasAccept`). If
  that list cannot be read, Mark OK stays and the server refuses by name.
- `ops.check_item_db_accept` (the DB accept for an item with no repo home) is server-only and
  no item can reach it today, so the page offers no control for it.

## Known gaps

- Accepted-by-allowlist items show "in the <repo> allowlist": the reason, who and when live in
  that file, not in the database.
- "First seen" is the item row's `created_at` (ingest time), not the first run's commit time.
- aidream `file-access-gate` matches `gh.get_file(...)` (a GitHub contents read in
  `aidream/services/platform_checks/accept.py`) as a raw user-file lookup; one of the three was
  Marked OK on 2026-09-26, the other two are the same false alarm and the class fix belongs in the
  check's `_RAW_LOOKUP` pattern.
- Production holds ONE check today (`visibility-vocabulary`, two owner hand-run ingests on
  2026-09-26); no schedule is approved, so nothing else arrives until one is.

---

## Change Log

- 2026-09-30 — `__summary__` is no longer "check broken": it is a check that judged and failed without an item list (`unitemizedFailure`, header "N failing without an item list", row action "fix what it names"). "Check broken" now means only `__check__` / `__malformed__` — the check crashed, timed out, did not measure, or printed unreadable items (`model.test.ts`).

- 2026-09-30 — A check's latest run that read the nightly copy (database-reading checks, `check_run.metadata.db_target`) says so in the check header, with the copy's date (`copySourceFromMetadata`, tested in `model.test.ts`). A run skipped because the copy was too old shows `skipped (copy_stale)` with the reason as its headline.

- `2026-09-26` — Created: board, per-check findings by work unit, state filters, Mark OK via the
  allowlist command. Empty state verified live on localhost; populated state verified with an
  uncommitted fixture route (never shipped).
- `2026-09-26` — Mark OK is a real button: server commit via aidream `POST /admin/checks/accept`,
  "Marked OK — landing" marker, loud failure with remedy, copy-command kept as secondary. Verified
  on localhost as admin@admin.com against a real production ingest: commit `6d263b0bff` landed on
  main, the next ingest marked the item accepted (basis allowlist).
- `2026-09-26` — Mark OK reachable at every width: the decision moved into the State cell, State
  follows Finding, group label capped at 20rem. Verified on localhost at 375 / 800 / 1024 / 1500.
- `2026-09-26` — aidream half proven end to end through PRODUCTION's `POST /admin/checks/accept`
  (it now answers 401 unauthenticated, 404 for an unknown path): owner hand-run ingest of
  aidream `file-access-gate` (8 open), Mark OK on item `714496e5` as admin@admin.com → refused
  honestly first ("main's newest checks run does not report it" — the CI artifact predated
  `accept.py`), then after a fresh `repo-only-checks` run landed aidream `4167f2aea1` (author
  admin@admin.com, reason + Accepted-by in the message and a `reasons` entry in
  `scripts/file_access_gate_baseline.json`); re-run on that commit reported it known/accepted and
  the re-ingest marked it `accepted` (basis allowlist), opened 0; the open list went 8 → 7.
- `2026-09-26` — MARK-OK-VERIFY D1–D7 fixed: no lying button after an accept that did not take or
  a revert; idempotent against main at HEAD; truthful failure titles; aidream checks with no
  adapter show "No accept — why?"; engines refuse odd inputs alike (corpus `refused: true` cases).
