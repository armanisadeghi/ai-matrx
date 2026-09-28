#!/usr/bin/env bash
#
# shared-servers.sh — the TWO named shared dev servers, for bash. Sourcing starts nothing.
#
#   live  — `pnpm preview:start`          port 3001, dist .next-preview        live database
#   clone — `pnpm preview:start --clone`  port 3002, dist .next-preview-clone  the clone only
#
# Arman allowed exactly one server (2026-09-24) and then exactly one more, the clone preview
# (2026-09-27). Never a third, never a per-agent server. The JS twin that next.config.js
# enforces is scripts/agent-harness/shared-dev-servers.cjs; the Jest guard
# scripts/__tests__/shared-dev-servers.test.ts pins that the two tables agree.

shared_server_port() {
  case "$1" in live) echo 3001 ;; clone) echo 3002 ;; *) return 1 ;; esac
}

shared_server_distdir() {
  case "$1" in live) echo .next-preview ;; clone) echo .next-preview-clone ;; *) return 1 ;; esac
}

# The MATRX_SHARED_PREVIEW value next.config.js accepts for this server.
shared_server_token() {
  case "$1" in live) echo 1 ;; clone) echo clone ;; *) return 1 ;; esac
}

# The lease/log/ready file stem inside the machine-wide state dir.
shared_server_state_stem() {
  case "$1" in live) echo shared-next-dev ;; clone) echo shared-next-dev-clone ;; *) return 1 ;; esac
}

# The session's hostname on this server. ONE label under .localhost on purpose: aidream's CORS
# admits exactly one label (app_config.CORS_DEFAULT_ORIGIN_REGEX), and a separate label gives
# the clone its own cookie jar, so a live sign-in and a clone sign-in never share cookies.
shared_server_host() { # shared_server_host <server> <session-label>
  case "$1" in live) printf '%s.localhost' "$2" ;; clone) printf '%s-clone.localhost' "$2" ;; *) return 1 ;; esac
}

# The flag a user types to address this server.
shared_server_flag() {
  case "$1" in live) printf '' ;; clone) printf ' --clone' ;; *) return 1 ;; esac
}

# Labels (agent-preview / agent-preview-clone / human-or-other) come from
# `matrx-preview-ports.sh list-any`, which is self-contained because install.sh copies it alone.

# THE SLOT RULE, for two named servers. stdin: "PID PORT LABEL" lines (list-any). Prints the
# lines that occupy <server>'s slot: every dev server EXCEPT the other named server running on
# its own port. So the live slot is free while only the clone runs and vice versa, and any
# third server — human `pnpm dev`, a per-agent server, a named server on a foreign port —
# occupies BOTH slots, which is what keeps a third server from ever coexisting with two.
shared_server_slot_occupants() { # shared_server_slot_occupants <server>
  local other other_port other_label
  case "$1" in
    live) other=clone; other_label=agent-preview-clone ;;
    clone) other=live; other_label=agent-preview ;;
    *) return 1 ;;
  esac
  other_port="$(shared_server_port "$other")"
  awk -v p="$other_port" -v l="$other_label" 'NF >= 3 && !($2 == p && $3 == l)'
}
