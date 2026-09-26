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
  accept is always a commit to the check's own allowlist, never a database write: the dialog
  takes a required reason and shows the exact `findings accept` command (P2-COMMANDS.md) with the
  reason filled in, and a copy button (`copyToClipboard`, manual-copy dialog on refusal).
- matrx-frontend checks with no adapter (`accept: null` in the registry) get "No accept — why?"
  instead, showing the registry's own `noAccept` words. aidream's adapter list is not visible
  from here; its command refuses by name when a check has none.
- `ops.check_item_db_accept` (the DB accept for an item with no repo home) is server-only and
  no item can reach it today, so the page offers no control for it. If a check without a repo
  ever becomes possible, it needs a super-admin door (`public.is_super_admin()`, a
  `platform.client_callable_door` row before the GRANT — precedent
  `migrations/sch_admin_doors_close_the_staff_write_arm_2026_09_26.sql`) and a button here.

## Known gaps

- Accepted-by-allowlist items show "in the <repo> allowlist": the reason, who and when live in
  that file, not in the database.
- "First seen" is the item row's `created_at` (ingest time), not the first run's commit time.
- Production had 0 runs and 0 items on 2026-09-26: no ingest has run there yet
  (`aidream/scripts/checks/ingest.py` is hand-run; no schedule approved).

---

## Change Log

- `2026-09-26` — Created: board, per-check findings by work unit, state filters, Mark OK via the
  allowlist command. Empty state verified live on localhost; populated state verified with an
  uncommitted fixture route (never shipped).
