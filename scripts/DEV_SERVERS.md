# Local dev-server and build-cache management

ONE shared preview on port 3001 — its database is a **mode** (clone by default,
live with `--live`) — plus one cleanup system. The machine-wide guard refuses any
second Next.js dev tree, from this repo or another.

## Why this exists

A single `next dev` for this repo measured **90.7 GB RSS** after compiling
`/marketing`, then **138.3 GB** after adding Chat and the Administration entry.
Seven concurrent servers once consumed 43.3 GB of RAM and 90 GB of `.next*` on
disk before the app reached its current weight.

The failure classes are:

1. **Duplicate servers.** Provider-specific or raw shell launchers do not share
   ownership, so parallel agents create competing multi-GB trees.
2. **Untracked servers.** A raw `pnpm dev` has no durable state record and no
   safe owner.
3. **Runaway servers.** Turbopack can retain native memory far beyond Node's
   JavaScript heap.

## The one managed preview and its two modes

Arman, 2026-09-30: one server, ever. A second "clone" server on another port
(2026-09-27) ran beside the live one and the two held ~41 GB and ~75 Turbopack
workers and stalled the Mac. Tests never touch the live database (2026-09-29), so
clone is the default mode.

| Mode | Start | Host | Database | Python server | Build dir |
|---|---|---|---|---|---|
| clone (default) | `pnpm preview:start` | `<session>.localhost:3001` | the clone named in `common-docs/operations/clone/CLONE-REF` | the local clone-wired aidream, `http://localhost:8200` | `.next-preview-clone` |
| live | `pnpm preview:start --live` | `<session>.localhost:3001` | LIVE (`db.matrxserver.com`) | production | `.next-preview` |

| Command | Effect |
|---|---|
| `pnpm preview:start [--clone\|--live]` | Nothing running: start in the requested mode (clone if none). Running in that mode, or no flag: reuse it. Running in the OTHER mode: idle ≥ 5 min → stopped and restarted in the requested mode; busy → refused in one line. Never a second server. |
| `pnpm preview:status` | The one server: mode, database, pid, real memory, last use. |
| `pnpm preview:stop` | Stop it from its owning checkout; both build caches are preserved. |
| `pnpm dev-login [/path]` | Mint a single-use nonce for your host and print the sign-in URL. `--clone`/`--live` only assert the running mode. |

Each mode keeps its own build dir because `NEXT_PUBLIC_*` values are inlined into
the bundles: a switch never serves the other database's env, and both caches stay
hot. Only one process ever runs.

### Clone mode's pairing rule

Arman's condition: *"it starts to become a problem for aidream so you have to
make sure it's properly managed when the changes modify both the client and the
server."* A clone page reads and writes the clone through supabase-js AND calls a
Python server; if that server wrote to live, one action would land half on each
database. So clone mode:

1. regenerates the gitignored `.env.clone.local` whenever CLONE-REF's `clone_ref`
   changes (the clone rotates nightly; no ref is hardcoded) — the clone's
   Supabase URL + publishable + secret key from the Management API, and EVERY
   Python-server URL the app can select — aidream's tiers
   (prod/dev/staging/local/gpu/ec2) AND the separately hosted files, scraper and
   seo services, which are wired to live — set to `http://localhost:8200` (the
   clone-wired aidream serves the same `/files`, `/scraper`, `/seo` routes);
2. asks `http://localhost:8200/health/database-identity` which project its
   database pool AND its auth issuer belong to, and REFUSES — starting nothing —
   unless both are the clone. The refusal prints the exact command:
   `cd ../aidream && scripts/clone/clone_server.sh start` (boots in a few min;
   `scripts/clone/clone_server.sh status` shows when it is paired). That server
   reloads itself onto aidream's checkout (up 10 min + new code); `clone_server.sh
   reload` gets your code now, and `pnpm preview:status` prints its running commit;
3. launches with `MATRX_PREVIEW_MODE=clone` and `MATRX_CLONE_PAIRED=<ref>`;
   `next.config.js` re-checks that the Supabase URL is that clone before a worker
   spawns;
4. on every reuse, re-proves the pairing and refuses a server started for a
   clone CLONE-REF no longer names (restart it: `pnpm preview:stop &&
   pnpm preview:start`).

Logic and tests: `scripts/clone-preview/clone-preview-env.cjs`,
`scripts/__tests__/clone-preview-env.test.ts`. The server half:
`aidream/docs/LOCAL_DEV.md` § "Running against the clone". An admin's hand-typed
*custom* server URL is the one route around the pairing — never set one in clone
mode.

`scripts/agent-dev-server.sh` owns this lifecycle. Its state and start lock live
in the user's machine-wide temporary directory, not inside a checkout, so two
worktrees cannot both acquire the slot. It is provider-neutral:
Claude and Codex start the same process. `preview:start` prints the owning
session's exact `http://<session>.localhost:3001` URL; bare `localhost` is not
the supported login URL because it shares cookies across sessions. The state
records the exact owning checkout. In this repo's normal shared-main workflow,
put the change in the primary checkout and use the running preview. A lease
mismatch from a worktree means that worktree's files are not being served; it
does **not** by itself mean localhost is down or that a private server is needed.

**Browser access and checkout ownership are separate gates.** A working server
can answer `curl` while Codex's in-app or extension browser rejects local HTTP
with `ERR_BLOCKED_BY_CLIENT` before navigation. That browser error does not mean
the server is unavailable, and a successful response does not prove the current
checkout: compare the lease's `ROOT` with the checkout under test. Never certify
a change from another checkout's preview. If no approved isolated browser can
open the printed URL, report browser verification as blocked rather than using
the user's existing tabs or treating an HTTP response as visual proof.

An alive PID is not sufficient proof that a lease is usable. If the owning
checkout has disappeared, its dependencies are missing, or the requested route
returns a build/runtime 500, inspect the recorded log. That is a stale preview,
not an active verification lease. Stop it through its owning checkout when that
checkout still exists; if the checkout was removed, terminate the exact PID
recorded in the machine-wide lease, confirm it exited, then let
`preview:status` clear the stale metadata. Do not kill by port or process name.

The launcher continuously measures the whole preview process group in **real
memory** — the sum of each process's macOS `phys_footprint`, which includes the
compressed memory `ps` RSS leaves out (a next-server showing ~3 GB RSS was
really 44–50 GB). Its **48 GB hard cap is a runaway guard, not a budget**.
Next dev keeps every compiled route in memory, so an abandoned preview grows
forever; the monitor therefore also **recycles** it. "Used" means the server
logged an HTTP request (` GET /route 200 in 82ms`), stamped in the state dir's
`*.used` file. Nothing requested for 30 min → stopped; ≥ 40 GB and idle 5 min →
recycled. A new `pnpm preview:start` **replaces** a managed preview (any
checkout's) idle ≥ 5 min, or one that stopped answering, instead of refusing;
a preview that served a request in the last 2 min is never killed, and a busy
healthy one is reused exactly as before. These stops are worded as normal
recycles, never as crashes, and `preview:status` shows real memory and "last
used N min ago". Knobs: `MATRX_PREVIEW_IDLE_STOP_MIN`,
`MATRX_PREVIEW_RECYCLE_GB`, `MATRX_PREVIEW_RECYCLE_IDLE_MIN`,
`MATRX_PREVIEW_BUSY_GUARD_MIN`; forcing tests: `pnpm test:preview-recycle`.
The monitor runs in its own detached OS session;
`nohup` is insufficient because agent shell cleanup reaps ordinary child
process groups. It also stops startup after five minutes without
log progress. No limit automatically restarts the server. A watchdog stop
is written into the dev log and printed prominently by both the next
`preview:status` and `preview:start`. Advanced local use can override the
defaults with `MATRX_PREVIEW_MAX_RSS_GB` and `MATRX_PREVIEW_NO_PROGRESS_SEC`.

**Named `preview_start`, raw `pnpm dev`, and any second server are banned.**
Three guards, each tested to refuse a second server
(`scripts/__tests__/shared-dev-servers.test.ts`): `next.config.js`
(`scripts/agent-harness/shared-dev-servers.cjs` — token, port 3001, the mode's
build dir, a paired clone mode, and no other dev server running, even one with a
valid token), the installed PreToolUse hook
(`scripts/agent-harness/matrx-preview-ports.sh`), and the launcher's one slot.
`pnpm check:one-dev-server` (+ `:self-test`, RED on the two-server commit) fails
on any second port or slot in those files. After pulling a change to the hook, re-run `pnpm setup:agent-harness`
— the installed copy is a copy. The shared server is
not tied to one agent session; ending one task must not kill a server another
task is using.

## The live-database walk cap

Every signed-in page this preview serves reads and writes the LIVE database
(`db.matrxserver.com`). On 2026-09-26 that database ran out of memory, 70% of
its time coming from agent walks: 15–26 preview hosts, 40–69 signed-in
sessions per 30 minutes. So the preview caps how many hosts may be signed in
against production at once (Arman: "default 4").

- **Rule** (`utils/supabase/walkCap.ts`, called from the proxy's session pass):
  a `<label>.localhost:3001` host that made a signed-in request within the
  activity window is an active walk. A signed-in request from a NEW host while
  the active walks already number the cap gets a plain 503 page (header
  `x-matrx-walk-cap: refused`) listing the active hosts and how long ago each
  was seen. Already-admitted hosts keep working; signed-out requests (login,
  assets, `/api/*`) always pass. Every admission and refusal is a `[walk-cap]`
  line in the preview log.
- **Knobs:** `ops.agent_walks.production_concurrent_cap` (4) and
  `ops.agent_walks.activity_window_minutes` (10), read once per 60 s. A missing
  knob screams in the log and the gate fails OPEN.
- **Scope:** development server only, and only when `NEXT_PUBLIC_SUPABASE_URL`
  is production. A production build drops the code.
- **Refused?** Wait for a walk to go idle, or switch the one server to clone
  mode once it is idle 5 min: `pnpm preview:start --clone`, then
  `pnpm dev-login`. Clone mode is never capped (its Supabase URL is not
  production).

## Process discovery and cleanup

`scripts/dev-cleanup.sh` finds `next-server` processes whose cwd is inside
this repo. Discovery is process-based, never port-based: an observed runaway
bound ephemeral port 50862 and was invisible to the old port-range scanner.

Kills walk the process tree rather than a process group. A hook-launched server
can share a process group with its agent; killing that group can kill the agent.

| Command | Effect |
|---|---|
| `pnpm dev:status` | Show the repo-scoped process and build-cache inventory. Non-destructive; use `preview:status` for the machine-wide lease. |
| `pnpm dev:reap:dry` | Show exactly which runaway/abandoned/orphan trees would be killed. |
| `pnpm dev:reap` | Kill only trees that cross the rules below. |
| `pnpm dev:stop` | Stop every matrx-frontend dev server. Leaves disk. |
| `pnpm clean:next` | Delete alternate `.next-*` dirs; preserve `.next`; repair `tsconfig.json`. |
| `pnpm clean:next:all` | Delete all Next/Turbo build caches. Leaves servers. |
| `pnpm dev:nuke` | Stop every repo server, then delete every build cache. |

### Reap rules

| Rule | Default | Environment override |
|---|---:|---|
| Runaway memory | RSS ≥ 16 GB | `MATRX_DEV_MAX_RSS_GB` |
| Abandoned | uptime ≥ 4 h | `MATRX_DEV_MAX_AGE_H` |
| Untracked orphan | uptime ≥ 90 min | `MATRX_DEV_MAX_UNTRACKED_AGE_MIN` |

`dev:reap` governs unmanaged servers; the shared managed preview has its own
48 GB real-memory watchdog plus idle recycling, and is never reaped by this 16 GB cleanup threshold. No
`--max-old-space-size` flag solves native allocation; RSS is the correct guard.

## Machine setup

`pnpm setup:agent-harness` installs the guard into both `~/.claude` and
`~/.codex`, removes the obsolete per-session autoserver hooks, and is safe to
rerun after every pull. `pnpm check:agent-harness` is read-only.

Codex skips a new or changed non-managed hook until a human reviews its hash.
Open `/hooks` once after installation and trust the Matrx dev-server guard.

## Change Log

- 2026-09-30: ONE server on port 3001; the database is its mode (clone default,
  `--live`). The port-3002 clone server, its slot and its `-clone` host are gone;
  hard cap 128 → 48 GB; `pnpm check:one-dev-server` added.

- 2026-09-27: Added the clone preview (port 3002, `--clone` on start/stop/status/
  dev-login) with its pairing rule, and extended the three one-server guards to
  exactly two named servers.

- 2026-09-26: Added the live-database walk cap (`ops.agent_walks` knobs,
  development-only proxy gate).

- 2026-09-20: Corrected the false claim that Codex can always open bare
  `localhost:3001` in its in-app browser. Browser transport can block local
  HTTP independently of server health; documented the per-session hostname,
  exact-checkout proof boundary, and safe recovery for a live PID whose owning
  checkout has been removed.

- 2026-09-18 (F-101, V-23 NEW-1): `ensure_worktree_node_modules` in
  `scripts/agent-dev-server.sh` handled only the symlink case
  (`[[ -L "$nm" ]] || return 0` returned immediately otherwise), but
  `git worktree add` never creates `node_modules` at all — a fresh worktree's
  `node_modules` is ABSENT, not a symlink — so `pnpm preview:start` there
  printed "dependencies are missing; run pnpm install first", a remedy worse
  than the defect (an install in the worktree resolves a different `latest`
  dependency tree than the primary checkout's). Fixed to hard-link-copy from
  the primary checkout in both the absent and symlink cases, and to leave an
  already-real `node_modules` directory untouched. Forcing test:
  `pnpm test:worktree-node-modules` (`scripts/test-worktree-node-modules.sh`).
- 2026-09-19: starting the shared preview from `.matrx/acquisition-frontier/checkout`
  (a worktree hard-link-copied per the entry above) crashed with `Error: Cannot
  find module '/Users/…/matrx-frontend/Users/…/matrx-frontend/node_modules/next/dist/bin/next'`
  — a DOUBLED absolute path. Root cause: the launcher exec'd
  `node_modules/.bin/next`, a pnpm-generated POSIX shim that finds its real
  target by counting a FIXED number of `../` hops from its own directory up to
  what it assumes is the filesystem root, then re-descending through the
  target's absolute path (baked in at generation time, leading slash
  stripped). The hard-link copy carries that shim's bytes — hop count
  included — into a worktree nested at a DIFFERENT depth than the primary
  checkout, so the hop count stops five directories short of the real
  filesystem root and the shim silently doubles the primary checkout's own
  path onto itself instead of erroring. Not specific to this one worktree
  depth: any hard-linked shim copied to a different nesting depth than where
  it was generated resolves to the wrong file, silently. Fixed by adding
  `resolve_next_bin()`, which points straight at
  `node_modules/next/dist/bin/next` (a real Node script reachable through
  `node_modules/next`, a normal symlink into the pnpm store that resolves
  correctly regardless of nesting depth) and invokes it directly via `node`,
  bypassing the shim's path arithmetic entirely. Forcing test:
  `pnpm test:worktree-next-bin-resolution`
  (`scripts/test-worktree-next-bin-resolution.sh`).
