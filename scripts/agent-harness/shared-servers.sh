#!/usr/bin/env bash
#
# shared-servers.sh — THE one shared dev server, for bash. Sourcing starts nothing.
#
#   pnpm preview:start          port 3001, live database          dist .next-preview
#   (Arman, 2026-10-03: test on live as admin@admin.com; the nightly copy is never a dev server)
#
# ONE Next.js dev server on this machine, ever (Arman, 2026-09-24; reaffirmed 2026-09-30 after a
# second "clone" server on another port helped hold ~41 GB and ~75 Turbopack workers and stalled
# the 256 GB Mac). The database is a MODE of that one server, never a second server. Each mode
# keeps its own build dir because NEXT_PUBLIC_* values are inlined into the bundles, so a mode
# switch never serves the other mode's env; only one process ever runs. The JS twin that
# next.config.js enforces is scripts/agent-harness/shared-dev-servers.cjs;
# scripts/__tests__/shared-dev-servers.test.ts pins that the two agree, and
# `pnpm check:one-dev-server` fails on any second port or slot.

SHARED_SERVER_PORT=3001
SHARED_SERVER_TOKEN=1
SHARED_SERVER_STATE_STEM=shared-next-dev
SHARED_SERVER_DEFAULT_MODE=live

# The build dir of a mode. NEXT_PUBLIC_* are inlined at compile time, so each mode compiles
# into its own dir and a switch never serves the other database's bundles.
shared_server_distdir() {
  case "$1" in live) echo .next-preview ;; *) return 1 ;; esac
}

# The session's hostname. One label under .localhost: aidream's CORS admits exactly one
# (app_config.CORS_DEFAULT_ORIGIN_REGEX). Cookies are per host, so each session gets its own jar.
shared_server_host() { # shared_server_host <session-label>
  printf '%s.localhost' "$1"
}

# Labels (agent-preview / human-or-other) come from `matrx-preview-ports.sh list-any`, which is
# self-contained because install.sh copies it alone.
