# Release — the ship path and the after phase

Sibling of aidream's `scripts/FEATURE.md` § "The ship path"; the doctrine is
Arman's (2026-09-19/20) and identical in both repos. Cross-repo policy:
`../../../common-docs/policies/deployment-is-the-deploy-agents-job.md`.

## The one rule

**Running the release script is never harder than a plain `git push`.** Nothing
stops a release except GitHub being unreachable or losing the push race five
times in a row. Not a failed check, not a failed migration, not a dirty
checkout, not a diverged branch, not an unmerged local commit. Every one of
those is a finding — an ERROR or WARNING row with a remedy — never a stop.

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
7. Bump `package.json` in a temporary index (`GIT_INDEX_FILE` + `read-tree` +
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
- **Checks** — `scripts/checks/run.mjs`: ONE parallel runner (6 workers,
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
- **Findings** — `tmp/release-logs/findings-vX.Y.Z.jsonl`: first line
  `{"ran":[...]}`, then one JSON object per finding — `check, category, level,
  title (≤100), count, fingerprint, remedy, detail` — the exact shape aidream's
  `scripts/checks/run.py` writes. Ship-path findings (`findings-ship-*.jsonl`)
  and the rollout finding are appended to the same file.
- **Fixers** — aidream's `scripts/checks/dispatch_fixer.py`, called with
  `MATRX_REPO_ROOT=<this checkout>`: one agent per category with a NEW
  fingerprint, a finding already open starts nothing. Its ledger, settings and
  logs live here (`.matrx/fixer-ledger.json`, `.matrx/fixer-dispatch.json`,
  `tmp/fixer-logs/`, all gitignored). One dispatcher serves both repos.

## Commands

| Command | What |
|---|---|
| `./ship.sh "msg" -- <paths>` / `./scripts/release.sh` | the release (see above) |
| `./scripts/release.sh --dry-run` | what would ship, from origin/main's point of view; nothing changes |
| `node scripts/checks/run.mjs [--json f] [--lane x] [--only id] [--list]` / `pnpm check:release-checks` | the runner, by hand |
| `bash scripts/run-release-gates.sh [--strict]` | the old sequential gate runner — still the manifest (`--list`), still usable for one-by-one triage |
| `pnpm test:release-ship-path` | the sandbox guard: dirty checkout + diverged branch + push landing mid-release → tag on origin |
| `pnpm test:release-checks` | the runner at its seams (clean = one line; screams, hangs, exit codes → findings; JSON shape) |
| `pnpm test:release-fail-forward` | the wiring: no check before the push, nothing fails after it, after phase detached, no stash |
| `pnpm test:release-outcome` | the rollout watch is consulted in the after phase and a dead rollout is an ERROR finding |

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

## Change log

- 2026-09-20 — Rewritten to the ship-path doctrine (this file created).
  `scripts/checks/run.mjs`, `scripts/test-release-ship-path.sh` added;
  `scripts/release-async-gates.{mjs,test.mjs}` + `-lock.py` removed.
