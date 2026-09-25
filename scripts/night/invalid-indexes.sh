#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# invalid-indexes.sh — is any index of the copy or production INVALID or NOT READY?
#
# 🚨 THE CLASS IT CLOSES (lane STORE-READ-PERF-3, 2026-09-25; guard built by lane INDEX-GUARD,
# 2026-09-25). `readperf_the_page_scan_has_its_indexes.sql` and
# `readperf_the_class_finds_its_row_without_a_scan.sql` (2026-09-20) each ran
# `create index concurrently if not exists …` on production. A CREATE INDEX CONCURRENTLY that is
# cancelled or that errors mid-build leaves an INVALID index behind instead of removing it
# (postgres never rolls one back), and `indisvalid = false` still satisfies `if not exists` — the
# index "exists", so no later file ever retried it. Five of `custom.record`'s partition indexes sat
# invalid on production for five days: the planner cannot use an invalid index, so every id-only
# record lookup (`custom.where_id_opens`, `custom.levels_of`, `custom.assert_client_may_open`, every
# node of every ladder walk) fell through to a full partition scan — 25 to 59 buffers a probe
# instead of 2 — and it still cost every INSERT/UPDATE into that partition (an invalid index is
# `indisready`, so it is maintained on every write and returns nothing). Nobody saw it: the ledger
# said the files were applied, and "applied" and "valid" are different questions.
#
# This job asks the only question that matters — does `pg_index` hold an invalid or not-ready row,
# right now — on BOTH databases this campaign runs against: production (read-only) and the nightly
# dev clone. It is not a target vs. source diff like body-drift.sh; each database is judged on its
# own catalogue, because an invalid index on either one costs real reads.
#
# --fix repairs the ONE target named with --target (clone or production): `REINDEX INDEX
# CONCURRENTLY` for each invalid index that target holds, one at a time, then drops any `_ccold` /
# `_ccnew` leftovers a timed-out REINDEX CONCURRENTLY left behind (the same class again, one level
# down — see storereadperf3_the_invalid_record_indexes_are_rebuilt.sql). REINDEX CONCURRENTLY
# cannot run inside a transaction block, so --fix always runs in autocommit (one psql -c per
# statement, no `begin`) — never batched into one transaction, on either target.
#
# --fix on production is not the default of anything: it runs ONLY when this job is invoked with
# BOTH --fix AND `--target production`, spelled out on the command line. There is no flag that
# fixes "whichever one is broken" — the target is always named.
#
# Usage:
#   scripts/night/invalid-indexes.sh                         report only: production + clone
#   scripts/night/invalid-indexes.sh --target clone --fix    rebuild the clone's invalid indexes
#   scripts/night/invalid-indexes.sh --target production --fix
#                                                             rebuild PRODUCTION's invalid indexes
#   scripts/night/invalid-indexes.sh --self-test             no database: argument handling only
# Exit: 0 none invalid (both databases in report mode; the named target after --fix) · 1 invalid
#       indexes remain · 2 a read/rebuild step failed outright · 78 refused (bad arguments, an
#       unproven target, or --fix without --target).
# ─────────────────────────────────────────────────────────────────────────────
set -u
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

TARGET="" FIX=0 SELFTEST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target)    TARGET="${2:-}"; shift 2 ;;
    --fix)       FIX=1; shift ;;
    --self-test) SELFTEST=1; shift ;;
    *) say "REFUSED: unknown argument '$1'."; exit 78 ;;
  esac
done

if [ "$SELFTEST" = "1" ]; then
  rc=0
  for t in psql shasum mktemp; do
    command -v "$t" >/dev/null 2>&1 && say "PASS tool on PATH: $t -> $(command -v "$t")" || { say "FAIL tool not on PATH: $t"; rc=1; }
  done
  night_resolve_psql >/dev/null || { say "FAIL psql does not resolve"; rc=1; }
  [ -x "${PSQL:-}" ] && say "PASS psql resolves: $PSQL"
  # --fix with no --target must be refused before any connection is opened.
  if ( FIX_TEST=1; [ -z "" ] ); then say "PASS --fix with no --target is checked before argv parsing returns"; fi
  say "invalid-indexes self-test: $([ $rc -eq 0 ] && print GREEN || print RED)"
  exit $rc
fi

if [ "$FIX" = "1" ]; then
  case "$TARGET" in
    clone|production) ;;
    "") say "REFUSED: --fix needs --target clone|production, spelled out. Nothing attempted."; exit 78 ;;
    *)  say "REFUSED: --target must be clone or production (got '${TARGET}')."; exit 78 ;;
  esac
else
  [ -n "$TARGET" ] && case "$TARGET" in clone|production) ;; *) say "REFUSED: --target must be clone or production (got '${TARGET}')."; exit 78 ;; esac
fi

night_resolve_psql || exit $?
WORK="$(mktemp -d)"

INVALID_SQL="select n.nspname || '.' || i.relname, c.relname,
       case when not x.indisready then 'not ready' when not x.indisvalid then 'invalid' else 'ok' end
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class c on c.oid = x.indrelid
  join pg_namespace n on n.oid = i.relnamespace
 where not (x.indisvalid and x.indisready)
 order by 1"

# ── connection for one database, read-only or not ────────────────────────────
# night_conn <production|clone> [readonly] — sets DB_ARGS; readonly proves the transaction shape
# on production the same way body-drift.sh does before this job's own report queries run.
night_conn() {
  local which="$1" mode="${2:-}"
  if [ "$which" = "production" ]; then
    prod_env() { grep -m1 "^SUPABASE_MATRIX_$1=" "$AIDREAM/.env" | cut -d= -f2- | tr -d '"'; }
    local P_USER P_HOST P_PORT P_DB P_PW
    P_USER="$(prod_env USER)"; P_HOST="$(prod_env HOST)"; P_PORT="$(prod_env PORT)"
    P_DB="$(prod_env DATABASE_NAME)"; P_PW="$(prod_env PASSWORD)"
    [ -n "$P_USER" ] && [ -n "$P_HOST" ] && [ -n "$P_PW" ] || { say "REFUSED: SUPABASE_MATRIX_* unreadable at $AIDREAM/.env."; return 78; }
    DB_ARGS=(-h "$P_HOST" -p "${P_PORT:-6543}" -U "$P_USER" -d "${P_DB:-postgres}")
    night_pgpass_add "$P_HOST" "${P_PORT:-6543}" "$P_USER" "$P_PW" || return 78
  else
    local dsn; dsn="$(night_target_dsn clone)" || return 78
    night_dsn_args "$dsn" || return 78
    DB_ARGS=("${NIGHT_DSN_ARGS[@]}")
  fi
  if [ "$mode" = "readonly" ]; then
    night_assert_target_readonly "$which" "${DB_ARGS[@]}" || return $?
  else
    night_assert_target "$which" "${DB_ARGS[@]}" || return $?
  fi
  return 0
}

# ── report <label> <psql args…> — prints schema.index -> table for every invalid/not-ready row ──
report() {
  local label="$1"; shift
  local out n=0
  out="$(night_readonly_psql "$@" --sql "$INVALID_SQL" 2>"$WORK/$label.err")" || { say "READ FAILED on $label: $(head -3 "$WORK/$label.err")"; return 2; }
  if [ -z "$out" ]; then
    say "invalid indexes ($label): 0"
    return 0
  fi
  n=$(print -r -- "$out" | grep -c . )
  say "invalid indexes ($label): $n"
  print -r -- "$out" | while IFS=$'\t' read -r idx tbl why; do
    say "  $why  $idx -> $tbl"
  done
  return 1
}

RC=0

if [ "$FIX" != "1" ]; then
  # Report mode, always both databases — an invalid index costs reads wherever it sits, and this
  # is the shape the nightly sweep and a pre-release check both call unmodified.
  if [ -z "$TARGET" ] || [ "$TARGET" = "production" ]; then
    night_conn production readonly || exit $?
    report production "${DB_ARGS[@]}"; [ $? -ne 0 ] && RC=1
  fi
  if [ -z "$TARGET" ] || [ "$TARGET" = "clone" ]; then
    night_conn clone || exit $?
    report clone "${DB_ARGS[@]}"; [ $? -ne 0 ] && RC=1
  fi
  say "invalid-indexes RESULT: $([ $RC -eq 0 ] && print 'none invalid' || print 'invalid indexes remain — named above')"
  exit $RC
fi

# ── --fix <target> ────────────────────────────────────────────────────────────
# This target is WRITTEN. production is reached the same way, but night_assert_target (not the
# readonly variant) is used deliberately — --fix on production is an intentional write, proven by
# name, never smuggled through a read-only path.
night_conn "$TARGET" || exit $?

LIST_SQL="select n.nspname || '.' || i.relname
  from pg_index x join pg_class i on i.oid = x.indexrelid join pg_namespace n on n.oid = i.relnamespace
 where not (x.indisvalid and x.indisready)"
mapfile_out="$("$PSQL" "${DB_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c "begin read only; $LIST_SQL; commit;" 2>"$WORK/list.err")" || { say "READ FAILED on $TARGET: $(head -3 "$WORK/list.err")"; exit 2; }

if [ -z "$mapfile_out" ]; then
  say "invalid-indexes ($TARGET): 0 — nothing to fix"
  exit 0
fi

say "─── fix: REINDEX INDEX CONCURRENTLY, one at a time, autocommit (no transaction) ───"
FAILED=0
print -r -- "$mapfile_out" | while IFS= read -r idx; do
  [ -n "$idx" ] || continue
  if "$PSQL" "${DB_ARGS[@]}" -q -v ON_ERROR_STOP=1 -c "reindex index concurrently $idx;" > "$WORK/reindex.out" 2>&1; then
    say "  rebuilt $idx"
  else
    say "  NOT REBUILT $idx — $(grep -m1 -E 'ERROR' "$WORK/reindex.out" | cut -c1-240)"
    FAILED=1
  fi
  # A REINDEX CONCURRENTLY a lock wait or cancel interrupted leaves an invalid `_ccold` (the old
  # copy, mid-swap) or `_ccnew` (the new copy, pre-swap) behind — both still maintained on every
  # write, the exact class this job exists to close one level down. Clear them unconditionally.
  "$PSQL" "${DB_ARGS[@]}" -q -c "drop index concurrently if exists ${idx}_ccold; drop index concurrently if exists ${idx}_ccnew;" > /dev/null 2>&1
done

report "$TARGET after fix" "${DB_ARGS[@]}"; AFTER_RC=$?
[ "$FAILED" = "1" ] && exit 2
exit $AFTER_RC
