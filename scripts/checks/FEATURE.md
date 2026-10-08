# Release — the ship path and the after phase

Sibling of aidream's `scripts/FEATURE.md` § "The ship path"; the doctrine is
Arman's (2026-09-19/20) and identical in both repos. Cross-repo policy:
`../../../common-docs/policies/reality-is-the-referee.md`.

## The one rule

**Running the release script is never harder than a plain `git push`.** Nothing
stops a release except GitHub being unreachable or losing the push race five
times in a row. Not a failed check, not a failed migration, not a dirty
checkout, not a diverged branch, not an unmerged local commit. Every one of
those is a finding — an ERROR or WARNING row with a remedy — never a stop.

**The one exception: a lockfile no package manager can read** (2026-10-08). A
stop exists to protect shipping; this one IS shipping — Vercel refuses such a
file before it installs anything, so pushing it guarantees a failed build on
every project and ships nothing. Step 7 reads every `pnpm-lock.yaml` /
`package-lock.json` in the release tree (`scripts/check-lockfile-keys.py`,
offline, ~0.1 s): byte-identical duplicate blocks are dropped inside the release
commit (WARNING); anything else (blocks that differ under one key, a conflict
marker, JSON that does not parse) stops the release before the push (ERROR).
`scripts/sync-main.py` runs the same guard before every push to `main`.

## The ship path (`scripts/release.sh`, `RELEASE_PHASE=ship`)

Does ONLY what makes the build, in this order:

1. `--ship` (`./ship.sh "msg" -- <paths>`): commit EXACTLY the named paths in
   this checkout through `scripts/release-stage.sh` (THE RELEASE-COMMIT CONTENT
   LAW — never `git add -A`, never "whatever is staged"). No paths = bump-only.
2. Start applying pending migrations in the background: aidream's
   `db/apply_migrations.py --source matrx-frontend --target production
   --no-generate` from the sibling checkout (`AIDREAM_DIR`, default `../aidream`).
   No applier or no `uv` = an ERROR finding; a failed or refused file = an ERROR
   finding. `--no-migrate` skips it.
3. `git fetch origin main` — three tries, then the ONE honest stop.
4. Resolve the base tree on `origin/main` **with git plumbing, in the object
   database — no worktree, no branch, no stash** (Arman 2026-09-20: local
   worktrees and branches are forbidden; `git worktree list` shows exactly one
   entry). The shared checkout's files are never touched, so other lanes'
   uncommitted files, a diverged branch or a half-done merge cannot reach the
   release (`test:release-ship-path` proves it; `check:single-worktree` fails
   the release while any extra worktree or local branch exists anywhere).
5. Merge this checkout's unpushed `main` commits into that tree with
   `git merge-tree --write-tree`. A conflict = ship `origin/main` anyway + an
   ERROR finding naming the commit left behind. A checkout parked on another
   branch contributes nothing (WARNING).
6. Wait for the migrations.
7. THE LOCKFILE GUARD (`ship_guard_lockfiles`, see the exception above), then bump `package.json` in a temporary index (`GIT_INDEX_FILE` + `read-tree` +
   `hash-object`; skipping any tag already taken locally or on origin),
   `commit-tree` it with the Vercel prefix (`release:` / `release-admin:` /
   `release-demos:` / `release-all:`), push `<sha>:refs/heads/main`. A rejected
   push is a lost race only when `origin/main` really moved: fetch, re-resolve
   the base tree, re-merge, re-bump, retry (up to `SHIP_PUSH_ATTEMPTS=5`). A push that fails without main moving
   is a network blip: pause and retry, it never counts as a race.
8. Push the tag (lost tag = ERROR finding, the build already started),
   fast-forward this checkout when it can (WARNING otherwise), print

       vX.Y.Z  pushed, build started  (Ns)

   plus a findings table only when something is wrong. **INFO is never printed.**

"Build started" means the push landed carrying a release-prefixed commit: Vercel's
git integration (`vercel.json` → `scripts/vercel-ignore-build.sh`) builds every
such range and cancels every other push. Whether the build actually reached
READY is the after phase's first question.

## The after phase (`RELEASE_PHASE=after`, detached, never on the terminal)

Relaunched by the ship path with `nohup`, output appended to the same dated
log, holding its own lock (`--with-checks` runs it in the foreground instead;
`--no-gates` skips it entirely):

- **Rollout watch** — `scripts/release-outcome.sh` (THE RELEASE-BANNER TRUTH
  LAW): READY on every targeted Vercel project AND serving on the live domain
  is the only green; anything else is an ERROR finding `ROLLOUT FAILED: vX.Y.Z …`;
  no Vercel credential is a WARNING `UNVERIFIED`; `--no-watch` records
  `UNWATCHED`. It runs concurrently with the checks.
- **Checks** — `scripts/checks/run.mjs --skip-live-db`: ONE parallel runner (6 workers,
  database-touching rows throttled to 3) over every row of
  `scripts/run-release-gates.sh --list` plus the checks the old script ran
  before the push (`EXTRA_ROWS`: matrx-packages, organization-context,
  client-initiation, source-attribution, migration judgment, migration ledger
  strict, surface registration, patrol delivery, the two self-tests,
  vercel-ignore). A row's verdict is its exit code OR the scream tokens
  `run-release-gates.sh` has always matched (thirteen advisory gates were once
  printing green over real findings). Each row's full output goes to
  `tmp/checks/<id>.log`. The runner's exit code is always 0; 2 means the
  runner itself crashed.
- **No live database on the release path** (Arman, 2026-09-25: releases fire
  50-90 times a day; nothing that reads the live database may add load there).
  Every row carries a DECLARED class in `scripts/checks/row-classes.json`:
  `live-db` (can open the live database — gate-db / `SUPABASE_MATRIX_*`, a
  secret or service-role key, an admin or supabase-js client, a pg client, a
  PostgREST URL, `execute_admin_query`, the aidream applier), `clone-db`
  (reached only the nightly dev clone; the class is retired 2026-10-03 along with the clone checks leg), `repo-only`. The manifest is GENERATED
  by `scripts/checks/row-classes.mjs` (`pnpm checks:classify`), which resolves
  each row's command through package.json and `pnpm`/`npx`/`tsx`/`node`/`bash`
  hops, follows real import statements and child-process launches inside
  `scripts/`, scans (without following) imported app modules and jest test
  files, and tests signals on comment-stripped code with prose/fixture string
  literals blanked. The signal table is data: `row-classes.signals.json`. A row
  the resolver cannot fully follow (unknown binary, missing file, a file outside
  the repo, a python import of aidream) is `live-db` and the manifest says
  UNCERTAIN. `--skip-live-db` leaves out every `live-db` row — and every row
  the manifest does not know (the safe side) — and prints ONE line: how many,
  and that they live in `common-docs/systems/architecture/observability/projects/checks-run-in-the-app/PLAN.md`
  § "Moved off the release path (P0)" until the scheduled clone tick (P3); the
  JSON header gains `skipped_live_db: [...]` (not in `ran`, so the dispatcher
  resolves nothing for them). The same class drives the DB-slot throttle: only
  a declared `repo-only` row skips it. The label regex `DB_ROWS` that used to
  decide this is gone — it called 13 live rows non-DB (`check-access-parity`,
  `check:organization-context`, the jest suite…) and 18 static rows DB.
  Guard: `pnpm check:release-row-classes` (stale manifest, a missing or extra
  row, or a declared class that disagrees with detection = `[FAIL]`, exit 1) +
  `:self-test` (red on a mismatched manifest, green on the real one) — in CI
  (`marker-law` job) and as rows of `run-release-gates.sh`.
- **Heavy checks no longer default to the clone (ruling 2026-10-03, Arman: test on live as `admin@admin.com`; the clone is only for rehearsing destructive migrations and jobs that lock live 10+ minutes).** A heavy check runs on live, bounded by the production guard (every statement capped at 30 s, no loosening); it plants fixtures only as `admin@admin.com`'s disposable records. The text below is the 2026-09-27 design that defaulted them to the clone, kept as history until the code lane removes `defaultTarget: "clone"` and the `check:heavy-checks-target-the-clone` guard. Original text (2026-09-27, incident
  `common-docs/systems/architecture/database/projects/database-workload-safety/PLAN.md`:
  every warm live connection costs ~66 MB and our own censuses held them for
  minutes). A check that scans, censuses, sweeps for equivalence, plants
  fixtures or wants more than 30 s opens its database through
  `scripts/lib/check-target.ts` — `openCheckDb` (gate-db) or `connectCheckDirect`
  (connectDirect) with `defaultTarget: "clone"` — so it runs on the nightly clone
  unless the command says `--target production`, where every statement is capped
  at 30 s (`GATE_DB_LIMITS.liveStatementTimeoutMs`; `openGateDb` refuses more on a
  live connection, the production guard refuses loosening). A check whose meaning
  is live state RIGHT NOW (today's counters, the live policy set) keeps
  `defaultTarget: "production"` and stays bounded. Every run prints ONE
  `[TARGET]` line naming the database and the clone's `promoted` time (CLONE-REF),
  because the clone may trail live by the migrations since; a census that trips
  on an object the clone lacks is NOT MEASURED, never passed. A script that
  builds its own `pg.Client` on the live credentials wraps it in
  `guardIfProduction` (`scripts/lib/production-guard.ts`). Guard:
  `pnpm check:heavy-checks-target-the-clone` (+ `:self-test`; `--at <rev>` judges
  history) — R1 an unguarded raw client on live, R2 a clock above 30 s on a
  connection that can be live without the check-target helper; exceptions live
  WITH their reason in `scripts/heavy-checks-target-the-clone-allowlist.json`,
  shrink-only.
- **Rows share one checkout, so no row writes into it.** Six rows run at once
  over the same tree: a self-test that plants its RED fixture in `lib/`,
  `features/`, `migrations/`… is a fake finding for the scanner beside it (or an
  ENOENT when it vanishes mid-scan) and a commit for a concurrent sweep. A
  self-test plants in memory or in `mkdtempSync(join(tmpdir(), …))` and passes
  that root to the scan. Guard: `pnpm check:self-tests-stay-out-of-tree` (static
  AST, ~3 s: every write inside self-test code whose target evaluates into the
  checkout and is not gitignored) + `:self-test` (RED on the seven recorded
  pre-fix files, GREEN on today's); `--dynamic` runs every package.json
  self-test under `scripts/lib/self-test-tree-trap.cjs` and names each write
  that landed in the tracked tree (the census, minutes).
- **Findings** — `tmp/release-logs/findings-vX.Y.Z.jsonl`: first line
  `{"ran":[...]}`, then one JSON object per finding — `check, category, level,
  title (≤100), count, fingerprint, remedy, detail` — the exact shape aidream's
  `scripts/checks/run.py` writes. Ship-path findings (`findings-ship-*.jsonl`)
  and the rollout finding are appended to the same file.
- **Fixers** — none from a release (2026-09-26). The release used to call
  aidream's `scripts/checks/dispatch_fixer.py`, which launched CLI agents with
  approvals bypassed (the 2026-09-21 incident-2 cause). Findings now reach
  agents through the in-app path in
  `common-docs/systems/architecture/observability/projects/checks-run-in-the-app/PLAN.md`;
  `test:release-fail-forward` fails if a release calls the dispatcher again.

## Commands

| Command | What |
|---|---|
| `./ship.sh "msg" -- <paths>` / `./scripts/release.sh` | the release (see above) |
| `./scripts/release.sh --dry-run` | what would ship, from origin/main's point of view; nothing changes |
| `node scripts/checks/run.mjs [--json f] [--lane x] [--only id] [--list]` / `pnpm check:release-checks` | the runner, by hand |
| `node scripts/checks/run.mjs --skip-live-db` | what the release runs: every row but the declared live-db ones |
| `node scripts/checks/run.mjs --repo-only` | ONLY rows declared `repo-only` (clone-db, live-db, undeclared left out; header `skipped_not_repo_only`) — what `.github/workflows/repo-only-checks.yml` runs (dispatch-only; the app's `platform_checks_ci_pull` ingests its `checks-findings` artifact) |
| `node scripts/checks/run.mjs --db-only --target clone` | **RETIRED 2026-10-03** (the clone CI leg and `CLONE_CI_BUNDLE` are removed; database-reading checks run on live as `admin@admin.com` under the production guard). Was: ONLY rows that read a database (live-db, clone-db, undeclared), every one pointed at the nightly copy: the environment is prepared by aidream `scripts/checks/clone_target.py`, `clone-target-guard.cjs` is preloaded into every row and refuses production by host or `pg` user (a `[clone-target] REFUSED` line is an ERROR finding even if the row swallows it); header `db_target`. Runs ONLY from aidream's private `.github/workflows/clone-db-checks.yml` — never from this public repo's Actions |
| `pnpm checks:classify` / `pnpm check:release-row-classes[:self-test]` | regenerate the row-class manifest / the guard that it is current |
| `bash scripts/run-release-gates.sh [--strict]` | the old sequential gate runner — still the manifest (`--list`), still usable for one-by-one triage |
| `pnpm test:release-ship-path` | the sandbox guard: dirty checkout + diverged branch + push landing mid-release → tag on origin |
| `pnpm test:release-checks` | the runner at its seams (clean = one line; screams, hangs, exit codes → findings; JSON shape) |
| `pnpm test:release-fail-forward` | the wiring: no check before the push, nothing fails after it, after phase detached, no stash |
| `pnpm test:release-outcome` | the rollout watch is consulted in the after phase and a dead rollout is an ERROR finding |
| `pnpm findings [paths…] [--check id]` | NEW items (MATRX-ITEM) of the converted checks touching those paths, each with its fix and exact accept command; exit 1 when any. Registry + accept adapters: `scripts/findings/registry.mjs` |
| `pnpm findings accept <check> '<key>' --reason "…" [--no-commit]` | writes the key into THAT check's own allowlist (reason, accepted-by, date), re-runs it to prove the item is known and nothing else moved, commits only that file. Tests: `pnpm test:findings` |

## Timings (sandbox, 2026-09-20, disk under heavy load)

The sandbox guard ends with the tag on origin in ~60s wall on this machine with
the disk saturated (the same run is a few seconds idle). The plumbing ship path
writes no working folder at all, so there is no first-run checkout cost: the
earlier `.wt/release` worktree (17 minutes to create under load, 2026-09-20)
is gone with the worktree ban, and `.wt/` is only ever a janitor target now.

## What this replaced (2026-09-20)

The 916-line `release.sh` that ran, BEFORE the push and each one a reason to
stop: the divergence refusal (a diverged branch ended the release), the
Pattern Patrol delivery lease (a busy lane waited forever), patrol delivery
verification, `check:matrx-packages`, mandate-reference scanning,
`check:parse`, `check:organization-context`, migration judgment, the migration
sweep + `check:migrations:strict`, `check:entity-types`, the protocol-mirror
auto-sync commit, `check:source-attribution`, `check:client-initiation`, the
release-stage self-test, and (after the commit, before the push) the surface
registration check. After the push it watched Vercel in the foreground, then
ran `run-release-gates.sh` sequentially into the terminal, or queued it through
`release-async-gates.mjs` (deleted). Every one of those checks is now a row of
the after phase; the two things that made the build — migrations and the
push — are the ship path.

## Alchemy doors guard (`pnpm check:alchemy-doors`)

Shrink-only census (ALC-20) of raw clipboard, hand-built downloads, direct format libraries, surface-write door bypass and private action registries in app code. Baseline `scripts/alchemy-doors-baseline.json` ({rule: {file: count}}) is ALC-19's work list; a file above its count or new to a rule fails; `--update` only ratchets down; `--list` names every offender with the canonical alternative; `--self-test` proves each rule red then green. Advisory in `run-release-gates.sh`.

## Change log

- 2026-10-08 — THE LOCKFILE GUARD. v0.4.3013 failed on all four Vercel projects with
  `ERR_PNPM_BROKEN_LOCKFILE ... duplicated mapping key (1372:3)`: merge 406bfce877 kept two identical
  `'@ai-matrx/records@0.84.4':` blocks. `scripts/check-lockfile-keys.py` (`pnpm check:lockfile-keys`,
  `:self-test`) finds duplicate mapping keys / conflict markers / bad JSON and repairs only the identical
  case (its repair of the 406bfce877 lockfile is byte-identical to the hand fix aece035bad). `release.sh`
  repairs inside the release tree or refuses the push (the one exception to "never a stop");
  `sync-main.py` `guard_lockfiles()` repairs + commits or refuses the push. Tests:
  `test-release-ship-path.sh` releases 5–6 (red against the previous release.sh, green now) and
  `test_sync_main_lockfile_guard.py`.
- 2026-10-06 — added `check:alchemy-doors` (+ `:self-test`), advisory row in `run-release-gates.sh`.
- 2026-10-03 — Arman: checks and tests run on live as `admin@admin.com`; the clone is only for destructive-migration rehearsal. The clone checks leg, `--db-only --target clone` and the heavy-checks-default-to-clone rule are retired (docs only; code lane removes the code).
- 2026-09-30 — `run.mjs --db-only --target clone` + `clone-target-guard.cjs` (checks-run-in-the-app P3, the
  database-reading leg): the frontend's database rows run from aidream's private `clone-db-checks.yml`
  against the nightly copy only. Tests in `run.test.mjs` (red against the old runner, green now).

- 2026-09-28 — Measured every gate-db gate on live under the 30 s cap (slowest statement 6 s,
  door-rows' own probe ceiling). `check:door-rows[:wide]` (~23,800 statements, >20 min on live),
  `check:door-names-resolve` (TEMP table + planted function) and `check-stamped-write-doors`
  (`iam.apply_table_grants` + planted GRANTs, rolled back) default to the clone via check-target.
  `scripts/gate-db-limits.ts` (the psql gates' limits) now applies the live ceiling when
  PGUSER/PGHOST name production — it had kept handing live shell gates 60 s.
  `check:gate-db-sessions` counts `lib/check-target.ts` as a primitive.

- 2026-09-27 — Heavy checks run on the clone: `scripts/lib/check-target.ts` (`openCheckDb`,
  `connectCheckDirect`, `ceilingFor`, the `[TARGET]` line), `openGateDb` capped at 30 s on live,
  `guardIfProduction` for raw clients, `check:store-doors-decide` + five heavy checks (and three planting self-tests) default to
  the clone, guard `check:heavy-checks-target-the-clone` (+ `:self-test`, jest
  `scripts/__tests__/check-target.test.ts`). 38 findings at the previous HEAD, 0 after (9
  allowlisted with reasons).

- 2026-09-26 — `run.mjs --repo-only` + `.github/workflows/repo-only-checks.yml` (checks-run-in-the-app
  PLAN decision 4): the public-repo CI leg runs only declared repo-only rows with `MATRX_ITEMS=1` and
  uploads `checks-findings`; `workflow_dispatch` only until Arman approves the hourly cadence.
  Test `--repo-only runs ONLY rows declared repo-only…` in `run.test.mjs`.
- 2026-09-26 — Row `pnpm check:shell-layout` (repo-only): the real-Chromium layout gate
  (`features/shell/layout-gate/`, now including the shipped `@ai-matrx/*` CSS) as a SIGNAL;
  no Chromium = `[FAIL] UNMEASURED` + `pnpm exec playwright install chromium`, a WARNING
  finding, never a silent pass. Note: `run.mjs` reads `run-release-gates.sh --strict --list`
  (plus `EXTRA_ROWS`) — a row added only to the non-strict lane never runs here.

- 2026-09-26 — `pnpm findings` / `pnpm findings accept` (PLAN.md decision 8 + C1): the
  in-session face of the item line. Accept adapters for visibility-vocabulary, access-guard-check
  (in-place allowlist append), api-contract-ratchet (sibling `api-contracts-baseline.reasons.json`),
  record-toasts (`reasons` map; `--update` keeps it). finalize-and-ship step 4 runs it on the diff.
  aidream twin: `scripts/findings.py`.

- 2026-09-26 — Seven self-tests stopped planting fixtures in the live tree
  (org-refusal-honesty, org-three-states, no-default-organization[-sql],
  agent-list-reads, docs-twins, `db:apply --self-test`); guard
  `check:self-tests-stay-out-of-tree` + self-test added as release-gate rows
  (repo-only). Census + notes:
  `common-docs/systems/architecture/observability/projects/checks-run-in-the-app/PLAN.md`.

- 2026-09-25 — Declared row classes (`row-classes.json` + `row-classes.mjs` +
  `row-classes.signals.json`), `run.mjs --skip-live-db` (passed by
  `release.sh`'s after phase), `--list` shows the class, `DB_ROWS` deleted,
  guard `check:release-row-classes` + self-test (CI + release gates). 149 rows:
  56 live-db moved off the release path, 3 clone-db, 90 repo-only. Plan:
  `common-docs/systems/architecture/observability/projects/checks-run-in-the-app/` P0 (F12).

- 2026-09-20 — Rewritten to the ship-path doctrine (this file created).
  `scripts/checks/run.mjs`, `scripts/test-release-ship-path.sh` added;
  `scripts/release-async-gates.{mjs,test.mjs}` + `-lock.py` removed.
