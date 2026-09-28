#!/usr/bin/env bash
#
# preview-session.sh — ONE preview server, ONE hostname per agent session.
#
# THE WALL THIS CLOSES (W56, 2026-09-12). Five agent sessions drove
# http://localhost:3001 / :3000 on this machine at once. Cookies are scoped to a
# HOST, never to a port, so every one of those tabs shared a single cookie jar:
# the moment one session ran /api/dev-login, every other session's tab was
# signed in as somebody else. The app noticed and paused itself ("Account
# Changed — this browser is now signed in as test@test.com …"), which is exactly
# right and also the end of that agent's half-typed form. Running the servers on
# different PORTS does nothing; only a different HOST gets a different jar.
#
# THE FIX: each session opens the SAME server at its OWN hostname.
#
#   session A -> http://s3f1eb9c52.localhost:3001
#   session B -> http://s70c1d4ae.localhost:3001
#
# `*.localhost` resolves to loopback with no /etc/hosts entry (RFC 6761; macOS
# resolves it in the system resolver — verified 2026-09-12 with getaddrinfo,
# which returns 127.0.0.1 and ::1 for an arbitrary label), and browsers treat
# each label as its own origin, so each session gets its own cookie jar, its own
# storage, and its own dev-login nonce. The server is unchanged: one process,
# one port, one lease — this is a naming layer, NOT a second dev server. The
# machine-wide one-dev-server rule (a second Next tree is a reliable OOM here)
# still holds, unconditionally.
#
# Sourced by scripts/agent-dev-server.sh and by scripts/check-preview-session.mjs.
# Sourcing it starts nothing.

# The raw session identity, as reported by whatever agent runtime is driving.
# MATRX_PREVIEW_SESSION is the override an operator (or a self-test) can set to
# name a session deliberately; everything else is discovery.
#
# 🚨 CLAUDE_CODE_SESSION_ID MUST BE CHECKED BEFORE CLAUDE_CODE_HOST_SESSION_ID
# (found 2026-09-26, several parallel subagents clobbering each other's
# dev-login). CLAUDE_CODE_HOST_SESSION_ID names the top-level Claude Desktop
# session — it is IDENTICAL for every subagent a parent session dispatches in
# parallel, because they are all still "the same host session" from the
# runtime's point of view. CLAUDE_CODE_SESSION_ID is the one that is actually
# unique per dispatched agent (it is also what names that agent's own
# scratchpad directory), including a subagent running beside its siblings
# under one parent. Checking the host id first meant every subagent under one
# session landed on the SAME `<label>.localhost`, so they shared one cookie
# jar and one nonce file exactly like the pre-W56 defect this file exists to
# fix — one agent's dev-login evicted the others' sessions and burned their
# nonce mid-handshake. `CLAUDE_SESSION_ID` (no "CODE") is kept as a fallback
# name for a runtime that sets that spelling instead.
preview_session_raw() {
  local raw=""
  for candidate in \
    "${MATRX_PREVIEW_SESSION:-}" \
    "${CLAUDE_CODE_SESSION_ID:-}" \
    "${CLAUDE_SESSION_ID:-}" \
    "${CLAUDE_CODE_HOST_SESSION_ID:-}" \
    "${CODEX_SESSION_ID:-}" \
    "${CODEX_THREAD_ID:-}"; do
    if [[ -n "$candidate" ]]; then
      raw="$candidate"
      break
    fi
  done
  # Last resort: the checkout itself. Two sessions in ONE checkout then share a
  # hostname — they also share the code, so the failure mode is the old one, not
  # a worse one — and the start banner says so out loud rather than pretending.
  [[ -n "$raw" ]] || raw="checkout:${1:-$PWD}"
  printf '%s' "$raw"
}

# True when the label had to be derived from the checkout because no agent
# runtime named the session. Callers warn on this; nothing silently degrades.
preview_session_is_anonymous() {
  [[ -z "${MATRX_PREVIEW_SESSION:-}${CLAUDE_CODE_SESSION_ID:-}${CLAUDE_SESSION_ID:-}${CLAUDE_CODE_HOST_SESSION_ID:-}${CODEX_SESSION_ID:-}${CODEX_THREAD_ID:-}" ]]
}

# A DNS label: lowercase, [a-z0-9-], never leading/trailing '-', never empty,
# never starting with a digit (some resolvers and some cookie code paths get
# unhappy). An operator-supplied MATRX_PREVIEW_SESSION is used as written when
# it already is a clean label, so `MATRX_PREVIEW_SESSION=watson` really does
# give you watson.localhost; anything else collapses to a stable md5 slug.
preview_session_label() {
  local raw cleaned
  raw="$(preview_session_raw "${1:-$PWD}")"
  cleaned="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')"
  cleaned="${cleaned##-}"
  cleaned="${cleaned%%-}"
  if [[ -n "${MATRX_PREVIEW_SESSION:-}" && "$cleaned" =~ ^[a-z][a-z0-9-]{0,30}$ ]]; then
    printf '%s' "$cleaned"
    return 0
  fi
  printf 's%s' "$(printf '%s' "$raw" | md5 -q 2>/dev/null || printf '%s' "$raw" | md5sum | awk '{print $1}')" |
    cut -c1-9
}

# The full hostname this session opens the preview at.
preview_session_host() {
  printf '%s.localhost' "$(preview_session_label "${1:-$PWD}")"
}

# The full URL, including the port the ONE managed server is listening on.
preview_session_url() {
  printf 'http://%s:%s' "$(preview_session_host "${2:-$PWD}")" "${1:-3001}"
}

# The dev-login nonce file. Must stay in exact agreement with
# app/api/dev-login/route.ts — the guard app/api/dev-login/route.test.ts pins
# the shape, and scripts/check-preview-session.mjs pins that the two agree.
#
# It is now keyed by HOST *and* by the nonce itself, not just the host
# (2026-09-26). One file per host meant a SECOND `pnpm dev-login` for the same
# host overwrote the first mint's file before its URL was ever opened — which
# is exactly what several parallel subagents landing on the same host (or one
# agent re-running the command) do to each other: the earlier mint's nonce
# silently stops matching anything and its printed URL 401s. Folding the nonce
# into the filename means concurrent mints for one host are independent files
# that never collide, while a wrong guess still can't touch a real pending
# mint (it hashes out to a filename nothing wrote). Called with one argument
# it returns the legacy host-only shape (used where no nonce is known yet).
preview_nonce_file() {
  local host="${1:-localhost}" nonce="${2:-}"
  if [[ -n "$nonce" ]]; then
    printf '.dev-login-nonce.%s.%s' "$host" "$nonce"
  else
    printf '.dev-login-nonce.%s' "$host"
  fi
}
