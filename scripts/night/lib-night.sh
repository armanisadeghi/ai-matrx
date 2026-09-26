#!/bin/zsh
# launchd starts every night job with a bare PATH (/usr/bin:/bin:/usr/sbin:/sbin). The tools
# these jobs call — timeout, pg_dump, psql, node, pnpm — live under Homebrew, and on 2026-09-23
# the 01:05 branch refresh died at its first pg_dump with "command not found: timeout" (exit 78)
# before touching anything. Every job sources this file first, so the PATH is set once, here.
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/opt/homebrew/opt/postgresql@17/bin:$HOME/.local/bin:$PATH"
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
#
# 🚨 CHAIR RULING 2026-09-22: THE WINDOW GUARD EXISTS TO PROTECT PRODUCTION. A job whose only
# read is the CLONE and whose only write is the BRANCH touches production nowhere, so it is
# EXEMPT from the 01:00-03:30 window and may run at any hour. It says so in its log.
#
# THIS IS NOT A FORCE SWITCH, and it cannot be turned into one — there is no flag, no variable
# and no argument that grants the exemption. The ONLY way to earn it is to have PROVEN, through
# `night_assert_target`, that every database this run will touch is the clone or the branch,
# each by (system identifier, project ref) together. So:
#   · production among the proven targets  -> the window is ENFORCED;
#   · NOTHING proven yet                   -> the window is ENFORCED (fail closed: a run that
#                                             has not identified its databases cannot claim to
#                                             be off production);
#   · every proven target is clone/branch  -> exempt, and the log names them.
# A job that wants the exemption therefore calls night_window_guard AFTER its assertions, which
# is the correct order anyway: you cannot know you are off production before you have checked.
typeset -ga NIGHT_PROVEN; NIGHT_PROVEN=()

night_window_guard() {
  local open="$1" close="$2"
  local hhmm="$(TZ=America/Los_Angeles date +%H%M)" today="$(TZ=America/Los_Angeles date +%F)"
  if [ "$REHEARSE" = "1" ]; then
    say "REHEARSAL: window $open-$close Pacific not enforced (this run cannot write production)"
    return 0
  fi
  if [ ${#NIGHT_PROVEN[@]} -gt 0 ] && [[ " ${NIGHT_PROVEN[*]} " != *" production "* ]]; then
    say "window $open-$close Pacific NOT ENFORCED, and here is why it does not apply: every"
    say "  database this run has proven is off production — ${(j:, :)NIGHT_PROVEN} — so the"
    say "  window, which exists to keep heavy work off the live instance, protects nothing here."
    say "  Local Pacific time is $today $hhmm. (Chair ruling 2026-09-22; earned only by proof.)"
    return 0
  fi
  if [ "$hhmm" -lt "$open" ] || [ "$hhmm" -gt "$close" ]; then
    say "REFUSED: local Pacific time is $today $hhmm, outside $open-$close. Nothing attempted."
    [ ${#NIGHT_PROVEN[@]} -eq 0 ] && say "  (No target has been proven yet, so the clone-to-branch exemption cannot apply.)"
    return 75
  fi
  say "window ok: Pacific $today $hhmm (window $open-$close)"
  return 0
}

# ── credentials: a pgpass file, never argv ───────────────────────────────────
# 🚨 A PASSWORD IN A COMMAND LINE IS PUBLIC. Every process on this machine can read another
# process's argv (`ps aux`), and on 2026-09-23 the branch's password was sitting in `ps` for the
# whole 63-minute restore, because `night_branch_dsn` handed back `postgresql://user:PASSWORD@…`
# and every `"$PSQL" "$BRANCH_DSN"` in this directory carried it. `night_dsn_args` had been built
# the day before to stop exactly that — for ONE call site (the clone pg_dump). An instance fix.
#
# THE CLASS FIX: the DSN helpers never return a password at all. `night_branch_dsn` and
# `night_clone_dsn` write the password into a PER-RUN pgpass file (dir 0700, file 0600, created
# when this library is sourced, exported as PGPASSFILE) and hand back `postgresql://user@host:port/db`.
# libpq finds the password there by (host, port, user); nothing in any command line carries it.
# A job that builds a connection of its own (the production reads) registers its password with
# `night_pgpass_add` — a zsh function, so the password never reaches another process's argv either.
#
# PGPASSWORD IS UNSET HERE and nothing in this directory sets it: it OUTRANKS pgpass, so one job
# that exported production's password and then opened a branch connection sent production's
# password to the branch (clone-catchup did this until 2026-09-23, toggling it by hand).
# The file is removed when the main shell exits — `zshexit` runs after the job's own EXIT trap and
# never in a `$(…)` subshell. A SIGKILLed job leaves it behind in its 0700 temp directory.
# Guard: `zsh scripts/night/night-argv-self-test.sh` (RED on the pre-fix library, then GREEN).
unset PGPASSWORD
if [ -z "${NIGHT_PGPASS_DIR:-}" ] || [ "${NIGHT_PGPASS_OWNER:-}" != "$$" ]; then
  NIGHT_PGPASS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/night-pgpass.XXXXXX")" || { print -r -- "REFUSED: no temp dir for the pgpass file."; exit 78; }
  NIGHT_PGPASS_OWNER=$$
  chmod 700 "$NIGHT_PGPASS_DIR"
  export PGPASSFILE="$NIGHT_PGPASS_DIR/pgpass"
  ( umask 077; : > "$PGPASSFILE" ); chmod 600 "$PGPASSFILE"
  _night_pgpass_cleanup() {
    (( ZSH_SUBSHELL == 0 )) || return 0
    [ -n "${NIGHT_PGPASS_DIR:-}" ] && [ -d "$NIGHT_PGPASS_DIR" ] && /bin/rm -rf -- "$NIGHT_PGPASS_DIR"
  }
  typeset -ga zshexit_functions
  zshexit_functions+=(_night_pgpass_cleanup)
fi

_night_urldecode() { setopt localoptions extendedglob; print -rn -- "${1//(#b)%([[:xdigit:]][[:xdigit:]])/${(#):-0x$match[1]}}"; }
_night_pgpass_escape() { local v="${1//\\/\\\\}"; print -rn -- "${v//:/\\:}"; }

# night_pgpass_add <host> <port> <user> <password> — register a password for that endpoint.
night_pgpass_add() {
  local line cur=""
  [ -n "${PGPASSFILE:-}" ] && [ -f "$PGPASSFILE" ] || return 1
  line="$(_night_pgpass_escape "$1"):$(_night_pgpass_escape "$2"):*:$(_night_pgpass_escape "$3"):$(_night_pgpass_escape "$4")"
  cur="$(<"$PGPASSFILE")"
  [[ $'\n'"$cur"$'\n' == *$'\n'"$line"$'\n'* ]] && return 0
  print -r -- "$line" >> "$PGPASSFILE"
}

# night_dsn_strip <postgresql://user:pass@host:port/db?opts> -> the same DSN with NO password,
# the password registered in PGPASSFILE. A DSN that carries no password passes through unchanged.
night_dsn_strip() {
  local dsn="$1" scheme rest userinfo hostpart user pass host port
  case "$dsn" in *://*) ;; *) print -r -- "$dsn"; return 0 ;; esac
  scheme="${dsn%%://*}"; rest="${dsn#*://}"
  case "$rest" in *@*) userinfo="${rest%%@*}"; hostpart="${rest#*@}" ;; *) print -r -- "$dsn"; return 0 ;; esac
  case "$userinfo" in *:*) ;; *) print -r -- "$dsn"; return 0 ;; esac
  user="${userinfo%%:*}"; pass="${userinfo#*:}"
  host="${hostpart%%[/?]*}"; port="${host##*:}"; [ "$port" = "$host" ] && port=5432; host="${host%%:*}"
  night_pgpass_add "$(_night_urldecode "$host")" "$port" "$(_night_urldecode "$user")" "$(_night_urldecode "$pass")" || return 1
  print -r -- "${scheme}://${user}@${hostpart}"
}

# ── the target ───────────────────────────────────────────────────────────────
# 🚨 THE REHEARSAL BRANCH WAS DELETED 2026-09-26 00:30Z (lane DB-TOOLS-NO-BRANCH). A job that asks
# for it is told so by name and gets nothing — never a stale SUPABASE_BRANCH_DATABASE_URL that
# would connect to nothing, or to whatever that variable is re-pointed at next. Rehearse on the
# clone (`night_target_dsn clone`); lock rows live on the clone (`night_lock_dsn`).
night_branch_dsn() {
  say "REFUSED: the rehearsal branch was deleted 2026-09-26; night_branch_dsn has no database to hand back."
  say "  Rehearse on the quarantined clone (night_target_dsn clone); build_lock rows live there (night_lock_dsn)."
  return 78
}

# The nightly dev clone's DSN. CLONE_DATABASE_URL wins; otherwise it is assembled from the
# checked-in CLONE-REF (identities) plus the password file CLONE-REF names (never printed).
night_clone_dsn() {
  if [ -n "${CLONE_DATABASE_URL:-}" ]; then night_dsn_strip "$CLONE_DATABASE_URL"; return $?; fi
  local h p u d pf pw
  h="$(night_ref_key "$CLONE_REF_FILE" pooler_host)"
  p="$(night_ref_key "$CLONE_REF_FILE" pooler_port)"
  u="$(night_ref_key "$CLONE_REF_FILE" pooler_user)"
  d="$(night_ref_key "$CLONE_REF_FILE" database)"
  pf="$(night_ref_key "$CLONE_REF_FILE" password_file)"
  [ -n "$h" ] && [ -n "$u" ] && [ -r "$pf" ] || return 1
  pw="$(<"$pf")"; pw="${pw//$'\n'/}"
  # The password goes into the pgpass file and NEVER into the string this prints.
  night_pgpass_add "$h" "${p:-6543}" "$u" "$pw" || return 1
  print -r -- "postgresql://${u}@${h}:${p:-6543}/${d:-postgres}"
}

# ── a DSN taken apart ────────────────────────────────────────────────────────
# night_dsn_args <dsn> sets two GLOBALS and prints nothing: the array NIGHT_DSN_ARGS
# (`-h … -p … -U … -d …`) and NIGHT_DSN_PASSWORD. Since 2026-09-23 the helpers above hand back
# DSNs that carry NO password (it is in PGPASSFILE), so NIGHT_DSN_PASSWORD is normally empty and
# nothing in this directory exports it. It deliberately does NOT print the args for `$(…)`
# capture — a command substitution runs in a subshell and its globals are lost with it.
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
  # A password that arrives here anyway goes to PGPASSFILE, never back to the caller.
  if [ -n "$pass" ]; then
    night_pgpass_add "$(_night_urldecode "$host")" "$port" "$(_night_urldecode "$user")" "$(_night_urldecode "$pass")" || return 1
  fi
  NIGHT_DSN_ARGS=(-h "$host" -p "$port" -U "$user" -d "${db:-postgres}")
  return 0
}

# ── the target list ──────────────────────────────────────────────────────────
# THE THREE TARGETS, NAMED ONCE. These are the same three the two migration runners take
# (`pnpm db:apply --target …`, `uv run python db/apply_migrations.py --target …`), so a
# night job names the nightly dev clone exactly the way an agent at a terminal does, and
# `night_target_dsn` hands back the connection each one is reached through:
#
#   branch      RETIRED 2026-09-26 — the rehearsal branch was deleted; refused by name
#   clone       the nightly dev clone          CLONE_DATABASE_URL, else CLONE-REF + its
#                                              password file — NEVER SUPABASE_MATRIX_*
#   production  the live database              the five SUPABASE_MATRIX_* (a job builds
#                                              that connection itself; there is no helper
#                                              here, deliberately)
#
# 🚨 `clone` IS NOT A SOFTER `production`. It is a PHYSICAL RESTORE of production and
# reports production's own system_identifier, so naming it is only safe because
# `night_assert_target` checks the project ref in the connection as well. Never assemble a
# clone connection by hand from SUPABASE_MATRIX_*; there is nothing in those five values
# that could tell you which of the two you got.
NIGHT_TARGETS="clone | production"

# night_target_dsn branch|clone — the DSN for a rehearsal target, or empty + non-zero.
# `production` deliberately has no entry: a job that means the live database says so in
# its own five variables, where a reader can see it.
night_target_dsn() {
  case "$1" in
    branch) night_branch_dsn; return 78 ;;
    clone)  night_clone_dsn ;;
    production)
      say "REFUSED: night_target_dsn has no production entry, deliberately — a job that means"
      say "  the live database builds that connection from its own SUPABASE_MATRIX_* values,"
      say "  where a reader can see it. Nothing attempted."
      return 78 ;;
    *)
      say "REFUSED: night_target_dsn got an unknown target '$1'. Known: $NIGHT_TARGETS."
      return 78 ;;
  esac
}

# night_assert_target branch|clone|production <psql args…>
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
  # PRODUCTION's identity is required for EVERY target: it is what names a wrong connection.
  # The branch keys are required only to target the branch. 🚨 lane PROVISION-BATCH-FIX,
  # 2026-09-26: the rehearsal branch was deleted at 00:30Z and BRANCH-REF now carries production's
  # two keys only; requiring all four refused EVERY night job (clone-catchup, body-drift, the
  # kernel-fingerprint report), clone targets included, "BRANCH-REF is missing or unreadable".
  if [ -z "$prod_id" ] || [ -z "$prod_ref" ]; then
    say "REFUSED: BRANCH-REF is missing or unreadable ($BRANCH_REF_FILE) — it must carry"
    say "  production's parent_system_identifier and parent_ref. Nothing attempted."
    return 78
  fi

  case "$want" in
    branch)
      if [ -z "$branch_id" ] || [ -z "$branch_ref" ]; then
        say "REFUSED: BRANCH-REF names no rehearsal branch ($BRANCH_REF_FILE says it was deleted)."
        say "  Rehearse on the clone: --target clone (common-docs/operations/clone/CURRENT.md)."
        say "  Nothing attempted."
        return 78
      fi
      want_id="$branch_id"; want_ref="$branch_ref"; label="the rehearsal branch" ;;
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
    *)
      say "REFUSED: night_assert_target got an unknown target '$want'."
      say "  The three this library knows are: $NIGHT_TARGETS."
      say "  They are the same three \`pnpm db:apply --target\` and \`uv run python"
      say "  db/apply_migrations.py --target\` know, so a night job names the clone exactly the"
      say "  way an agent at a terminal does. Nothing attempted."
      return 78 ;;
  esac

  got="$("$PSQL" "$@" -qAt -c 'select system_identifier from pg_control_system()' 2>&1 | tr -d ' ')"
  got_ref="$(night_conn_ref "$@")"

  if [ "$got" != "$want_id" ] || [ "$got_ref" != "$want_ref" ]; then
    local what="an unknown database"
    [ "$got" = "$prod_id" ]   && [ "$got_ref" = "$prod_ref" ]   && what="PRODUCTION"
    [ -n "$branch_ref" ] && [ "$got" = "$branch_id" ] && [ "$got_ref" = "$branch_ref" ] && what="the rehearsal branch"
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
  # Remembered so night_window_guard can tell a clone->branch run from one that touches the live
  # instance. ONLY a passing assertion writes here; nothing else may.
  [[ " ${NIGHT_PROVEN[*]} " == *" $want "* ]] || NIGHT_PROVEN+=("$want")
  return 0
}

# ── a target this run only READS ─────────────────────────────────────────────
# 🚨 SOME JOBS MUST READ PRODUCTION AND WRITE ONLY THE CLONE. The clone-catch-up step is the
# first: it computes its work from production's OWN migration ledger and applies to the clone.
# Asserting production with `night_assert_target` would record `production` in NIGHT_PROVEN and
# so re-arm the maintenance window — correctly, for a job that might WRITE production, and
# wrongly for one that cannot.
#
# "Cannot" is the operative word, and it is PROVEN, not promised. `night_readonly_psql` runs
# every statement inside `begin read only; … ; commit;`, and `night_assert_target_readonly`
# first makes the server itself demonstrate the refusal: it attempts a CREATE TABLE in exactly
# that transaction shape and requires PostgreSQL to raise 25006 (`read_only_sql_transaction`).
# Only then is the target recorded as `<target>(read-only)`, which the window guard reads as
# "this run cannot write that database".
#
# NOTE ON THE POOLER, measured 2026-09-22: `PGOPTIONS='-c default_transaction_read_only=on'` is
# SILENTLY DROPPED by Supavisor in transaction mode — `show default_transaction_read_only`
# answers `off` on a connection that was handed that option. A session-level setting is not a
# read-only proof here. An explicit `begin read only` is, because the refusal comes from the
# server on the same transaction the job's own reads run in.
night_readonly_psql() {  # night_readonly_psql <psql args…> --sql <one statement>
  local -a args; args=()
  while [ $# -gt 0 ] && [ "$1" != "--sql" ]; do args+=("$1"); shift; done
  [ "$1" = "--sql" ] || { say "REFUSED: night_readonly_psql needs --sql <statement>."; return 78; }
  shift
  "$PSQL" "${args[@]}" -qAt -v ON_ERROR_STOP=1 -c "begin read only; $1; commit;"
}

night_assert_target_readonly() {  # night_assert_target_readonly <target> <psql args…>
  local want="$1"; shift
  local probe rc
  probe="$("$PSQL" "$@" -qAt -v ON_ERROR_STOP=1 \
    -c "begin read only; create table public.night_readonly_probe_$$ (i int); rollback;" 2>&1)"
  rc=$?
  if [ $rc -eq 0 ] || [[ "$probe" != *"read-only transaction"* ]]; then
    say "REFUSED: this run intends to READ $want and nothing else, and the server did not"
    say "  refuse a write in the transaction shape this job uses. A read-only claim that the"
    say "  database does not enforce is a promise, and a promise is not a proof."
    say "  the probe answered: ${probe:-(it succeeded)}"
    say "  Nothing attempted."
    return 78
  fi
  night_assert_target "$want" "$@" || return $?
  # Re-label the entry night_assert_target just recorded: this run has proven WHICH database
  # it is AND that it cannot write it. Only this function may write the read-only form.
  local -a relabelled; relabelled=()
  local t
  for t in "${NIGHT_PROVEN[@]}"; do
    [ "$t" = "$want" ] && relabelled+=("$want(read-only)") || relabelled+=("$t")
  done
  NIGHT_PROVEN=("${relabelled[@]}")
  say "read-only proven: $want — the server refused a write in this job's own transaction shape"
  return 0
}

# ── the inverse gate ─────────────────────────────────────────────────────────
# night_inverse_gate <file> <sha256 proven on the clone by rule 27 (pnpm db:rehearse --target clone)>
night_inverse_gate() {
  local f="$1" proven="$2" now
  if [ ! -f "$f" ]; then say "REFUSED: the inverse file is missing ($f). Nothing attempted."; return 78; fi
  now="$(shasum -a 256 "$f" | cut -d' ' -f1)"
  if [ "$now" != "$proven" ]; then
    say "REFUSED: the inverse has changed since it was proven by rule 27."
    say "  proven: $proven"
    say "  on disk: $now"
    say "  Re-run rule 27 on the clone (pnpm db:rehearse <up> --target clone) and re-pin this hash. Nothing attempted."
    return 78
  fi
  say "inverse gate ok: $now (proven by rule 27)"
  return 0
}

# ── the lock ─────────────────────────────────────────────────────────────────
# 🚨 THE LOCK ROW LIVES ON THE DEV CLONE (lane DB-TOOLS-NO-BRANCH, 2026-09-25). It lived on the
# rehearsal branch until that branch was deleted (2026-09-26 00:30Z); every take here then read
# SUPABASE_BRANCH_DATABASE_URL and failed, so every locking night job refused. `pnpm db:rehearse`
# already takes its rows on the clone, and the clone carries campaign_watch.build_lock and the
# lease functions (it is a restore of production), so the clone is where every lock caller meets.
# One helper names it, so the next move is one line.
night_lock_dsn() { night_clone_dsn; }
#
# A LOCK ROW IS A LEASE (lane LOCK-HYGIENE, 2026-09-22). Three rows leaked on 2026-09-22:
# FIX-10A held `custom` for 20 minutes after its DONE report, STORE-TXN-3 held `platform` after
# its final report, and earlier the TAILS lane held `custom` for 18 hours — every one of them an
# hour of the next lane's night spent waiting on a lock nobody was using. A trap in the HOLDER
# cannot fix that, because a job that is SIGKILLed has no code left to run. So the TAKE and the
# RELEASE are now `campaign_watch.lock_take()` / `campaign_watch.lock_release()` — the same two
# functions `pnpm db:apply`, `pnpm db:rehearse` and `scripts/lib/borrow-live-switch.sh` call.
# A row whose 15-minute lease has lapsed is EXPIRED: the take evicts it and says whose it was
# and how old it was, in the database's own sentence, which is why this file prints that sentence
# instead of writing its own. A LIVE row still refuses, exactly as before.
#
# The functions ARE the contract: if they are absent (the lease migration has not landed on that
# database) the take fails loudly rather than falling back to a bare insert, because a lock with
# no lease is the defect wearing the fix's name.
LOCK_TAKEN=0
night_take_lock() {
  local lock="$1" lane="$2" note="$3" dsn outcome message
  dsn="$(night_lock_dsn)" || { say "REFUSED: could not reach the clone to take lock '$lock'. Nothing done."; return 75; }
  outcome="$("$PSQL" "$dsn" -qAt -F'|' -c \
    "select outcome, message from campaign_watch.lock_take('$lock', '$lane', '$note')" 2>&1)"
  message="${outcome#*|}"
  outcome="${outcome%%|*}"
  case "$outcome" in
    taken|evicted|renewed) : ;;
    *)
      say "REFUSED: could not take lock '$lock' — ${message:-$outcome}. Nothing done."
      return 75
      ;;
  esac
  LOCK_TAKEN=1; LOCK_NAME="$lock"; LOCK_LANE="$lane"
  say "$message"
  _night_heartbeat "$lock" "$lane" "$dsn"
  return 0
}

# THE LEASE MUST OUTLIVE THE JOB. A night job (the branch refresh, a suite sweep) routinely runs
# longer than the 15-minute lease, and a job whose own row lapses mid-run is a job the next lane
# is entitled to evict. So every take starts a background renewer that pushes the lease forward
# every five minutes. It needs no kill and no cleanup, which matters because both prompt in an
# unattended run: it stops ON ITS OWN the moment either
#   · the job's shell is gone (`kill -0 $$` fails — a SIGKILLed job's lease then lapses within
#     one lease, which is the whole point of having one), or
#   · the renew answers anything but `t` (the job released the row, or somebody else holds it).
_night_heartbeat() {
  local lock="$1" lane="$2" dsn="$3" parent=$$
  (
    while sleep "${NIGHT_LEASE_BEAT_SECONDS:-300}"; do
      kill -0 "$parent" 2>/dev/null || exit 0
      [ "$("$PSQL" "$dsn" -qAt -c "select campaign_watch.lock_renew('$lock', '$lane')" 2>/dev/null)" = "t" ] || exit 0
    done
  ) >/dev/null 2>&1 &!
}

# Push this job's lease forward. A long job calls it between steps; a job shorter than the lease
# never needs it. Returns non-zero — LOUDLY — when this job is no longer the holder, because that
# means somebody evicted or released the row while the work was running.
night_renew_lock() {
  [ "${LOCK_TAKEN:-0}" = "1" ] || return 0
  local out
  out="$("$PSQL" "$(night_lock_dsn)" -qAt -c \
    "select campaign_watch.lock_renew('$LOCK_NAME', '$LOCK_LANE')" 2>&1)"
  if [ "$out" = "t" ]; then return 0; fi
  say "WARNING: the lease for '$LOCK_NAME' renewed NOTHING — $LOCK_LANE is no longer the holder (${out:-0 rows})."
  return 1
}

night_release_lock() {
  [ "${LOCK_TAKEN:-0}" = "1" ] || return 0
  local out
  out="$("$PSQL" "$(night_lock_dsn)" -qAt -c \
    "select campaign_watch.lock_release('$LOCK_NAME', '$LOCK_LANE')" 2>&1)"
  if [ "$out" = "t" ]; then say "lock released: $LOCK_NAME / $LOCK_LANE"
  else say "lock release returned: ${out:-(0 rows — not the holder)}"; fi
  LOCK_TAKEN=0
}

# ── several locks at once ────────────────────────────────────────────────────
# A job that applies files across MORE THAN ONE schema holds one object-scoped lock
# per schema, because that is what the runners check and what another lane reads to
# know which objects are being worked on. `night_take_lock` carries ONE name in its
# state, so a job that needed three was re-implementing the take and the release in
# its own file — exactly what this library exists to stop (W1-ORG-APPLY, 2026-09-22).
#
# ALL OR NOTHING. If the second of three locks is held by another lane, the first is
# released again before the refusal returns: a job that cannot do its work must not
# leave a lock behind that stops the lane which can.
NIGHT_LOCKS_TAKEN=()
night_take_locks() {  # night_take_locks <lane> <note> <lock> [<lock> …]
  local lane="$1" note="$2"; shift 2
  local lock
  typeset -ga NIGHT_LOCKS_TAKEN; NIGHT_LOCKS_TAKEN=()
  # The lane is recorded BEFORE the first take, not after the last: the partial-release
  # path runs when take number two fails, and it needs to know whose rows to delete.
  # Set it afterwards and a refused job strands the lock it did get — measured here on
  # the first cut, W1-ORG-APPLY 2026-09-22, which left `context` held by a job that had
  # already refused.
  NIGHT_LOCKS_LANE="$lane"
  for lock in "$@"; do
    if ! night_take_lock "$lock" "$lane" "$note"; then
      say "REFUSED: could not take every lock this job needs; releasing the ones it had."
      night_release_locks
      return 75
    fi
    NIGHT_LOCKS_TAKEN+=("$lock")
    LOCK_TAKEN=0   # the plural form owns the release from here
  done
  say "locks taken: ${NIGHT_LOCKS_TAKEN[*]} / $lane"
  return 0
}

night_release_locks() {
  [ -n "${NIGHT_LOCKS_LANE:-}" ] || return 0
  [ "${#NIGHT_LOCKS_TAKEN[@]}" -gt 0 ] || return 0
  local lock out dsn; dsn="$(night_lock_dsn)"
  for lock in "${NIGHT_LOCKS_TAKEN[@]}"; do
    out="$("$PSQL" "$dsn" -qAt -c \
      "select campaign_watch.lock_release('$lock', '$NIGHT_LOCKS_LANE')" 2>&1)"
    if [ "$out" = "t" ]; then say "lock released: $lock / $NIGHT_LOCKS_LANE"
    else say "lock release returned for $lock: ${out:-(0 rows — not the holder)}"; fi
  done
  NIGHT_LOCKS_TAKEN=()
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
