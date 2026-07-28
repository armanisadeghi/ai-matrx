# Local dev-server & build-cache management

Two concerns, two scripts. Both are scoped to **this repo only** (a dev server for
another repo — e.g. aidream on a 30xx port — is identified by cwd and left alone).

## Why this exists — the numbers

A single `next dev` on this repo was measured at **22.8 GB RSS with 17 worker
processes** after compiling `/dashboard` exactly once, and Turbopack never gives
that memory back. Seven concurrent servers measured **43.3 GB** of RAM and 90 GB
of `.next*` on disk. Parallel agents each starting a server, plus servers that
outlive the session that started them, is what takes the whole machine down.

**Three things kill this machine, in order of blame:**

1. **Servers that outlive their session.** SessionEnd doesn't fire on a crash or
   force-quit, so the server is reparented to `launchd` and lives forever. Two
   were found at 11h36m uptime with their Claude sessions long gone.
2. **Servers nothing tracks.** An agent that runs `pnpm dev` from Bash creates a
   server the hook system never registered — it isn't counted by
   `MAX_AGENT_SERVERS` and no SessionEnd will ever stop it.
3. **Runaway single servers.** The 22.8 GB case above.

## Discovery is PROCESS-based, never PORT-based

`dev-cleanup.sh` finds servers by locating `next-server` processes whose **cwd is
inside this repo**. It used to scan TCP 3000–3099 for listeners, and that had a
fatal blind spot: a dev server that binds an ephemeral port (observed: pid 39313
on **:50862**, 7.5 GB, up 1h24m) was invisible to `dev:status` and immune to
`dev:stop` — an immortal orphan. **Do not reintroduce a port-range filter as the
discovery mechanism.**

Kills walk the process tree (`killtree`) rather than `kill -pgid`. A hook-launched
server can share a process group with the agent that spawned it, and killing that
group would take the agent down with the server.

## 1. Manual cleanup — `scripts/dev-cleanup.sh`

| pnpm alias | Effect |
|---|---|
| `pnpm dev:status` | Every dev server of ours (pid, RAM, uptime, port, distdir, tracked?) + a per-server reap verdict + build-dir disk use. Non-destructive. |
| `pnpm dev:reap:dry` | Show exactly what `dev:reap` would kill and why. Non-destructive. |
| `pnpm dev:reap` | Kill **only** runaway / abandoned / untracked servers. Safe to run anytime; this is what runs automatically. |
| `pnpm dev:stop` | Stop **every** matrx-frontend dev server. Leaves disk. |
| `pnpm clean:next` | Delete **every** alternate build dir (`.next-*`: preview / agent / codex / qa / …); **`.next` intact**. Also runs `fix:tsconfig` (prunes dead includes + strips `next-env.d.ts` punch-through imports). |
| `pnpm clean:next:all` | Delete **all** build caches incl. `.next`, `.turbo`, `node_modules/.cache`. Leaves servers. |
| `pnpm dev:nuke` | The big red button: `dev:stop` + `clean:next:all`. |

### Reap rules (env-tunable)

| Rule | Default | Env var |
|---|---|---|
| Runaway memory | RSS ≥ **16 GB** | `MATRX_DEV_MAX_RSS_GB` |
| Abandoned | uptime ≥ **4 h** | `MATRX_DEV_MAX_AGE_H` |
| Untracked orphan | no session owns it **and** uptime ≥ **90 min** | `MATRX_DEV_MAX_UNTRACKED_AGE_MIN` |

**Calibrating the RSS ceiling:** a server idles ~0.3 GB, retains 7–9 GB after a
few heavy routes, and hit 22.8 GB in the pathological case. Because Turbopack
never releases, RSS is a high-water mark and not a transient peak — the ceiling
must sit *above* the normal-heavy band or it kills agents doing real work. 16 GB
catches only the pathological case; the age and untracked rules do the routine
cleanup.

**There is no `--max-old-space-size` flag anywhere, deliberately.** Node's default
heap cap here is already ~4.2 GB while the process reached 22.8 GB, so most of it
is Turbopack's native Rust allocation plus per-worker heaps — nothing a V8 flag
bounds. Raising the JS ceiling makes it worse. The RSS reaper is the guard that
works, because it measures RSS rather than heap.

## 2. Automatic per-session server — `scripts/agent-dev-server.sh`

Wired to Claude Code **SessionStart / SessionEnd** hooks in
`.claude/settings.local.json` (local-only; not committed, so it never imposes on
CI or other clones).

**On session start** it first runs `dev-cleanup.sh reap` (see ordering note
below), then launches a dedicated `next dev` for that session on a free port in
**3050–3099** with its own `NEXT_DISTDIR=.next-agent-<sid>` (own lock, no
collision with your `.next`), then warms it in the background — polls until it
responds, then hits `/api/dev-login` with a cookie jar so the **authenticated
`/dashboard` is fully pre-compiled**. The agent receives one ready-to-use URL
(`/api/dev-login?token=…&next=/dashboard`) and lands logged-in instantly.

> **Ordering matters:** the reap runs *before* the launch, so it can never kill
> the server it just created. Don't move it.

**On session end** it kills that server's process tree and deletes **only** its own
`.next-agent-<sid>` dir (never `.next` — the prefix is verified before any `rm`).

Guards: reuses an existing server on resume; caps concurrent auto-servers at
**3** (`MAX_AGENT_SERVERS`); `reap_dead` forgets state for servers that already
died, and the reap above handles servers that *outlive* their session — the case
`reap_dead` cannot see.

**Opt out** for a shell/session: `MATRX_AGENT_AUTOSERVER=0`.

Transient state (pid/port/log/marker per session) lives in
`.matrx/dev-sessions/` (gitignored).

## For agents: don't start your own server

A dev server is already running for your session and its URL is handed to you at
session start. Use it. If you genuinely need your own, `pnpm dev` now reaps
orphans first — but a server you start from Bash is **untracked**, so nothing
will stop it when your session ends until the 90-minute orphan rule catches it.
Check `pnpm dev:status` before assuming you need a new one.
