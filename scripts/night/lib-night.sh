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
CLONE_REF_FILE=/Users/armanisadeghi/code/common-docs/operations/clone/CLONE-REF

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

# The nightly dev clone's DSN. CLONE_DATABASE_URL wins; otherwise it is assembled from the
# checked-in CLONE-REF (identities) plus the password file CLONE-REF names (never printed).
night_clone_dsn() {
  if [ -n "${CLONE_DATABASE_URL:-}" ]; then print -r -- "$CLONE_DATABASE_URL"; return 0; fi
  local h p u d pf pw
  h="$(night_ref_key "$CLONE_REF_FILE" pooler_host)"
  p="$(night_ref_key "$CLONE_REF_FILE" pooler_port)"
  u="$(night_ref_key "$CLONE_REF_FILE" pooler_user)"
  d="$(night_ref_key "$CLONE_REF_FILE" database)"
  pf="$(night_ref_key "$CLONE_REF_FILE" password_file)"
  [ -n "$h" ] && [ -n "$u" ] && [ -r "$pf" ] || return 1
  pw="$(tr -d '\n' < "$pf")"
  print -r -- "postgresql://${u}:${pw}@${h}:${p:-6543}/${d:-postgres}"
}

# ── a DSN that does not sit in the process table ─────────────────────────────
# 🚨 A PASSWORD PASSED AS argv IS PUBLIC. `pg_dump "postgresql://user:pass@host/db"` prints the
# whole DSN, password included, in `ps aux` for every process on the machine, for as long as the
# dump runs — and a schema dump of this estate runs for TEN MINUTES. Measured 2026-09-22 while
# watching the clone refresh: the clone's database password was plainly readable in `ps` output.
# Sub-second psql calls have the same hole but a far smaller window; a long-lived pg_dump is the
# one that matters, so it takes its connection APART.
#
# night_dsn_args <dsn> sets two GLOBALS and prints nothing: the array NIGHT_DSN_ARGS
# (`-h … -p … -U … -d …`) and NIGHT_DSN_PASSWORD, which the caller exports as PGPASSWORD and
# then clears. It deliberately does NOT print the args for `$(…)` capture — a command
# substitution runs in a subshell, so the password it set would be lost with it (measured here
# on the first cut, 2026-09-22). night_conn_ref still reads the project ref back from libpq, so
# the target assertion works identically on the split form — proven below in this same session.
night_dsn_args() {
  local dsn="$1" rest userinfo hostpart user pass host port db
  NIGHT_DSN_PASSWORD=""
  typeset -ga NIGHT_DSN_ARGS; NIGHT_DSN_ARGS=()
  rest="${dsn#*://}"
  case "$rest" in
    *@*) userinfo="${rest%%@*}"; hostpart="${rest#*@}" ;;
    *)   userinfo=""; hostpart="$rest" ;;
  esac
  user="${userinfo%%:*}"; pass="${userinfo#*:}"; [ "$pass" = "$userinfo" ] && pass=""
  db="${hostpart#*/}"; db="${db%%\?*}"; hostpart="${hostpart%%/*}"
  host="${hostpart%%:*}"; port="${hostpart#*:}"; [ "$port" = "$host" ] && port=5432
  [ -n "$host" ] && [ -n "$user" ] || return 1
  NIGHT_DSN_PASSWORD="$pass"
  NIGHT_DSN_ARGS=(-h "$host" -p "$port" -U "$user" -d "${db:-postgres}")
  return 0
}

# night_assert_target branch|production|clone <psql args…>
#
# 🚨 A SYSTEM IDENTIFIER IS NOT AN IDENTITY. A Supabase DATA branch (`with_data: true`) is a
# PHYSICAL restore of production's cluster, so the nightly dev clone answers
# `pg_control_system().system_identifier` with production's own number (measured 2026-09-22,
# common-docs/operations/clone/CURRENT.md § the identity trap). Keyed on that number alone this
# assertion said "target ok: production" while connected to the clone — and would have said it
# just as happily the other way round.
#
# So the target is (system_identifier, PROJECT REF) TOGETHER, and the project ref comes from the
# CONNECTION, not from the server: the Supabase pooler user is `postgres.<ref>` and the direct
# host is `db.<ref>.supabase.co`. psql reports both back from libpq (\echo :USER / :HOST), which
# works whether the caller passed a DSN string or -h/-p/-U/-d.
#
# Both halves are read from checked-in reference files — BRANCH-REF (branch + production) and
# CLONE-REF (today's clone) — so a rebuilt branch or a fresh nightly clone needs no edit here.
night_ref_key() {  # night_ref_key <file> <key>
  [ -r "$1" ] || return 1
  grep -m1 "^[[:space:]]*$2[[:space:]]*=" "$1" | sed -E 's/^[^=]*= *//' | tr -d ' \r'
}

# The project ref a psql connection is actually pointed at, from the connection itself.
night_conn_ref() {  # night_conn_ref <psql args…>
  local u h
  u="$("$PSQL" "$@" -qAt -c '\echo :USER' 2>/dev/null | tail -1 | tr -d ' \r')"
  h="$("$PSQL" "$@" -qAt -c '\echo :HOST' 2>/dev/null | tail -1 | tr -d ' \r')"
  case "$u" in
    *.*) print -r -- "${u#*.}"; return 0 ;;
  esac
  case "$h" in
    db.*.supabase.co|db.*.supabase.com) h="${h#db.}"; print -r -- "${h%%.*}"; return 0 ;;
    *.supabase.co|*.supabase.com)       print -r -- "${h%%.*}"; return 0 ;;
  esac
  print -r -- ""
}

night_assert_target() {
  local want="$1"; shift
  local branch_id prod_id clone_id branch_ref prod_ref clone_ref
  local want_id want_ref got got_ref label
  branch_id="$(night_ref_key "$BRANCH_REF_FILE" system_identifier)"
  prod_id="$(night_ref_key "$BRANCH_REF_FILE" parent_system_identifier)"
  branch_ref="$(night_ref_key "$BRANCH_REF_FILE" branch_ref)"
  prod_ref="$(night_ref_key "$BRANCH_REF_FILE" parent_ref)"
  if [ -z "$branch_id" ] || [ -z "$prod_id" ] || [ -z "$branch_ref" ] || [ -z "$prod_ref" ]; then
    say "REFUSED: BRANCH-REF is missing or unreadable ($BRANCH_REF_FILE). Nothing attempted."
    return 78
  fi

  case "$want" in
    branch)     want_id="$branch_id"; want_ref="$branch_ref"; label="the rehearsal branch" ;;
    production) want_id="$prod_id";   want_ref="$prod_ref";   label="production" ;;
    clone)
      clone_id="$(night_ref_key "$CLONE_REF_FILE" system_identifier)"
      clone_ref="$(night_ref_key "$CLONE_REF_FILE" clone_ref)"
      if [ -z "$clone_id" ] || [ -z "$clone_ref" ]; then
        say "REFUSED: CLONE-REF is missing or unreadable ($CLONE_REF_FILE). A connection that"
        say "  cannot be PROVEN to be the clone is never treated as the clone. Nothing attempted."
        return 78
      fi
      want_id="$clone_id"; want_ref="$clone_ref"; label="the nightly dev clone" ;;
    *) say "REFUSED: night_assert_target got an unknown target '$want'."; return 78 ;;
  esac

  got="$("$PSQL" "$@" -qAt -c 'select system_identifier from pg_control_system()' 2>&1 | tr -d ' ')"
  got_ref="$(night_conn_ref "$@")"

  if [ "$got" != "$want_id" ] || [ "$got_ref" != "$want_ref" ]; then
    local what="an unknown database"
    [ "$got" = "$prod_id" ]   && [ "$got_ref" = "$prod_ref" ]   && what="PRODUCTION"
    [ "$got" = "$branch_id" ] && [ "$got_ref" = "$branch_ref" ] && what="the rehearsal branch"
    [ -n "${clone_ref:-}" ] && [ "$got_ref" = "$clone_ref" ]    && what="the dev CLONE"
    [ -z "${clone_ref:-}" ] && clone_ref="$(night_ref_key "$CLONE_REF_FILE" clone_ref)"
    [ -n "$clone_ref" ] && [ "$got_ref" = "$clone_ref" ]        && what="the dev CLONE"
    say "REFUSED: this run intends $label and the server is $what."
    say "  a target is (system_identifier, project ref) TOGETHER — a data clone reports its"
    say "  parent production system_identifier, so the number alone is not an identity."
    say "  expected  $want_id / $want_ref"
    say "  answered  ${got:-(no answer)} / ${got_ref:-(no project ref in the connection)}"
    say "  Nothing attempted."
    return 78
  fi
  say "target ok: $want (system_identifier $got, project ref $got_ref)"
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
