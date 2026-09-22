#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# lib-night.sh — the shared body of every unattended night job in this directory.
#
# 🚨 THE RULE THIS FILE EXISTS TO ENFORCE, and the incident that wrote it:
#
# On 2026-09-21 the row_versions index job carried `NIGHT_SWEEP_FORCE=1`, a switch that removed
# the maintenance-window guard and ran the REAL job. It was used to exercise an unrelated gate,
# and it applied a migration to the live database at 17:19 Pacific — eight hours outside the
# 1-4 AM window. The job was safe and the outcome was fine; THE SWITCH WAS THE DEFECT.
#
# So: A WINDOW-GUARDED JOB MAY NOT CARRY A SWITCH THAT REMOVES THE WINDOW AND RUNS THE REAL
# THING. There is exactly one override, `NIGHT_REHEARSE=1`, and it does not remove the window —
# it changes the DATABASE. In rehearsal mode a job may only ever reach the REHEARSAL BRANCH, and
# that is not taken on trust: `night_assert_target` asks the server for its own
# `pg_control_system().system_identifier` and compares it with the checked-in BRANCH-REF. A
# production connection string handed to a rehearsal run is REFUSED before anything happens,
# whatever variable it arrived in.
#
# Every night job in this directory sources this file and gets: the psql resolver, the window
# guard, the target assertion, the campaign_watch.build_lock take/release, the trap that releases
# and self-deletes on EVERY exit path, and the log.
# ─────────────────────────────────────────────────────────────────────────────
set -u

FRONTEND=/Users/armanisadeghi/code/matrx-frontend
AIDREAM=/Users/armanisadeghi/code/aidream
BRANCH_REF_FILE=/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF

REHEARSE="${NIGHT_REHEARSE:-0}"

say() { print -r -- "[$(date -u +%FT%TZ)] $*"; }

# ── psql ─────────────────────────────────────────────────────────────────────
night_resolve_psql() {
  PSQL="${PSQL:-}"
  [ -n "$PSQL" ] || PSQL=/opt/homebrew/opt/libpq/bin/psql
  [ -x "$PSQL" ] || PSQL=/opt/homebrew/opt/postgresql@17/bin/psql
  if [ ! -x "$PSQL" ]; then say "REFUSED: no psql binary found; nothing attempted."; return 78; fi
  say "psql: $PSQL"
  return 0
}

# ── the window ───────────────────────────────────────────────────────────────
# night_window_guard <open HHMM> <close HHMM>
# A REHEARSAL still prints the window it would have obeyed, and is allowed through it, because a
# rehearsal never touches the live database — the target assertion is what makes that true.
night_window_guard() {
  local open="$1" close="$2"
  local hhmm="$(TZ=America/Los_Angeles date +%H%M)" today="$(TZ=America/Los_Angeles date +%F)"
  if [ "$REHEARSE" = "1" ]; then
    say "REHEARSAL: window $open-$close Pacific not enforced (this run can only reach the branch)"
    return 0
  fi
  if [ "$hhmm" -lt "$open" ] || [ "$hhmm" -gt "$close" ]; then
    say "REFUSED: local Pacific time is $today $hhmm, outside $open-$close. Nothing attempted."
    return 75
  fi
  say "window ok: Pacific $today $hhmm (window $open-$close)"
  return 0
}

# ── the target ───────────────────────────────────────────────────────────────
night_branch_dsn() {
  grep -m1 '^SUPABASE_BRANCH_DATABASE_URL=' "$FRONTEND/.env.local" | cut -d= -f2- | tr -d '"'
}

# night_assert_target branch|production <psql args…>
# Asks the SERVER who it is. A rehearsal that has somehow been pointed at production, or a live
# run pointed at the branch, is refused here — before a lock is taken and before anything runs.
night_assert_target() {
  local want="$1"; shift
  local branch_id prod_id got
  branch_id="$(grep -m1 '^system_identifier' "$BRANCH_REF_FILE" | sed -E 's/.*= *//' | tr -d ' ')"
  prod_id="$(grep -m1 '^parent_system_identifier' "$BRANCH_REF_FILE" | sed -E 's/.*= *//' | tr -d ' ')"
  if [ -z "$branch_id" ] || [ -z "$prod_id" ]; then
    say "REFUSED: BRANCH-REF is missing or unreadable ($BRANCH_REF_FILE). Nothing attempted."
    return 78
  fi
  got="$("$PSQL" "$@" -qAt -c 'select system_identifier from pg_control_system()' 2>&1 | tr -d ' ')"
  case "$want" in
    branch)
      if [ "$got" != "$branch_id" ]; then
        say "REFUSED: a rehearsal may only reach the rehearsal branch."
        say "  expected the branch  $branch_id"
        say "  the server answered  ${got:-(no answer)}$([ "$got" = "$prod_id" ] && print -n '  ← THIS IS PRODUCTION')"
        say "  Nothing attempted."
        return 78
      fi ;;
    production)
      if [ "$got" != "$prod_id" ]; then
        say "REFUSED: this run intends production and the server is not production."
        say "  expected  $prod_id   the server answered  ${got:-(no answer)}"
        say "  Nothing attempted."
        return 78
      fi ;;
    *) say "REFUSED: night_assert_target got an unknown target '$want'."; return 78 ;;
  esac
  say "target ok: $want (server system_identifier $got)"
  return 0
}

# ── the inverse gate ─────────────────────────────────────────────────────────
# night_inverse_gate <file> <sha256 proven on the branch by rule 27>
night_inverse_gate() {
  local f="$1" proven="$2" now
  if [ ! -f "$f" ]; then say "REFUSED: the inverse file is missing ($f). Nothing attempted."; return 78; fi
  now="$(shasum -a 256 "$f" | cut -d' ' -f1)"
  if [ "$now" != "$proven" ]; then
    say "REFUSED: the inverse has changed since it was proven on the branch."
    say "  proven: $proven"
    say "  on disk: $now"
    say "  Re-run rule 27 on the branch and re-pin this hash. Nothing attempted."
    return 78
  fi
  say "inverse gate ok: $now (proven on the branch by rule 27)"
  return 0
}

# ── the lock ─────────────────────────────────────────────────────────────────
# The lock row always lives on the REHEARSAL BRANCH — that is what the runners check.
LOCK_TAKEN=0
night_take_lock() {
  local lock="$1" lane="$2" note="$3" dsn take holder
  dsn="$(night_branch_dsn)"
  take="$("$PSQL" "$dsn" -qAt -c \
    "insert into campaign_watch.build_lock (lock_name, held_by, note) values ('$lock', '$lane', '$note') on conflict (lock_name) do nothing returning held_by" 2>&1)"
  if [ "$take" != "$lane" ]; then
    holder="$("$PSQL" "$dsn" -qAt -c "select held_by||' since '||taken_at from campaign_watch.build_lock where lock_name='$lock'" 2>&1)"
    say "REFUSED: could not take lock '$lock' — held by ${holder:-unknown}. Nothing done."
    return 75
  fi
  LOCK_TAKEN=1; LOCK_NAME="$lock"; LOCK_LANE="$lane"
  say "lock taken: $lock / $lane"
  return 0
}

night_release_lock() {
  [ "${LOCK_TAKEN:-0}" = "1" ] || return 0
  local out
  out="$("$PSQL" "$(night_branch_dsn)" -qAt -c \
    "delete from campaign_watch.build_lock where lock_name = '$LOCK_NAME' and held_by = '$LOCK_LANE' returning held_by" 2>&1)"
  if [ "$out" = "$LOCK_LANE" ]; then say "lock released: $LOCK_NAME / $LOCK_LANE"
  else say "lock release returned: ${out:-(0 rows — not the holder)}"; fi
  LOCK_TAKEN=0
}

# ── self-destruct ────────────────────────────────────────────────────────────
# A one-shot removes itself so it can never fire twice. A REHEARSAL never touches the plist.
night_self_destruct() {
  local label="$1" plist="$HOME/Library/LaunchAgents/${1}.plist"
  if [ "$REHEARSE" = "1" ]; then say "REHEARSAL: leaving the plist alone"; return 0; fi
  if [ -f "$plist" ]; then
    launchctl bootout "gui/$(id -u)/${label}" >/dev/null 2>&1 || launchctl unload "$plist" >/dev/null 2>&1 || true
    /bin/rm -f "$HOME/Library/LaunchAgents/${label}.plist" && say "plist unloaded and removed: $plist"
  else
    say "plist already gone: $plist"
  fi
}
