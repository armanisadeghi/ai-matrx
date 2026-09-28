#!/usr/bin/env bash
#
# dev-login.sh — mint this session's single-use nonce and print the URL to open.
#
# Wired as `pnpm dev-login`. It exists because the handshake now has TWO
# host-dependent halves and neither should be typed by hand:
#
#   * the hostname you open (yours, not the shared localhost — see
#     scripts/agent-harness/preview-session.sh)
#   * the nonce file, which is per host, so your failed navigation can never
#     burn the nonce another agent just minted
#
# It prints a URL and nothing else that matters. The nonce it contains is dead
# the instant it is presented — match or mismatch — so it is worthless in any
# log that captures it. No durable credential is read, printed, or stored.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/agent-harness/preview-session.sh
source "$REPO_ROOT/scripts/agent-harness/preview-session.sh"

# shellcheck source=scripts/agent-harness/shared-servers.sh
source "$REPO_ROOT/scripts/agent-harness/shared-servers.sh"

# `pnpm dev-login [--clone] [/next/path]` — `--clone` signs in on the clone
# preview (port 3002, <session>-clone.localhost), whose own cookie jar and
# nonce files never touch the live preview's.
SERVER=live
NEXT_PATH=/dashboard
for arg in "$@"; do
  case "$arg" in
    --clone) SERVER=clone ;;
    *) NEXT_PATH="$arg" ;;
  esac
done

STATE_DIR="${MATRX_PREVIEW_STATE_DIR:-${TMPDIR:-/tmp}/matrx-frontend-preview-${UID:-$(id -u)}}"
META="$STATE_DIR/$(shared_server_state_stem "$SERVER").meta"

PORT="$(sed -n 's/^PORT=//p' "$META" 2>/dev/null | head -1)"
[[ -n "$PORT" ]] || PORT="$(shared_server_port "$SERVER")"

HOST="$(shared_server_host "$SERVER" "$(preview_session_label "$REPO_ROOT")")"

command -v openssl >/dev/null 2>&1 || { echo "[dev-login] ERROR: openssl is required" >&2; exit 1; }
NONCE="$(openssl rand -hex 16)"
# The nonce file is keyed by the nonce itself as well as the host, so a second
# `pnpm dev-login` for this same host (another subagent, or a re-run) mints an
# independent file and cannot overwrite this one's pending mint.
NONCE_FILE="$REPO_ROOT/$(preview_nonce_file "$HOST" "$NONCE")"
printf '%s\n' "$NONCE" >"$NONCE_FILE" || { echo "[dev-login] ERROR: could not write $NONCE_FILE" >&2; exit 1; }

echo "[dev-login] host   : $HOST  (your session's own cookie jar, $SERVER preview)"
echo "[dev-login] nonce  : $(basename "$NONCE_FILE")  (single use, consumed on any presentation)"
echo "[dev-login] OPEN   : http://$HOST:$PORT/api/dev-login?nonce=$NONCE&next=$NEXT_PATH"
