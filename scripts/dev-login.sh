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

STATE_DIR="${MATRX_PREVIEW_STATE_DIR:-${TMPDIR:-/tmp}/matrx-frontend-preview-${UID:-$(id -u)}}"
META="$STATE_DIR/shared-next-dev.meta"
NEXT_PATH="${1:-/dashboard}"

PORT="$(sed -n 's/^PORT=//p' "$META" 2>/dev/null | head -1)"
[[ -n "$PORT" ]] || PORT=3001

HOST="$(preview_session_host "$REPO_ROOT")"
NONCE_FILE="$REPO_ROOT/$(preview_nonce_file "$HOST")"

command -v openssl >/dev/null 2>&1 || { echo "[dev-login] ERROR: openssl is required" >&2; exit 1; }
NONCE="$(openssl rand -hex 16)"
printf '%s\n' "$NONCE" >"$NONCE_FILE" || { echo "[dev-login] ERROR: could not write $NONCE_FILE" >&2; exit 1; }

echo "[dev-login] host   : $HOST  (your session's own cookie jar)"
echo "[dev-login] nonce  : $(basename "$NONCE_FILE")  (single use, consumed on any presentation)"
echo "[dev-login] OPEN   : http://$HOST:$PORT/api/dev-login?nonce=$NONCE&next=$NEXT_PATH"
