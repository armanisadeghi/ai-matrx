#!/bin/sh
# Prints ONE checked-in target identity, read from the plan files — never typed into a suite.
# Called from _preamble.sql's backticks, and usable from any script.
#
#   _branch-sysid.sh [branch_sysid|branch_ref|prod_sysid|prod_ref|clone_ref|clone_sysid]
#
# With no argument it prints `branch_sysid`, which is what it has always printed.
#
# 🚨 WHY MORE THAN THE SYSID. A Supabase DATA branch is a physical restore and reports the SAME
# `pg_control_system().system_identifier` as production, so the nightly dev clone is
# indistinguishable from production by that number alone (measured 2026-09-22). The identity that
# separates them is the CONNECTION's project ref — the pooler user is `postgres.<ref>` and the
# direct host is `db.<ref>.supabase.co`. Callers compare BOTH.
#
# A missing or unreadable file is a REFUSAL, not a fallback: each key prints its own sentinel
# (`BRANCH-REF-UNREADABLE` / `CLONE-REF-UNREADABLE`) which no real value can equal, so an unknown
# database can never be silently treated as a known one.
set -u

KEY="${1:-branch_sysid}"

_read_key() {  # _read_key <file> <key>
  sed -n "s/^[[:space:]]*$2[[:space:]]*=[[:space:]]*\([^[:space:]][^[:space:]]*\).*/\1/p" "$1" 2>/dev/null | head -1
}

_find() {  # _find <env-var-name> <relative path tail>
  eval "v=\${$1:-}"
  if [ -n "${v:-}" ]; then printf '%s' "$v"; return 0; fi
  for d in \
    "../common-docs/$2" \
    "$(dirname "$0")/../../../common-docs/$2" \
    "/Users/armanisadeghi/code/common-docs/$2"
  do
    [ -n "$d" ] && [ -r "$d" ] && { printf '%s' "$d"; return 0; }
  done
  return 1
}

case "$KEY" in
  branch_sysid|branch_ref|prod_sysid|prod_ref)
    f="$(_find MATRX_BRANCH_REF 'projects/data-doctrine-adoption/plan/BRANCH-REF')" || {
      printf 'BRANCH-REF-UNREADABLE'; exit 0; }
    case "$KEY" in
      branch_sysid) v="$(_read_key "$f" system_identifier)" ;;
      branch_ref)   v="$(_read_key "$f" branch_ref)" ;;
      prod_sysid)   v="$(_read_key "$f" parent_system_identifier)" ;;
      prod_ref)     v="$(_read_key "$f" parent_ref)" ;;
    esac
    [ -n "${v:-}" ] || { printf 'BRANCH-REF-UNREADABLE'; exit 0; }
    printf '%s' "$v" ;;
  clone_ref|clone_sysid)
    f="$(_find MATRX_CLONE_REF 'operations/clone/CLONE-REF')" || {
      printf 'CLONE-REF-UNREADABLE'; exit 0; }
    case "$KEY" in
      clone_ref)   v="$(_read_key "$f" clone_ref)" ;;
      clone_sysid) v="$(_read_key "$f" system_identifier)" ;;
    esac
    [ -n "${v:-}" ] || { printf 'CLONE-REF-UNREADABLE'; exit 0; }
    printf '%s' "$v" ;;
  *)
    printf 'UNKNOWN-KEY-%s' "$KEY" ;;
esac
