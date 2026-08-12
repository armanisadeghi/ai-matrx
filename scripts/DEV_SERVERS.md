# Local dev-server and build-cache management

One shared preview plus one cleanup system. Both are scoped to this repository;
the machine-wide guard also refuses a second Next.js dev tree from another repo.

## Why this exists

A single `next dev` for this repo has measured **22.8 GB RSS** with 17 worker
processes after compiling `/dashboard`. Seven concurrent servers measured
43.3 GB of RAM and 90 GB of `.next*` on disk. Two servers can hard-crash a
16 GB workstation.

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
| `pnpm preview:start` | Reuse any running dev server; otherwise launch the tracked shared preview on port 3001 with `NEXT_DISTDIR=.next-preview`. |
| `pnpm preview:status` | Show server pid, RAM, uptime, port, distdir, tracking state, and build-dir disk use. |
| `pnpm preview:stop` | Stop the tracked shared preview; preserve its build cache for the next run. |

`scripts/agent-dev-server.sh` owns this lifecycle. It is provider-neutral:
Claude and Codex start the same process, then open `http://localhost:3001` in
their own in-app browser. State lives in `.matrx/dev-sessions/` (gitignored),
so `scripts/dev-cleanup.sh` recognizes the server as managed.

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
| `pnpm dev:status` | Same process inventory as `preview:status`. Non-destructive. |
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

A server idles around 0.3 GB and can retain 7–9 GB after heavy routes. The 16 GB
ceiling catches pathological native/Turbopack growth without killing normal
heavy work. No `--max-old-space-size` flag solves native allocation; RSS is the
correct guard.

## Machine setup

`pnpm setup:agent-harness` installs the guard into both `~/.claude` and
`~/.codex`, removes the obsolete per-session autoserver hooks, and is safe to
rerun after every pull. `pnpm check:agent-harness` is read-only.

Codex skips a new or changed non-managed hook until a human reviews its hash.
Open `/hooks` once after installation and trust the Matrx dev-server guard.
