# Local dev-server and build-cache management

Two named shared previews — **live** (port 3001) and **clone** (port 3002) —
plus one cleanup system. All are scoped to this repository; the machine-wide
guard refuses any third Next.js dev tree, from this repo or another.

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

## The two managed previews

Arman's one-server rule (2026-09-24) has exactly one exception (2026-09-27): the
clone preview, which talks only to the nightly copy of production so agents over
the live-database walk cap (below) have somewhere to work.

| Server | Start | Port / host | Database | Python server |
|---|---|---|---|---|
| live | `pnpm preview:start` | `<session>.localhost:3001` | LIVE (`db.matrxserver.com`) | production (`NEXT_PUBLIC_BACKEND_URL_PROD`) |
| clone | `pnpm preview:start --clone` | `<session>-clone.localhost:3002` | the clone named in `common-docs/operations/clone/CLONE-REF` | the local clone-wired aidream, `http://localhost:8200` |

| Command | Effect |
|---|---|
| `pnpm preview:start [--clone]` | Reuse that server and its PID when this checkout owns it. Source edits here hot-reload in both. A different checkout cannot claim its own diff was served. The banner's `DATABASE:` line says which database the pages talk to. |
| `pnpm preview:status [--clone]` | Both servers (or the clone alone): lease owner, pid, port, process-group RSS. |
| `pnpm preview:stop [--clone]` | Stop that server only from its owning checkout; preserve its build cache (`.next-preview` / `.next-preview-clone`). |
| `pnpm dev-login [--clone] [/path]` | Mint a single-use nonce for your host on that server and print the sign-in URL. |

The clone host is a separate label (`-clone`), so its cookies never mix with the
live preview's; it stays ONE label under `.localhost` because aidream's CORS
admits exactly one.

### The clone preview's pairing rule

Arman's condition: *"it starts to become a problem for aidream so you have to
make sure it's properly managed when the changes modify both the client and the
server."* A clone page reads and writes the clone through supabase-js AND calls a
Python server; if that server wrote to live, one action would land half on each
database. So `pnpm preview:start --clone`:

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
   `cd ../aidream && scripts/clone/clone_server.sh start` (boots in 4-8 min;
   `scripts/clone/clone_server.sh status` shows when it is paired);
3. launches with `MATRX_SHARED_PREVIEW=clone` and `MATRX_CLONE_PAIRED=<ref>`;
   `next.config.js` re-checks that the Supabase URL is that clone before a worker
   spawns;
4. on every reuse, re-proves the pairing and refuses a preview started for a
   clone CLONE-REF no longer names (restart it: `pnpm preview:stop --clone &&
   pnpm preview:start --clone`).

Logic and tests: `scripts/clone-preview/clone-preview-env.cjs`,
`scripts/__tests__/clone-preview-env.test.ts`. The server half:
`aidream/docs/LOCAL_DEV.md` § "Running against the clone". An admin's hand-typed
*custom* server URL is the one route around the pairing — never set one on the
clone host.

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

The launcher continuously measures the whole preview process group. Its **192
GB RSS watchdog is a runaway guard, not a budget**: the measured normal peak is
138.3 GB on this 256 GB host. The monitor runs in its own detached OS session;
`nohup` is insufficient because agent shell cleanup reaps ordinary child
process groups. It also stops startup after five minutes without
log progress. Neither limit automatically restarts the server. A watchdog stop
is written into the dev log and printed prominently by both the next
`preview:status` and `preview:start`. Advanced local use can override the
defaults with `MATRX_PREVIEW_MAX_RSS_GB` and `MATRX_PREVIEW_NO_PROGRESS_SEC`.

**Named `preview_start`, raw `pnpm dev`, and any third server are banned.**
Three guards, each tested to refuse a third server
(`scripts/__tests__/shared-dev-servers.test.ts`): `next.config.js`
(`scripts/agent-harness/shared-dev-servers.cjs` — token, port and dist dir must
be one of the two named servers, and the clone must be paired), the installed
PreToolUse hook (`scripts/agent-harness/matrx-preview-ports.sh`, which names both
launchers as the repair), and the launcher's slot rule
(`shared_server_slot_occupants` in `scripts/agent-harness/shared-servers.sh`: a
slot ignores only the OTHER named server on its own port, so any third server
blocks both). After pulling a change to the hook, re-run `pnpm setup:agent-harness`
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
- **Refused?** Wait for a walk to go idle, or move to the clone preview:
  `pnpm preview:start --clone`, then `pnpm dev-login --clone`. The clone
  preview is never capped (its Supabase URL is not production).

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
192 GB watchdog and is never reaped by this 16 GB cleanup threshold. No
`--max-old-space-size` flag solves native allocation; RSS is the correct guard.

## Machine setup

`pnpm setup:agent-harness` installs the guard into both `~/.claude` and
`~/.codex`, removes the obsolete per-session autoserver hooks, and is safe to
rerun after every pull. `pnpm check:agent-harness` is read-only.

Codex skips a new or changed non-managed hook until a human reviews its hash.
Open `/hooks` once after installation and trust the Matrx dev-server guard.

## Change Log

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
