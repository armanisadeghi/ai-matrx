#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# night-argv-self-test.sh — NO NIGHT JOB PUTS A DATABASE PASSWORD IN A COMMAND LINE.
#
# 🚨 THE INCIDENT (2026-09-23, NIGHT-RECOVERY). During the branch refresh's 63-minute restore, `ps`
# showed the rehearsal branch's DSN — password included — on the restore `psql`'s argv. Every
# process on this machine can read another's argv. `night_dsn_args` had been built the day before
# to stop exactly that, but only ONE call site (the clone pg_dump) used it; every
# `"$PSQL" "$BRANCH_DSN"` and `"$PSQL" "$SRC_DSN"` still carried `postgresql://user:PASSWORD@…`.
# The class fix is in lib-night.sh: the DSN helpers return NO password (it goes to a per-run
# PGPASSFILE, mode 600, removed on exit), and nothing in this directory exports PGPASSWORD.
#
# THIS GUARD, which is what makes that a fix and not a promise:
#   1. A DRY RUN THROUGH A RECORDING SHIM. `psql` and `pg_dump` are replaced by a shim that writes
#      its full argv — exactly what `ps` would show — to a 0600 log, then execs the real binary.
#      Through it run: the census `--check` (a real read-only job, dozens of psql calls against the
#      clone) and an exercise of every connection shape the jobs use — the branch DSN (the restore's
#      shape), the clone DSN (the seed reads), `night_target_dsn`, `night_dsn_args`, and a
#      `pg_dump --schema-only` of one table on the clone (the dump's shape). Reads only; the clone
#      and the branch are never written, production is never contacted.
#   2. THE GREP: any recorded command line matching `password=` or `scheme://user:secret@` FAILS.
#      Values are never printed — only which binary, and how many.
#   3. THE PGPASS FILE: mode 600 while the job runs, and GONE after it exits.
#   4. STATIC: no script here other than lib-night.sh builds `://…:$…@` or exports PGPASSWORD.
#
#   (default)   RED against the PRE-FIX library (pinned revision below — must FAIL), then GREEN
#               against the working tree (must PASS). Exit 0 only when both hold.
#   --check     GREEN half only.
# ─────────────────────────────────────────────────────────────────────────────
set -u
FRONTEND=/Users/armanisadeghi/code/matrx-frontend
NIGHT="$FRONTEND/scripts/night"
# The last revision of lib-night.sh before the pgpass fix. The RED half runs THAT library and
# must be caught; if it is not, this guard cannot see the defect it exists for.
PRE_FIX_REV=87d179d8b1
MODE=selftest
[ "${1:-}" = "--check" ] && MODE=check

REAL_PSQL=/opt/homebrew/opt/libpq/bin/psql; [ -x "$REAL_PSQL" ] || REAL_PSQL=/opt/homebrew/opt/postgresql@17/bin/psql
REAL_PGDUMP="${REAL_PSQL:h}/pg_dump"

S="$(mktemp -d "${TMPDIR:-/tmp}/night-argv.XXXXXX")"; chmod 700 "$S"
trap '/bin/rm -rf -- "$S"' EXIT

mkdir -p "$S/shim"
for b in psql pg_dump; do
  real="$REAL_PSQL"; [ "$b" = pg_dump ] && real="$REAL_PGDUMP"
  cat > "$S/shim/$b" <<SHIM
#!/bin/zsh
print -r -- "$b \${(j: :)@}" >> "\$NIGHT_ARGV_LOG"
exec "$real" "\$@"
SHIM
  chmod 700 "$S/shim/$b"
done

# run_tree <tree dir> <label> -> 0 when clean, 1 when a password was seen (prints the verdict)
run_tree() {
  local T="$1" label="$2" log="$S/argv-$2.log" facts="$S/facts-$2" n bad=0
  ( umask 077; : > "$log"; : > "$facts" )
  # the exercise: every connection shape the jobs use, through the shim
  cat > "$T/exercise.sh" <<EX
source "$T/lib-night.sh"
night_resolve_psql >/dev/null || exit 78
PGDUMP="\${PSQL:h}/pg_dump"
BR="\$(night_branch_dsn)"; CL="\$(night_clone_dsn)"
night_assert_target branch "\$BR" >/dev/null || exit 78
night_assert_target clone  "\$CL" >/dev/null || exit 78
"\$PSQL" "\$BR" -qAt -c 'select 1' >/dev/null
"\$PSQL" "\$(night_target_dsn clone)" -qAt -c 'select 1' >/dev/null
night_dsn_args "\$CL" && PGPASSWORD="\${NIGHT_DSN_PASSWORD:-}" "\$PSQL" "\${NIGHT_DSN_ARGS[@]}" -qAt -c 'select 1' >/dev/null
"\$PGDUMP" "\$CL" --schema-only --no-owner -t platform.feature_knob -f /dev/null
print -r -- "pgpassfile=\${PGPASSFILE:-}" >> "$facts"
[ -n "\${PGPASSFILE:-}" ] && [ -f "\$PGPASSFILE" ] && print -r -- "mode=\$(stat -f %Lp "\$PGPASSFILE")" >> "$facts"
exit 0
EX
  NIGHT_ARGV_LOG="$log" PSQL="$S/shim/psql" zsh "$T/exercise.sh" >/dev/null 2>&1 || { print -r -- "  [$label] the exercise did not run (a target assertion refused); nothing judged"; return 2; }
  NIGHT_ARGV_LOG="$log" PSQL="$S/shim/psql" zsh "$T/branch-seed-census.sh" --check >/dev/null 2>&1
  n="$(grep -c . "$log")"
  local hits
  hits="$(grep -icE 'password=|://[^/@[:space:]]*:[^/@[:space:]]+@' "$log")"
  if [ "$hits" -gt 0 ]; then
    print -r -- "  [$label] $hits of $n recorded command line(s) CARRY A PASSWORD (values redacted):"
    grep -iE 'password=|://[^/@[:space:]]*:[^/@[:space:]]+@' "$log" | cut -d' ' -f1 | sort | uniq -c | while read -r c b; do print -r -- "      $c × $b"; done
    bad=1
  else
    print -r -- "  [$label] 0 of $n recorded command line(s) carry a password"
  fi
  local pf mode
  pf="$(sed -n 's/^pgpassfile=//p' "$facts")"; mode="$(sed -n 's/^mode=//p' "$facts")"
  if [ -n "$pf" ]; then
    [ "$mode" = "600" ] && print -r -- "  [$label] PGPASSFILE was mode 600 while the job ran" || { print -r -- "  [$label] PGPASSFILE mode was '${mode:-?}', not 600"; bad=1; }
    [ -e "$pf" ] && { print -r -- "  [$label] PGPASSFILE STILL EXISTS after the job exited"; bad=1; } || print -r -- "  [$label] PGPASSFILE removed on exit"
  else
    print -r -- "  [$label] no PGPASSFILE was set up"; bad=1
  fi
  # static: nothing but the library may assemble a password into a URL or export PGPASSWORD
  local st
  st="$(grep -nE '://[^"'"'"' ]*:\$\{?[A-Za-z_]+\}?@|export PGPASSWORD|^\s*PGPASSWORD=' "$T"/*.sh 2>/dev/null | grep -v '/lib-night.sh:' | grep -v '/exercise.sh:' | grep -v '/night-argv-self-test.sh:' | grep -vE ':[0-9]+:\s*#')"
  if [ -n "$st" ]; then
    print -r -- "  [$label] STATIC: $(print -r -- "$st" | grep -c .) line(s) outside lib-night.sh build a password into a URL or export PGPASSWORD:"
    print -r -- "$st" | sed "s#^$T/##" | cut -d: -f1,2 | sed 's/^/      /'
    bad=1
  else
    print -r -- "  [$label] STATIC: no script outside lib-night.sh builds a password URL or exports PGPASSWORD"
  fi
  return $bad
}

# make_tree <dir> <rev|WORKTREE> — the night scripts, re-pointed at that library
make_tree() {
  local T="$1" rev="$2" f
  mkdir -p "$T"
  for f in "$NIGHT"/*.sh; do
    if [ "$rev" = WORKTREE ]; then cp "$f" "$T/${f:t}"
    else git -C "$FRONTEND" show "${rev}:scripts/night/${f:t}" > "$T/${f:t}" 2>/dev/null || cp "$f" "$T/${f:t}"; fi
  done
  sed -i '' "s#source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh#source $T/lib-night.sh#" "$T"/*.sh
}

rc=0
if [ "$MODE" = selftest ]; then
  print -r -- "RED — the pre-fix library ($PRE_FIX_REV) must be caught:"
  make_tree "$S/red" "$PRE_FIX_REV"
  run_tree "$S/red" red; r=$?
  if [ $r -eq 1 ]; then print -r -- "RED ok: the guard caught the old pattern"
  else print -r -- "RED FAILED: the guard did not catch the pre-fix library (exit $r)"; rc=1; fi
fi
print -r -- "GREEN — the working tree must be clean:"
make_tree "$S/green" WORKTREE
run_tree "$S/green" green; g=$?
if [ $g -eq 0 ]; then print -r -- "GREEN ok"
else print -r -- "GREEN FAILED (exit $g)"; rc=1; fi
[ $rc -eq 0 ] && print -r -- "night-argv self-test PASSED" || print -r -- "night-argv self-test FAILED"
exit $rc
