#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# kernel-fingerprint-auto-rerecords.sh — did the provisioner re-record the access-kernel
# fingerprint by itself today, or refuse a table because the kernel moved?
#
# THE CLASS (lane PROVISIONER-SELF-HEAL, 2026-09-25). platform.provision refuses every table when
# iam.entity_read_kernel_fingerprint() moved without a re-record; on 2026-09-25 that refused ALL
# table creation on production for 83 minutes, twice, once from outside the program. Since
# selfheal_an_equivalent_kernel_is_re_recorded_by_the_provisioner.sql the provisioner runs the
# kernel's equivalence self-check on a mismatch and, when the kernel still answers identically,
# re-records the fingerprint ITSELF (platform.kernel_fingerprint_record + ops.system_error kind
# kernel_fingerprint_auto_rerecorded) and provisions. That is correct and it must still be SEEN:
# each auto re-record means some file changed a kernel body and forgot to say so.
#
# This job reports, read-only on production:
#   - every auto re-record in the last 24 hours (when, from -> to, the members that changed)
#   - every provisioner_fingerprint_stale refusal in the last 24 hours (the kernel really moved)
#   - whether the recorded fingerprint agrees with the live kernel right now
# and, on the nightly dev clone (writes allowed, always rolled back), whether the fixed fixture
# itself still answers what platform.kernel_equivalence_expected() recorded on a MATCHED kernel —
# a fixture gone stale would make every future heal refuse (fail closed, but nobody wants that).
#
# Usage:  scripts/night/kernel-fingerprint-auto-rerecords.sh [--self-test]
# Exit:   0 nothing to report · 1 at least one auto re-record, stale refusal, live mismatch or
#         fixture drift — named above · 2 a read failed · 78 refused.
# ─────────────────────────────────────────────────────────────────────────────
set -u
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

if [ "${1:-}" = "--self-test" ]; then
  night_resolve_psql >/dev/null && say "PASS psql resolves: $PSQL" || { say "FAIL psql does not resolve"; exit 1; }
  say "kernel-fingerprint-auto-rerecords self-test: GREEN"
  exit 0
fi
[ $# -eq 0 ] || { say "REFUSED: unknown argument '$1'."; exit 78; }

night_resolve_psql || exit $?

conn() {
  local which="$1"
  if [ "$which" = "production" ]; then
    prod_env() { grep -m1 "^SUPABASE_MATRIX_$1=" "$AIDREAM/.env" | cut -d= -f2- | tr -d '"'; }
    local P_USER P_HOST P_PORT P_DB P_PW
    P_USER="$(prod_env USER)"; P_HOST="$(prod_env HOST)"; P_PORT="$(prod_env PORT)"
    P_DB="$(prod_env DATABASE_NAME)"; P_PW="$(prod_env PASSWORD)"
    [ -n "$P_USER" ] && [ -n "$P_HOST" ] && [ -n "$P_PW" ] || { say "REFUSED: SUPABASE_MATRIX_* unreadable at $AIDREAM/.env."; return 78; }
    DB_ARGS=(-h "$P_HOST" -p "${P_PORT:-6543}" -U "$P_USER" -d "${P_DB:-postgres}")
    night_pgpass_add "$P_HOST" "${P_PORT:-6543}" "$P_USER" "$P_PW" || return 78
    night_assert_target_readonly production "${DB_ARGS[@]}" || return $?
  else
    local dsn; dsn="$(night_target_dsn clone)" || return 78
    night_dsn_args "$dsn" || return 78
    DB_ARGS=("${NIGHT_DSN_ARGS[@]}")
    night_assert_target clone "${DB_ARGS[@]}" || return $?
  fi
}

RC=0

conn production || exit $?
REPORT_SQL="select coalesce(string_agg(line, E'\\n' order by at), '') from (
  select r.recorded_at at, 'AUTO RE-RECORD ' || to_char(r.recorded_at, 'YYYY-MM-DD HH24:MI:SS') || 'Z  '
         || coalesce(r.fingerprint_from, '?') || ' -> ' || r.fingerprint_to || '  asked for ' || coalesce(r.target, '?')
         || '  changed: ' || coalesce(nullif(array_to_string(r.members_changed, ', '), ''), '(none named)')
         || '  system_error ' || coalesce(r.system_error_id::text, '?') as line
    from platform.kernel_fingerprint_record r where r.recorded_at > now() - interval '24 hours'
  union all
  select s.occurred_at, 'STALE REFUSAL  ' || to_char(s.occurred_at, 'YYYY-MM-DD HH24:MI:SS') || 'Z  '
         || left(s.error_text, 300) || '  system_error ' || s.id
    from ops.system_error s where s.kind = 'provisioner_fingerprint_stale' and s.occurred_at > now() - interval '24 hours'
  union all
  select now(), 'LIVE MISMATCH  the recorded fingerprint ' || iam.entity_read_kernel_expected()
         || ' is not the live ' || iam.entity_read_kernel_fingerprint() || ' — the next table request will run the self-check'
   where iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected()
) x"
OUT="$(night_readonly_psql "${DB_ARGS[@]}" --sql "$REPORT_SQL" 2>&1)" || { say "READ FAILED on production: $(print -r -- "$OUT" | head -3)"; exit 2; }
if [ -z "$OUT" ]; then
  say "kernel fingerprint (production): 0 auto re-records, 0 stale refusals in 24h; recorded = live"
else
  RC=1
  say "kernel fingerprint (production), last 24h:"
  print -r -- "$OUT" | while IFS= read -r l; do say "  $l"; done
  say "  Each AUTO RE-RECORD means a file changed an access-kernel body without re-recording; the kernel"
  say "  answered identically so tables kept being created. Refresh aidream db/entity_read_kernel_members.json."
fi

# The fixture on a MATCHED kernel, on the clone (it builds its world in a rolled-back subtransaction).
conn clone || exit $?
FIX="$("$PSQL" "${DB_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c "begin; select case
    when iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then 'skipped: the clone kernel is not matched'
    when to_regproc('platform.kernel_equivalence_check') is null then 'skipped: platform.kernel_equivalence_check is not on the clone'
    else (select case when (c->>'ok')::boolean then 'ok ' || (c->>'answers') || ' answers, ' || (c->>'ms') || ' ms'
                      else 'DRIFT ' || (c - 'read_lane')::text end from (select platform.kernel_equivalence_check() c) q) end;
  rollback;" 2>&1)" || { say "READ FAILED on the clone: $(print -r -- "$FIX" | head -3)"; exit 2; }
FIX="$(print -r -- "$FIX" | grep -v '^BEGIN\|^ROLLBACK' | tail -1)"
say "kernel equivalence fixture (clone, matched kernel): $FIX"
case "$FIX" in
  DRIFT*) RC=1
    say "  The fixture no longer answers what was recorded on a kernel nobody moved: re-derive"
    say "  platform.kernel_equivalence_expected() from select platform.kernel_equivalence_answers() in a campaign file." ;;
esac

say "kernel-fingerprint RESULT: $([ $RC -eq 0 ] && print 'nothing to report' || print 'reported above')"
exit $RC
