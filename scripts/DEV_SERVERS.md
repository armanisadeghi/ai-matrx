# Local dev-server and build-cache management

One shared preview plus one cleanup system. Both are scoped to this repository;
the machine-wide guard also refuses a second Next.js dev tree from another repo.

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

## The one managed preview

| Command | Effect |
|---|---|
| `pnpm preview:start` | Reuse the preview only when this exact checkout owns it; otherwise fail loudly so another worktree's code can never be mistaken for the diff under test. |
| `pnpm preview:status` | Show the machine-wide lease owner, pid, port, and process-group RSS from every worktree. |
| `pnpm preview:stop` | Stop the preview only from its owning checkout; preserve its build cache for the next run. |

`scripts/agent-dev-server.sh` owns this lifecycle. Its state and start lock live
in the user's machine-wide temporary directory, not inside a checkout, so two
worktrees cannot both acquire the slot. It is provider-neutral:
Claude and Codex start the same process, then open `http://localhost:3001` in
their own in-app browser. The state records the exact owning checkout; another
checkout must wait for an explicit release and then start its own build.

The launcher continuously measures the whole preview process group. Its **192
GB RSS watchdog is a runaway guard, not a budget**: the measured normal peak is
138.3 GB on this 256 GB host. The monitor runs in its own detached OS session;
`nohup` is insufficient because agent shell cleanup reaps ordinary child
process groups. It also stops startup after five minutes without
log progress. Neither limit automatically restarts the server. A watchdog stop
is written into the dev log and printed prominently by both the next
`preview:status` and `preview:start`. Advanced local use can override the
defaults with `MATRX_PREVIEW_MAX_RSS_GB` and `MATRX_PREVIEW_NO_PROGRESS_SEC`.

**Named `preview_start` and raw `pnpm dev` are banned.** The installed hook
blocks both and names `pnpm preview:start` as the repair. The shared server is
not tied to one agent session; ending one task must not kill a server another
task is using.

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
