# Local dev-server & build-cache management

Two concerns, two scripts. Both are scoped to **this repo only** (a dev server for
another repo — e.g. aidream on a 30xx port — is identified by cwd and left alone).

## 1. Manual cleanup — `scripts/dev-cleanup.sh`

Long-lived `next dev` servers and their `.next*` build caches accumulate over a day
of work (multi-GB RAM each; tens–hundreds of GB of cache). `.next` grows unbounded
because Turbopack's dev cache (`.next/dev/cache`) never prunes — not a bug, just
accumulation, so periodic cleanup is the answer.

| pnpm alias | Effect |
|---|---|
| `pnpm dev:status` | Show our running 3000–3099 servers (port, pid, uptime, RAM) + build-dir disk use. Non-destructive. |
| `pnpm dev:stop` | Stop **every** matrx-frontend dev server (kills the whole process group). Leaves disk. |
| `pnpm clean:next` | Delete alternate build dirs only (`.next-preview*`, `.next-qa*`); **`.next` intact**. |
| `pnpm clean:next:all` | Delete **all** build caches incl. `.next`, `.turbo`, `node_modules/.cache`. Leaves servers. |
| `pnpm dev:nuke` | The big red button: `dev:stop` + `clean:next:all`. |

## 2. Automatic per-session server — `scripts/agent-dev-server.sh`

Wired to Claude Code **SessionStart / SessionEnd** hooks in
`.claude/settings.local.json` (local-only; not committed, so it never imposes on
CI or other clones).

**On session start** it launches a dedicated `next dev` for that session on a free
port in **3050–3099** with its own `NEXT_DISTDIR=.next-agent-<sid>` (own lock, no
collision with your `.next`), then warms it in the background — polls until it
responds, then hits `/api/dev-login` with a cookie jar so the **authenticated
`/dashboard` is fully pre-compiled**. The agent receives one ready-to-use URL
(`/api/dev-login?token=…&next=/dashboard`) and lands logged-in instantly — no
token-hunting, no login retries.

**On session end** it kills that server's process tree and deletes **only** its own
`.next-agent-<sid>` dir (never `.next` — the prefix is verified before any `rm`).

Guards: reuses an existing server on resume; caps concurrent auto-servers at
**3** (`MAX_AGENT_SERVERS`); reaps state from crashed sessions on the next start.

**Opt out** for a shell/session: `MATRX_AGENT_AUTOSERVER=0`.

Transient state (pid/port/log/marker per session) lives in
`.matrx/dev-sessions/` (gitignored).
