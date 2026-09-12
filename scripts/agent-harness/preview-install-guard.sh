#!/usr/bin/env bash
#
# preview-install-guard.sh — refuse a dependency install that would pull
# node_modules out from under the live shared preview server.
#
# THE INCIDENT THIS PREVENTS (2026-09-12, measured):
#   A `pnpm install` ran in this shared checkout while the managed preview on
#   :3001 was serving. pnpm relinks `node_modules/<pkg>`, so for a few seconds
#   `@ai-matrx/design-system` did not resolve. 1,268 files in this repo import
#   that package and `app/layout.tsx` imports its CSS, so Turbopack produced a
#   module-not-found issue for EVERY one of them, each carrying its full import
#   traces through both the Browser and the SSR graph. One compile's issue set
#   reached 3,565,305 trace lines and ~460 MB. The dev HMR serialises that
#   whole set with JSON.stringify to send it to each connected client; past
#   V8's max string length (~512 MB) that throws `RangeError: Invalid string
#   length` from a socket callback, which is an uncaughtException, and the dev
#   server process exits. Every agent signed in to :3001 lost its surface.
#
#   The size is not the bug we can fix — the serialiser is inside Next. The
#   trigger is, and this is it: never remove node_modules while the shared
#   dev server is compiling against it. Stop the preview, install, start again.
#
# Wired as package.json "preinstall", so it runs before pnpm touches anything.
# A checkout with no lease (a fresh clone, CI, another worktree) installs
# normally — the guard only defends the checkout that owns the live preview.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_DIR="${MATRX_PREVIEW_STATE_DIR:-${TMPDIR:-/tmp}/matrx-frontend-preview-${UID:-$(id -u)}}"
META="$STATE_DIR/shared-next-dev.meta"

meta_value() { sed -n "s/^$1=//p" "$META" 2>/dev/null | head -1; }

# No lease recorded at all: nothing to protect.
[[ -f "$META" ]] || exit 0

PID="$(meta_value PID)"
ROOT="$(meta_value ROOT)"
PORT="$(meta_value PORT)"

# A lease whose process is gone is stale and must never block an install.
[[ "$PID" =~ ^[0-9]+$ ]] && kill -0 "$PID" 2>/dev/null || exit 0

# Another checkout's preview compiles against ITS node_modules, not ours.
[[ "$ROOT" == "$REPO_ROOT" ]] || exit 0

if [[ -n "${MATRX_ALLOW_INSTALL_WITH_PREVIEW:-}" ]]; then
  printf '\n' >&2
  printf '[preview-install-guard] OVERRIDE IN FORCE — installing anyway.\n' >&2
  printf '[preview-install-guard] The preview on port %s (pid %s) is live and may crash\n' "${PORT:-3001}" "$PID" >&2
  printf '[preview-install-guard] with "RangeError: Invalid string length" while packages relink.\n' >&2
  printf '[preview-install-guard] If it dies, every agent on that server loses its session.\n' >&2
  printf '\n' >&2
  exit 0
fi

printf '\n' >&2
printf '[preview-install-guard] ============================================================\n' >&2
printf '[preview-install-guard] INSTALL REFUSED — the shared preview is running right now.\n' >&2
printf '[preview-install-guard]\n' >&2
printf '[preview-install-guard] The dev server on port %s (pid %s) is compiling against the\n' "${PORT:-3001}" "$PID" >&2
printf '[preview-install-guard] node_modules this install is about to relink. When a package\n' >&2
printf '[preview-install-guard] briefly disappears, Turbopack reports a module-not-found for\n' >&2
printf '[preview-install-guard] every file that imports it, with full import traces. That\n' >&2
printf '[preview-install-guard] payload has measured ~460 MB, and serialising it to the\n' >&2
printf '[preview-install-guard] browser overflows V8 string limits and KILLS the dev server.\n' >&2
printf '[preview-install-guard] Every agent signed in to it loses its session.\n' >&2
printf '[preview-install-guard]\n' >&2
printf '[preview-install-guard] What to do instead:\n' >&2
printf '[preview-install-guard]   1. Tell whoever owns the preview you need to install.\n' >&2
printf '[preview-install-guard]   2. pnpm preview:stop\n' >&2
printf '[preview-install-guard]   3. pnpm install\n' >&2
printf '[preview-install-guard]   4. pnpm preview:start\n' >&2
printf '[preview-install-guard]\n' >&2
printf '[preview-install-guard] To accept the risk anyway:\n' >&2
printf '[preview-install-guard]   MATRX_ALLOW_INSTALL_WITH_PREVIEW=1 pnpm install\n' >&2
printf '[preview-install-guard] ============================================================\n' >&2
printf '\n' >&2
exit 1
